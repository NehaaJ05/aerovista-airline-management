-- =====================================================================
-- AeroVista — Airline Booking & Revenue Intelligence
-- MySQL 8.0+ relational schema  (v2)
--
-- * Fresh install : creates every table, view, trigger, function,
--                   procedure and event.
-- * Existing v1 DB: upgrades it IN PLACE (adds the new columns,
--                   constraints and indexes) — no table is dropped and
--                   no row is deleted.
-- Safe to re-run any number of times.
--
-- Run:   mysql -u root -p < database/schema.sql
-- =====================================================================

CREATE DATABASE IF NOT EXISTS airline_intelligence
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE airline_intelligence;

-- ---------------------------------------------------------------------
-- 1. Users and passengers
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  user_id       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(190) NOT NULL UNIQUE,
  phone         VARCHAR(30),
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('PASSENGER','ADMIN') NOT NULL DEFAULT 'PASSENGER',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS passengers (
  passenger_id   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        BIGINT UNSIGNED NOT NULL UNIQUE,
  loyalty_tier   ENUM('STANDARD','SILVER','GOLD','PLATINUM') NOT NULL DEFAULT 'STANDARD',
  loyalty_points INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_passenger_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 2. Fleet: airports, aircraft, routes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS airports (
  airport_id   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  airport_code CHAR(3) NOT NULL UNIQUE,
  city         VARCHAR(100) NOT NULL,
  airport_name VARCHAR(160) NOT NULL
);

CREATE TABLE IF NOT EXISTS aircraft (
  aircraft_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  registration_no VARCHAR(30) NOT NULL UNIQUE,
  total_seats     INT UNSIGNED NOT NULL,
  model           VARCHAR(100) NOT NULL,
  CONSTRAINT chk_aircraft_seats CHECK (total_seats > 0)
);

CREATE TABLE IF NOT EXISTS routes (
  route_id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  origin_airport_id      BIGINT UNSIGNED NOT NULL,
  destination_airport_id BIGINT UNSIGNED NOT NULL,
  distance_km            DECIMAL(8,2) NOT NULL,
  CONSTRAINT fk_route_origin      FOREIGN KEY (origin_airport_id)      REFERENCES airports(airport_id),
  CONSTRAINT fk_route_destination FOREIGN KEY (destination_airport_id) REFERENCES airports(airport_id),
  CONSTRAINT chk_route_airports   CHECK (origin_airport_id <> destination_airport_id),
  CONSTRAINT chk_route_distance   CHECK (distance_km > 0),
  UNIQUE KEY uq_route_pair (origin_airport_id, destination_airport_id)
);

-- ---------------------------------------------------------------------
-- 3. Flights and fares
-- flight_fares.sold_seats is the AUTHORITATIVE inventory counter and is
-- only ever changed by the booking triggers. flights.available_seats is
-- the static capacity of the aircraft (kept from the ER model).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flights (
  flight_id       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  flight_number   VARCHAR(12) NOT NULL,
  route_id        BIGINT UNSIGNED NOT NULL,
  aircraft_id     BIGINT UNSIGNED NOT NULL,
  departure_time  DATETIME NOT NULL,
  arrival_time    DATETIME NOT NULL,
  departure_date  DATE GENERATED ALWAYS AS (CAST(departure_time AS DATE)) STORED,
  available_seats INT UNSIGNED NOT NULL,
  fuel_cost       DECIMAL(12,2) NOT NULL DEFAULT 0,
  status          ENUM('SCHEDULED','DELAYED','CANCELLED','COMPLETED') NOT NULL DEFAULT 'SCHEDULED',
  CONSTRAINT fk_flight_route    FOREIGN KEY (route_id)    REFERENCES routes(route_id),
  CONSTRAINT fk_flight_aircraft FOREIGN KEY (aircraft_id) REFERENCES aircraft(aircraft_id),
  CONSTRAINT chk_flight_times   CHECK (arrival_time > departure_time),
  CONSTRAINT chk_flight_cost    CHECK (fuel_cost >= 0),
  UNIQUE KEY uq_flight_number_date (flight_number, departure_date),
  INDEX idx_flight_departure (departure_time),
  INDEX idx_flight_route_departure (route_id, departure_time),
  INDEX idx_flight_departure_date (departure_date),
  INDEX idx_flight_status (status)
);

-- Fare families. The refund columns ARE the refund policy: they are read
-- by fn_refund_amount() / sp_cancel_booking(), never by application code.
CREATE TABLE IF NOT EXISTS fare_classes (
  fare_class_id      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_code         VARCHAR(20) NOT NULL UNIQUE,
  class_name         VARCHAR(60) NOT NULL,
  refundable         BOOLEAN NOT NULL DEFAULT FALSE,
  refund_pct         DECIMAL(5,2) NOT NULL DEFAULT 0,   -- cancelled >= 24 h before departure
  late_refund_pct    DECIMAL(5,2) NOT NULL DEFAULT 0,   -- cancelled <  24 h before departure
  cabin_baggage_kg   TINYINT UNSIGNED NOT NULL DEFAULT 7,
  checkin_baggage_kg TINYINT UNSIGNED NOT NULL DEFAULT 15,
  meal_included      BOOLEAN NOT NULL DEFAULT FALSE,
  priority_boarding  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order         TINYINT UNSIGNED NOT NULL DEFAULT 1,
  CONSTRAINT chk_fc_refund_range CHECK (refund_pct BETWEEN 0 AND 100 AND late_refund_pct BETWEEN 0 AND refund_pct),
  CONSTRAINT chk_fc_refundable   CHECK ((refundable = 1 AND refund_pct > 0) OR (refundable = 0 AND refund_pct = 0))
);

CREATE TABLE IF NOT EXISTS flight_fares (
  flight_fare_id  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  flight_id       BIGINT UNSIGNED NOT NULL,
  fare_class_id   BIGINT UNSIGNED NOT NULL,
  current_fare    DECIMAL(12,2) NOT NULL,
  allocated_seats INT UNSIGNED NOT NULL,
  sold_seats      INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_fare_flight FOREIGN KEY (flight_id)     REFERENCES flights(flight_id) ON DELETE CASCADE,
  CONSTRAINT fk_fare_class  FOREIGN KEY (fare_class_id) REFERENCES fare_classes(fare_class_id),
  CONSTRAINT chk_fare_price CHECK (current_fare >= 0),
  CONSTRAINT chk_fare_seats CHECK (sold_seats <= allocated_seats),
  UNIQUE KEY uq_flight_fare_class (flight_id, fare_class_id),
  UNIQUE KEY uq_fare_flight_pair (flight_fare_id, flight_id),          -- target of the composite FK below
  INDEX idx_fare_available (flight_id, sold_seats, allocated_seats)
);

-- ---------------------------------------------------------------------
-- 4. Bookings, payments, cancellations
-- 1 booking -> 0..1 payment -> 0..1 cancellation (UNIQUE booking_id).
-- fk_booking_fare_flight is a COMPOSITE foreign key: a booking can only
-- reference a fare that belongs to the same flight it references.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  booking_id        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           BIGINT UNSIGNED NOT NULL,
  flight_id         BIGINT UNSIGNED NOT NULL,
  flight_fare_id    BIGINT UNSIGNED NOT NULL,
  booking_reference CHAR(10) NOT NULL UNIQUE,
  booking_status    ENUM('PENDING','CONFIRMED','CANCELLED','COMPLETED') NOT NULL DEFAULT 'PENDING',
  total_amount      DECIMAL(12,2) NOT NULL,
  booked_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_booking_user        FOREIGN KEY (user_id)        REFERENCES users(user_id),
  CONSTRAINT fk_booking_flight      FOREIGN KEY (flight_id)      REFERENCES flights(flight_id),
  CONSTRAINT fk_booking_fare        FOREIGN KEY (flight_fare_id) REFERENCES flight_fares(flight_fare_id),
  CONSTRAINT fk_booking_fare_flight FOREIGN KEY (flight_fare_id, flight_id)
                                    REFERENCES flight_fares(flight_fare_id, flight_id),
  CONSTRAINT chk_booking_amount CHECK (total_amount >= 0),
  INDEX idx_booking_user_date (user_id, booked_at),
  INDEX idx_booking_flight_status (flight_id, booking_status),
  INDEX idx_booking_status (booking_status)
);

CREATE TABLE IF NOT EXISTS payments (
  payment_id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id            BIGINT UNSIGNED NOT NULL UNIQUE,       -- one payment per booking
  amount                DECIMAL(12,2) NOT NULL,
  payment_type          ENUM('CARD','UPI','NETBANKING','DEMO') NOT NULL DEFAULT 'DEMO',
  payment_status        ENUM('PENDING','SUCCESS','FAILED','REFUNDED','PARTIALLY_REFUNDED') NOT NULL DEFAULT 'PENDING',
  transaction_reference VARCHAR(100),
  paid_at               TIMESTAMP NULL,
  CONSTRAINT fk_payment_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
  CONSTRAINT chk_payment_amount CHECK (amount >= 0),
  INDEX idx_payment_status (payment_status),
  INDEX idx_payment_paid_at (paid_at)
);

CREATE TABLE IF NOT EXISTS cancellations (
  cancellation_id   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id        BIGINT UNSIGNED NOT NULL UNIQUE,           -- one cancellation per booking
  refund_amount     DECIMAL(12,2) NOT NULL DEFAULT 0,
  cancellation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason            VARCHAR(255),
  cancelled_by      BIGINT UNSIGNED NULL,
  cancellation_type ENUM('PASSENGER','ADMIN','FLIGHT_CANCELLED') NOT NULL DEFAULT 'PASSENGER',
  refund_policy     VARCHAR(120) NULL,
  CONSTRAINT fk_cancel_booking FOREIGN KEY (booking_id)   REFERENCES bookings(booking_id),
  CONSTRAINT fk_cancel_actor   FOREIGN KEY (cancelled_by) REFERENCES users(user_id),
  CONSTRAINT chk_refund        CHECK (refund_amount >= 0),
  INDEX idx_cancellation_date (cancellation_date)
);

-- Audit trail written ONLY by the booking triggers: every +1 / -1 on a
-- fare's sold_seats is recorded here, so seat-inventory movements can be
-- shown and verified during the demo.
CREATE TABLE IF NOT EXISTS seat_inventory_log (
  log_id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  flight_fare_id BIGINT UNSIGNED NOT NULL,
  booking_id     BIGINT UNSIGNED NOT NULL,
  change_qty     TINYINT NOT NULL,
  sold_after     INT UNSIGNED NOT NULL,
  action         ENUM('SEAT_SOLD','SEAT_RELEASED') NOT NULL,
  logged_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_log_fare    FOREIGN KEY (flight_fare_id) REFERENCES flight_fares(flight_fare_id) ON DELETE CASCADE,
  CONSTRAINT fk_log_booking FOREIGN KEY (booking_id)     REFERENCES bookings(booking_id) ON DELETE CASCADE,
  CONSTRAINT chk_log_qty    CHECK (change_qty IN (-1, 1)),
  INDEX idx_log_fare (flight_fare_id, logged_at)
);

-- =====================================================================
-- 5. In-place upgrade of a v1 database
-- CREATE TABLE IF NOT EXISTS above does nothing for tables that already
-- exist, so the helpers below add whatever the old schema is missing.
-- Each helper checks information_schema first => re-runnable.
-- =====================================================================
DROP PROCEDURE IF EXISTS av_add_column;
DROP PROCEDURE IF EXISTS av_add_index;
DROP PROCEDURE IF EXISTS av_add_constraint;

DELIMITER $$
CREATE PROCEDURE av_add_column(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_ddl TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column) THEN
    SET @av_sql = CONCAT('ALTER TABLE ', p_table, ' ADD COLUMN ', p_ddl);
    PREPARE av_stmt FROM @av_sql; EXECUTE av_stmt; DEALLOCATE PREPARE av_stmt;
  END IF;
END$$

CREATE PROCEDURE av_add_index(IN p_table VARCHAR(64), IN p_index VARCHAR(64), IN p_ddl TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_index) THEN
    SET @av_sql = CONCAT('ALTER TABLE ', p_table, ' ADD ', p_ddl);
    PREPARE av_stmt FROM @av_sql; EXECUTE av_stmt; DEALLOCATE PREPARE av_stmt;
  END IF;
END$$

CREATE PROCEDURE av_add_constraint(IN p_table VARCHAR(64), IN p_name VARCHAR(64), IN p_ddl TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND CONSTRAINT_NAME = p_name) THEN
    SET @av_sql = CONCAT('ALTER TABLE ', p_table, ' ADD CONSTRAINT ', p_name, ' ', p_ddl);
    PREPARE av_stmt FROM @av_sql; EXECUTE av_stmt; DEALLOCATE PREPARE av_stmt;
  END IF;
END$$
DELIMITER ;

-- flights
CALL av_add_column('flights', 'departure_date',
  'departure_date DATE GENERATED ALWAYS AS (CAST(departure_time AS DATE)) STORED AFTER arrival_time');
CALL av_add_index('flights', 'uq_flight_number_date', 'UNIQUE KEY uq_flight_number_date (flight_number, departure_date)');
CALL av_add_index('flights', 'idx_flight_departure_date', 'INDEX idx_flight_departure_date (departure_date)');

-- fare_classes: policy + benefit columns
CALL av_add_column('fare_classes', 'refund_pct',         'refund_pct DECIMAL(5,2) NOT NULL DEFAULT 0');
CALL av_add_column('fare_classes', 'late_refund_pct',    'late_refund_pct DECIMAL(5,2) NOT NULL DEFAULT 0');
CALL av_add_column('fare_classes', 'cabin_baggage_kg',   'cabin_baggage_kg TINYINT UNSIGNED NOT NULL DEFAULT 7');
CALL av_add_column('fare_classes', 'checkin_baggage_kg', 'checkin_baggage_kg TINYINT UNSIGNED NOT NULL DEFAULT 15');
CALL av_add_column('fare_classes', 'meal_included',      'meal_included BOOLEAN NOT NULL DEFAULT FALSE');
CALL av_add_column('fare_classes', 'priority_boarding',  'priority_boarding BOOLEAN NOT NULL DEFAULT FALSE');
CALL av_add_column('fare_classes', 'sort_order',         'sort_order TINYINT UNSIGNED NOT NULL DEFAULT 1');
-- Give pre-existing v1 fare classes their policy BEFORE the CHECKs are added.
UPDATE fare_classes SET refund_pct = 0,   late_refund_pct = 0,  cabin_baggage_kg = 7,  checkin_baggage_kg = 15,
                        meal_included = 0, priority_boarding = 0, sort_order = 1, refundable = 0
 WHERE class_code = 'ECO'  AND refund_pct = 0;
UPDATE fare_classes SET refund_pct = 100, late_refund_pct = 50, cabin_baggage_kg = 7,  checkin_baggage_kg = 20,
                        meal_included = 1, priority_boarding = 0, sort_order = 2, refundable = 1
 WHERE class_code = 'FLEX' AND refund_pct = 0;
UPDATE fare_classes SET refund_pct = 100, late_refund_pct = 75, cabin_baggage_kg = 14, checkin_baggage_kg = 35,
                        meal_included = 1, priority_boarding = 1, sort_order = 3, refundable = 1
 WHERE class_code = 'BUS'  AND refund_pct = 0;
UPDATE fare_classes SET refund_pct = 100 WHERE refundable = 1 AND refund_pct = 0;   -- any custom refundable class
CALL av_add_constraint('fare_classes', 'chk_fc_refund_range',
  'CHECK (refund_pct BETWEEN 0 AND 100 AND late_refund_pct BETWEEN 0 AND refund_pct)');
CALL av_add_constraint('fare_classes', 'chk_fc_refundable',
  'CHECK ((refundable = 1 AND refund_pct > 0) OR (refundable = 0 AND refund_pct = 0))');

-- flight_fares / bookings: composite fare<->flight integrity
CALL av_add_index('flight_fares', 'uq_fare_flight_pair', 'UNIQUE KEY uq_fare_flight_pair (flight_fare_id, flight_id)');
CALL av_add_constraint('bookings', 'fk_booking_fare_flight',
  'FOREIGN KEY (flight_fare_id, flight_id) REFERENCES flight_fares(flight_fare_id, flight_id)');
CALL av_add_index('bookings', 'idx_booking_status', 'INDEX idx_booking_status (booking_status)');

-- payments
ALTER TABLE payments MODIFY payment_status
  ENUM('PENDING','SUCCESS','FAILED','REFUNDED','PARTIALLY_REFUNDED') NOT NULL DEFAULT 'PENDING';
CALL av_add_index('payments', 'idx_payment_paid_at', 'INDEX idx_payment_paid_at (paid_at)');

-- cancellations
CALL av_add_column('cancellations', 'cancelled_by',      'cancelled_by BIGINT UNSIGNED NULL');
CALL av_add_column('cancellations', 'cancellation_type', "cancellation_type ENUM('PASSENGER','ADMIN','FLIGHT_CANCELLED') NOT NULL DEFAULT 'PASSENGER'");
CALL av_add_column('cancellations', 'refund_policy',     'refund_policy VARCHAR(120) NULL');
CALL av_add_constraint('cancellations', 'fk_cancel_actor', 'FOREIGN KEY (cancelled_by) REFERENCES users(user_id)');
CALL av_add_index('cancellations', 'idx_cancellation_date', 'INDEX idx_cancellation_date (cancellation_date)');

DROP PROCEDURE IF EXISTS av_add_column;
DROP PROCEDURE IF EXISTS av_add_index;
DROP PROCEDURE IF EXISTS av_add_constraint;

-- =====================================================================
-- 6. Analytics views — the ONE place revenue is defined
--
--   gross_revenue      = SUM(payments.amount) for every payment that was
--                        ever captured: SUCCESS, REFUNDED, PARTIALLY_REFUNDED
--                        (money that came in, even if later returned)
--   refunds            = SUM(cancellations.refund_amount)
--   net_revenue        = gross_revenue - refunds
--   fuel_cost          = flights.fuel_cost (0 for airline-cancelled flights,
--                        which never operated)
--   revenue_after_fuel = net_revenue - fuel_cost
--
-- The API and dashboard read these views; they never re-derive revenue.
-- =====================================================================
CREATE OR REPLACE VIEW v_flight_occupancy AS
SELECT
  f.flight_id,
  f.flight_number,
  f.departure_time,
  r.route_id,
  oa.airport_code AS origin_code,
  da.airport_code AS destination_code,
  COALESCE(SUM(ff.allocated_seats), f.available_seats) AS allocated_seats,
  COALESCE(SUM(ff.sold_seats), 0)                      AS sold_seats,
  COALESCE(ROUND(100 * SUM(ff.sold_seats) / NULLIF(SUM(ff.allocated_seats), 0), 2), 0) AS occupancy_pct,
  f.status
FROM flights f
JOIN routes r         ON r.route_id = f.route_id
JOIN airports oa      ON oa.airport_id = r.origin_airport_id
JOIN airports da      ON da.airport_id = r.destination_airport_id
LEFT JOIN flight_fares ff ON ff.flight_id = f.flight_id
GROUP BY f.flight_id, f.flight_number, f.departure_time, r.route_id,
         oa.airport_code, da.airport_code, f.available_seats, f.status;

CREATE OR REPLACE VIEW v_revenue_by_flight AS
SELECT
  f.flight_id,
  f.flight_number,
  oa.airport_code AS origin_code,
  da.airport_code AS destination_code,
  COALESCE(bk.gross_revenue, 0)                                   AS gross_revenue,
  COALESCE(bk.refunds, 0)                                         AS refunds,
  COALESCE(bk.gross_revenue, 0) - COALESCE(bk.refunds, 0)         AS net_revenue,
  IF(f.status = 'CANCELLED', 0, f.fuel_cost)                      AS fuel_cost,
  COALESCE(bk.gross_revenue, 0) - COALESCE(bk.refunds, 0)
    - IF(f.status = 'CANCELLED', 0, f.fuel_cost)                  AS revenue_after_fuel,
  f.departure_time,
  f.status,
  r.route_id,
  COALESCE(bk.active_bookings, 0)    AS active_bookings,
  COALESCE(bk.cancelled_bookings, 0) AS cancelled_bookings
FROM flights f
JOIN routes r    ON r.route_id = f.route_id
JOIN airports oa ON oa.airport_id = r.origin_airport_id
JOIN airports da ON da.airport_id = r.destination_airport_id
LEFT JOIN (
  SELECT b.flight_id,
         SUM(b.booking_status IN ('CONFIRMED','COMPLETED')) AS active_bookings,
         SUM(b.booking_status = 'CANCELLED')                AS cancelled_bookings,
         SUM(CASE WHEN p.payment_status IN ('SUCCESS','REFUNDED','PARTIALLY_REFUNDED')
                  THEN p.amount ELSE 0 END)                 AS gross_revenue,
         SUM(COALESCE(c.refund_amount, 0))                  AS refunds
    FROM bookings b
    LEFT JOIN payments p      ON p.booking_id = b.booking_id
    LEFT JOIN cancellations c ON c.booking_id = b.booking_id
   GROUP BY b.flight_id
) bk ON bk.flight_id = f.flight_id;

-- One-row totals built FROM v_revenue_by_flight, so the KPI cards and the
-- flight-wise table can never disagree.
CREATE OR REPLACE VIEW v_revenue_summary AS
SELECT
  COUNT(*)                                        AS total_flights,
  SUM(status IN ('SCHEDULED','DELAYED'))          AS upcoming_flights,
  SUM(status = 'COMPLETED')                       AS completed_flights,
  SUM(status = 'CANCELLED')                       AS cancelled_flights,
  COALESCE(SUM(gross_revenue), 0)                 AS gross_revenue,
  COALESCE(SUM(refunds), 0)                       AS total_refunds,
  COALESCE(SUM(net_revenue), 0)                   AS net_revenue,
  COALESCE(SUM(fuel_cost), 0)                     AS fuel_cost,
  COALESCE(SUM(revenue_after_fuel), 0)            AS revenue_after_fuel
FROM v_revenue_by_flight;

-- Day-by-day cash view: gross by payment date, refunds by cancellation date.
CREATE OR REPLACE VIEW v_daily_revenue AS
WITH g AS (
  SELECT DATE(paid_at) AS d, SUM(amount) AS gross, COUNT(*) AS bookings
    FROM payments
   WHERE payment_status IN ('SUCCESS','REFUNDED','PARTIALLY_REFUNDED') AND paid_at IS NOT NULL
   GROUP BY DATE(paid_at)
), r AS (
  SELECT DATE(cancellation_date) AS d, SUM(refund_amount) AS refunds, COUNT(*) AS cancellations
    FROM cancellations
   GROUP BY DATE(cancellation_date)
), days AS (
  SELECT d FROM g UNION SELECT d FROM r
)
SELECT days.d                                      AS revenue_date,
       COALESCE(g.gross, 0)                        AS gross_revenue,
       COALESCE(r.refunds, 0)                      AS refunds,
       COALESCE(g.gross, 0) - COALESCE(r.refunds, 0) AS net_revenue,
       COALESCE(g.bookings, 0)                     AS bookings,
       COALESCE(r.cancellations, 0)                AS cancellations
  FROM days
  LEFT JOIN g ON g.d = days.d
  LEFT JOIN r ON r.d = days.d;

-- Route-level performance (load factor + revenue)
CREATE OR REPLACE VIEW v_route_performance AS
SELECT
  rv.route_id,
  rv.origin_code,
  rv.destination_code,
  COUNT(*)                                                    AS flights,
  SUM(o.sold_seats)                                           AS sold_seats,
  SUM(o.allocated_seats)                                      AS allocated_seats,
  ROUND(100 * SUM(o.sold_seats) / NULLIF(SUM(o.allocated_seats), 0), 2) AS load_factor_pct,
  SUM(rv.gross_revenue)                                       AS gross_revenue,
  SUM(rv.refunds)                                             AS refunds,
  SUM(rv.net_revenue)                                         AS net_revenue,
  SUM(rv.fuel_cost)                                           AS fuel_cost,
  SUM(rv.revenue_after_fuel)                                  AS revenue_after_fuel
FROM v_revenue_by_flight rv
JOIN v_flight_occupancy o ON o.flight_id = rv.flight_id
WHERE rv.status <> 'CANCELLED'
GROUP BY rv.route_id, rv.origin_code, rv.destination_code;

-- Everything a passenger sees about a booking, in one place
CREATE OR REPLACE VIEW v_booking_details AS
SELECT
  b.booking_id, b.booking_reference, b.booking_status, b.total_amount, b.booked_at, b.user_id,
  u.name AS passenger_name, u.email AS passenger_email, u.phone AS passenger_phone,
  f.flight_id, f.flight_number, f.departure_time, f.arrival_time, f.status AS flight_status,
  TIMESTAMPDIFF(MINUTE, f.departure_time, f.arrival_time) AS duration_min,
  o.airport_code AS origin_code, o.city AS origin_city, o.airport_name AS origin_airport,
  d.airport_code AS destination_code, d.city AS destination_city, d.airport_name AS destination_airport,
  ac.model AS aircraft_model, ac.registration_no,
  fc.class_code, fc.class_name, fc.refundable, fc.refund_pct, fc.late_refund_pct,
  fc.cabin_baggage_kg, fc.checkin_baggage_kg, fc.meal_included, fc.priority_boarding,
  p.payment_id, p.payment_type, p.payment_status, p.amount AS paid_amount, p.transaction_reference, p.paid_at,
  c.refund_amount, c.cancellation_date, c.reason AS cancellation_reason,
  c.cancellation_type, c.refund_policy
FROM bookings b
JOIN users u          ON u.user_id = b.user_id
JOIN flights f        ON f.flight_id = b.flight_id
JOIN routes r         ON r.route_id = f.route_id
JOIN airports o       ON o.airport_id = r.origin_airport_id
JOIN airports d       ON d.airport_id = r.destination_airport_id
JOIN aircraft ac      ON ac.aircraft_id = f.aircraft_id
JOIN flight_fares ff  ON ff.flight_fare_id = b.flight_fare_id
JOIN fare_classes fc  ON fc.fare_class_id = ff.fare_class_id
LEFT JOIN payments p      ON p.booking_id = b.booking_id
LEFT JOIN cancellations c ON c.booking_id = b.booking_id;

-- =====================================================================
-- 7. Triggers, functions, procedures, event
-- Custom errors use SQLSTATE 45000 with these MYSQL_ERRNO codes, which
-- the API maps to HTTP statuses (src/lib/sqlErrors.ts):
--   5001 not found            5002 not allowed        5003 already cancelled
--   5004 not cancellable      5005 sold out           5006 flight closed
--   5007 fare/flight mismatch 5008 amount violation   5009 bad status change
--   5010 invalid input
-- =====================================================================
DROP TRIGGER IF EXISTS trg_booking_status_guard;
DROP TRIGGER IF EXISTS trg_booking_confirmed_seat;
DROP TRIGGER IF EXISTS trg_booking_cancelled_seat;
DROP TRIGGER IF EXISTS trg_booking_insert_confirmed;
DROP TRIGGER IF EXISTS trg_payment_amount_guard;
DROP TRIGGER IF EXISTS trg_cancellation_refund_cap;
DROP FUNCTION IF EXISTS fn_occupancy_pct;
DROP FUNCTION IF EXISTS fn_refund_amount;
DROP PROCEDURE IF EXISTS sp_cancel_booking;
DROP PROCEDURE IF EXISTS sp_book_flight;
DROP PROCEDURE IF EXISTS sp_cancel_flight;
DROP PROCEDURE IF EXISTS sp_complete_departed_flights;
DROP EVENT IF EXISTS ev_complete_departed_flights;

DELIMITER $$

-- ---------- Trigger 1: BEFORE UPDATE — legal status transitions only ----
-- PENDING -> CONFIRMED | CANCELLED ; CONFIRMED -> CANCELLED | COMPLETED.
-- A CANCELLED or COMPLETED booking is final, so a seat can never be
-- released twice or re-sold by flipping the status back.
CREATE TRIGGER trg_booking_status_guard
BEFORE UPDATE ON bookings
FOR EACH ROW
BEGIN
  IF NEW.flight_fare_id <> OLD.flight_fare_id OR NEW.flight_id <> OLD.flight_id
     OR NEW.user_id <> OLD.user_id THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5009,
      MESSAGE_TEXT = 'Flight, fare and passenger of a booking cannot be changed';
  END IF;

  IF NEW.booking_status <> OLD.booking_status AND NOT (
       (OLD.booking_status = 'PENDING'   AND NEW.booking_status IN ('CONFIRMED','CANCELLED')) OR
       (OLD.booking_status = 'CONFIRMED' AND NEW.booking_status IN ('CANCELLED','COMPLETED'))
     ) THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5009,
      MESSAGE_TEXT = 'Illegal booking status transition';
  END IF;
END$$

-- ---------- Trigger 2: AFTER UPDATE — move seat inventory ---------------
CREATE TRIGGER trg_booking_confirmed_seat
AFTER UPDATE ON bookings
FOR EACH ROW
BEGIN
  DECLARE v_sold INT UNSIGNED;

  -- seat taken when a booking becomes CONFIRMED
  IF OLD.booking_status = 'PENDING' AND NEW.booking_status = 'CONFIRMED' THEN
    UPDATE flight_fares
       SET sold_seats = sold_seats + 1
     WHERE flight_fare_id = NEW.flight_fare_id
       AND sold_seats < allocated_seats;
    IF ROW_COUNT() = 0 THEN
      SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5005,
        MESSAGE_TEXT = 'Cannot confirm booking: fare is sold out';
    END IF;
    SELECT sold_seats INTO v_sold FROM flight_fares WHERE flight_fare_id = NEW.flight_fare_id;
    INSERT INTO seat_inventory_log (flight_fare_id, booking_id, change_qty, sold_after, action)
    VALUES (NEW.flight_fare_id, NEW.booking_id, 1, v_sold, 'SEAT_SOLD');
  END IF;

  -- seat released exactly once, when a CONFIRMED booking is CANCELLED
  IF OLD.booking_status = 'CONFIRMED' AND NEW.booking_status = 'CANCELLED' THEN
    UPDATE flight_fares
       SET sold_seats = sold_seats - 1
     WHERE flight_fare_id = NEW.flight_fare_id
       AND sold_seats > 0;
    IF ROW_COUNT() = 0 THEN
      SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5009,
        MESSAGE_TEXT = 'Seat inventory inconsistent: nothing to release';
    END IF;
    SELECT sold_seats INTO v_sold FROM flight_fares WHERE flight_fare_id = NEW.flight_fare_id;
    INSERT INTO seat_inventory_log (flight_fare_id, booking_id, change_qty, sold_after, action)
    VALUES (NEW.flight_fare_id, NEW.booking_id, -1, v_sold, 'SEAT_RELEASED');
  END IF;
END$$

-- ---------- Trigger 3: AFTER INSERT — direct CONFIRMED/COMPLETED insert -
CREATE TRIGGER trg_booking_insert_confirmed
AFTER INSERT ON bookings
FOR EACH ROW
BEGIN
  DECLARE v_sold INT UNSIGNED;
  IF NEW.booking_status IN ('CONFIRMED','COMPLETED') THEN
    UPDATE flight_fares
       SET sold_seats = sold_seats + 1
     WHERE flight_fare_id = NEW.flight_fare_id
       AND sold_seats < allocated_seats;
    IF ROW_COUNT() = 0 THEN
      SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5005,
        MESSAGE_TEXT = 'Cannot create confirmed booking: fare is sold out';
    END IF;
    SELECT sold_seats INTO v_sold FROM flight_fares WHERE flight_fare_id = NEW.flight_fare_id;
    INSERT INTO seat_inventory_log (flight_fare_id, booking_id, change_qty, sold_after, action)
    VALUES (NEW.flight_fare_id, NEW.booking_id, 1, v_sold, 'SEAT_SOLD');
  END IF;
END$$

-- ---------- Trigger 4: BEFORE INSERT payments — amount must match -------
CREATE TRIGGER trg_payment_amount_guard
BEFORE INSERT ON payments
FOR EACH ROW
BEGIN
  DECLARE v_total DECIMAL(12,2);
  SELECT total_amount INTO v_total FROM bookings WHERE booking_id = NEW.booking_id;
  IF v_total IS NOT NULL AND NEW.amount <> v_total THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5008,
      MESSAGE_TEXT = 'Payment amount must equal the booking total';
  END IF;
END$$

-- ---------- Trigger 5: BEFORE INSERT cancellations — refund cap ---------
-- Even a hand-written INSERT can never refund more than was paid.
CREATE TRIGGER trg_cancellation_refund_cap
BEFORE INSERT ON cancellations
FOR EACH ROW
BEGIN
  DECLARE v_paid DECIMAL(12,2) DEFAULT 0;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM payments
   WHERE booking_id = NEW.booking_id
     AND payment_status = 'SUCCESS';
  IF NEW.refund_amount > v_paid THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5008,
      MESSAGE_TEXT = 'Refund cannot exceed the amount paid';
  END IF;
END$$

-- ---------- Function: occupancy % of a flight ---------------------------
CREATE FUNCTION fn_occupancy_pct(p_flight_id BIGINT UNSIGNED)
RETURNS DECIMAL(6,2)
READS SQL DATA
DETERMINISTIC
BEGIN
  DECLARE v_allocated INT DEFAULT 0;
  DECLARE v_sold      INT DEFAULT 0;
  SELECT COALESCE(SUM(allocated_seats), 0), COALESCE(SUM(sold_seats), 0)
    INTO v_allocated, v_sold
    FROM flight_fares
   WHERE flight_id = p_flight_id;
  RETURN IF(v_allocated = 0, 0, ROUND(v_sold * 100 / v_allocated, 2));
END$$

-- ---------- Function: refund a booking is entitled to RIGHT NOW --------
-- Policy (stored in fare_classes):
--   cancelled >= 24 h before departure -> refund_pct      of amount paid
--   cancelled <  24 h before departure -> late_refund_pct of amount paid
--   flight departed / booking not CONFIRMED / no captured payment -> 0
-- Always capped at the amount paid.
CREATE FUNCTION fn_refund_amount(p_booking_id BIGINT UNSIGNED)
RETURNS DECIMAL(12,2)
READS SQL DATA
NOT DETERMINISTIC
BEGIN
  DECLARE v_status   VARCHAR(20);
  DECLARE v_dep      DATETIME;
  DECLARE v_pct      DECIMAL(5,2);
  DECLARE v_late_pct DECIMAL(5,2);
  DECLARE v_paid     DECIMAL(12,2) DEFAULT 0;

  SELECT b.booking_status, f.departure_time, fc.refund_pct, fc.late_refund_pct
    INTO v_status, v_dep, v_pct, v_late_pct
    FROM bookings b
    JOIN flights f       ON f.flight_id = b.flight_id
    JOIN flight_fares ff ON ff.flight_fare_id = b.flight_fare_id
    JOIN fare_classes fc ON fc.fare_class_id = ff.fare_class_id
   WHERE b.booking_id = p_booking_id;

  IF v_status IS NULL OR v_status <> 'CONFIRMED' OR v_dep <= NOW() THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM payments WHERE booking_id = p_booking_id AND payment_status = 'SUCCESS';

  RETURN LEAST(v_paid,
               ROUND(v_paid * IF(TIMESTAMPDIFF(MINUTE, NOW(), v_dep) >= 24 * 60, v_pct, v_late_pct) / 100, 2));
END$$

-- ---------- Procedure: book a seat (atomic) -----------------------------
CREATE PROCEDURE sp_book_flight(
  IN  p_user_id           BIGINT UNSIGNED,
  IN  p_flight_id         BIGINT UNSIGNED,
  IN  p_flight_fare_id    BIGINT UNSIGNED,
  IN  p_payment_type      VARCHAR(20),
  OUT p_booking_id        BIGINT UNSIGNED,
  OUT p_booking_reference CHAR(10)
)
BEGIN
  DECLARE v_user_ok     INT DEFAULT 0;
  DECLARE v_fare_flight BIGINT UNSIGNED;
  DECLARE v_fare        DECIMAL(12,2);
  DECLARE v_alloc       INT UNSIGNED;
  DECLARE v_sold        INT UNSIGNED;
  DECLARE v_fstatus     VARCHAR(20);
  DECLARE v_dep         DATETIME;
  DECLARE v_ref         CHAR(10);
  DECLARE v_points      INT UNSIGNED;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET p_booking_id = NULL, p_booking_reference = NULL;

  IF p_payment_type IS NULL OR p_payment_type NOT IN ('CARD','UPI','NETBANKING','DEMO') THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5010, MESSAGE_TEXT = 'Unsupported payment method';
  END IF;
  SELECT COUNT(*) INTO v_user_ok FROM users WHERE user_id = p_user_id;
  IF v_user_ok = 0 THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5001, MESSAGE_TEXT = 'User not found';
  END IF;

  START TRANSACTION;

  -- Row lock on the fare: concurrent bookings of the same fare queue here.
  SELECT ff.flight_id, ff.current_fare, ff.allocated_seats, ff.sold_seats, f.status, f.departure_time
    INTO v_fare_flight, v_fare, v_alloc, v_sold, v_fstatus, v_dep
    FROM flight_fares ff
    JOIN flights f ON f.flight_id = ff.flight_id
   WHERE ff.flight_fare_id = p_flight_fare_id
   FOR UPDATE OF ff;

  IF v_fare_flight IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5001, MESSAGE_TEXT = 'Fare not found';
  END IF;
  IF v_fare_flight <> p_flight_id THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5007, MESSAGE_TEXT = 'Fare does not belong to this flight';
  END IF;
  IF v_fstatus NOT IN ('SCHEDULED','DELAYED') THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5006, MESSAGE_TEXT = 'This flight is not open for booking';
  END IF;
  IF v_dep <= NOW() + INTERVAL 1 HOUR THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5006, MESSAGE_TEXT = 'Booking has closed for this flight';
  END IF;
  IF v_sold >= v_alloc THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5005, MESSAGE_TEXT = 'This fare is sold out';
  END IF;

  -- Unique 10-char reference, e.g. AV7K2M9QXD
  REPEAT
    SET v_ref = CONCAT('AV', UPPER(SUBSTRING(MD5(CONCAT(UUID(), RAND())), 1, 8)));
  UNTIL NOT EXISTS (SELECT 1 FROM bookings WHERE booking_reference = v_ref) END REPEAT;

  INSERT INTO bookings (user_id, flight_id, flight_fare_id, booking_reference, booking_status, total_amount)
  VALUES (p_user_id, p_flight_id, p_flight_fare_id, v_ref, 'PENDING', v_fare);
  SET p_booking_id = LAST_INSERT_ID();

  -- Simulated payment — exactly one per booking (UNIQUE + amount trigger)
  INSERT INTO payments (booking_id, amount, payment_type, payment_status, transaction_reference, paid_at)
  VALUES (p_booking_id, v_fare, p_payment_type, 'SUCCESS', CONCAT('SIM-', v_ref), NOW());

  -- PENDING -> CONFIRMED fires trg_booking_confirmed_seat (sold_seats + 1)
  UPDATE bookings SET booking_status = 'CONFIRMED' WHERE booking_id = p_booking_id;

  -- Loyalty: 1 point per Rs 100 paid
  SET v_points = FLOOR(v_fare / 100);
  INSERT INTO passengers (user_id, loyalty_points) VALUES (p_user_id, v_points)
  ON DUPLICATE KEY UPDATE loyalty_points = loyalty_points + v_points;
  UPDATE passengers
     SET loyalty_tier = CASE WHEN loyalty_points >= 5000 THEN 'PLATINUM'
                             WHEN loyalty_points >= 2500 THEN 'GOLD'
                             WHEN loyalty_points >= 1000 THEN 'SILVER'
                             ELSE 'STANDARD' END
   WHERE user_id = p_user_id;

  SET p_booking_reference = v_ref;
  COMMIT;
END$$

-- ---------- Procedure: cancel a booking with the refund policy ---------
-- The caller does NOT choose the refund: it is computed here from the
-- fare-class policy (fn_refund_amount) and capped at the amount paid.
CREATE PROCEDURE sp_cancel_booking(
  IN  p_booking_id    BIGINT UNSIGNED,
  IN  p_actor_user_id BIGINT UNSIGNED,
  IN  p_reason        VARCHAR(255),
  OUT p_refund_amount DECIMAL(12,2)
)
BEGIN
  DECLARE v_actor_role VARCHAR(20);
  DECLARE v_owner      BIGINT UNSIGNED;
  DECLARE v_status     VARCHAR(20);
  DECLARE v_dep        DATETIME;
  DECLARE v_class      VARCHAR(20);
  DECLARE v_pct        DECIMAL(5,2);
  DECLARE v_late_pct   DECIMAL(5,2);
  DECLARE v_paid       DECIMAL(12,2) DEFAULT 0;
  DECLARE v_refund     DECIMAL(12,2) DEFAULT 0;
  DECLARE v_early      BOOLEAN;
  DECLARE v_cancelled  INT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET p_refund_amount = NULL;

  SELECT role INTO v_actor_role FROM users WHERE user_id = p_actor_user_id;
  IF v_actor_role IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5002, MESSAGE_TEXT = 'Unknown user';
  END IF;

  START TRANSACTION;

  SELECT b.user_id, b.booking_status, f.departure_time, fc.class_code, fc.refund_pct, fc.late_refund_pct
    INTO v_owner, v_status, v_dep, v_class, v_pct, v_late_pct
    FROM bookings b
    JOIN flights f       ON f.flight_id = b.flight_id
    JOIN flight_fares ff ON ff.flight_fare_id = b.flight_fare_id
    JOIN fare_classes fc ON fc.fare_class_id = ff.fare_class_id
   WHERE b.booking_id = p_booking_id
   FOR UPDATE OF b;                                -- a 2nd concurrent cancel waits here

  IF v_owner IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5001, MESSAGE_TEXT = 'Booking not found';
  END IF;
  IF v_owner <> p_actor_user_id AND v_actor_role <> 'ADMIN' THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5002, MESSAGE_TEXT = 'You can only cancel your own bookings';
  END IF;
  SELECT COUNT(*) INTO v_cancelled FROM cancellations WHERE booking_id = p_booking_id;
  IF v_status = 'CANCELLED' OR v_cancelled > 0 THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5003, MESSAGE_TEXT = 'Booking is already cancelled';
  END IF;
  IF v_status <> 'CONFIRMED' THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5004, MESSAGE_TEXT = 'Only confirmed upcoming bookings can be cancelled';
  END IF;
  IF v_dep <= NOW() THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5004, MESSAGE_TEXT = 'This flight has already departed';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM payments WHERE booking_id = p_booking_id AND payment_status = 'SUCCESS'
    FOR UPDATE;

  SET v_early  = TIMESTAMPDIFF(MINUTE, NOW(), v_dep) >= 24 * 60;
  SET v_refund = fn_refund_amount(p_booking_id);
  IF v_refund > v_paid THEN                       -- belt and braces
    SET v_refund = v_paid;
  END IF;

  INSERT INTO cancellations (booking_id, refund_amount, reason, cancelled_by, cancellation_type, refund_policy)
  VALUES (p_booking_id, v_refund, p_reason, p_actor_user_id,
          IF(v_owner = p_actor_user_id, 'PASSENGER', 'ADMIN'),
          CONCAT(v_class, IF(v_early, ' (24h+ before departure): ', ' (under 24h): '),
                 TRIM(TRAILING '.00' FROM CAST(IF(v_early, v_pct, v_late_pct) AS CHAR)), '% refund'));

  UPDATE payments
     SET payment_status = CASE WHEN v_refund = 0       THEN 'SUCCESS'
                               WHEN v_refund >= amount THEN 'REFUNDED'
                               ELSE 'PARTIALLY_REFUNDED' END
   WHERE booking_id = p_booking_id AND payment_status = 'SUCCESS';

  -- CONFIRMED -> CANCELLED fires trg_booking_confirmed_seat (sold_seats - 1)
  UPDATE bookings SET booking_status = 'CANCELLED' WHERE booking_id = p_booking_id;

  -- Reverse the loyalty points earned on this booking
  UPDATE passengers
     SET loyalty_points = GREATEST(CAST(loyalty_points AS SIGNED) - FLOOR(v_paid / 100), 0)
   WHERE user_id = v_owner;

  SET p_refund_amount = v_refund;
  COMMIT;
END$$

-- ---------- Procedure: airline cancels a whole flight (CURSOR) ---------
CREATE PROCEDURE sp_cancel_flight(
  IN  p_flight_id          BIGINT UNSIGNED,
  IN  p_actor_user_id      BIGINT UNSIGNED,
  IN  p_reason             VARCHAR(255),
  OUT p_bookings_cancelled INT,
  OUT p_total_refund       DECIMAL(12,2)
)
BEGIN
  DECLARE v_done     INT DEFAULT 0;
  DECLARE v_role     VARCHAR(20);
  DECLARE v_fstatus  VARCHAR(20);
  DECLARE v_dep      DATETIME;
  DECLARE v_bid      BIGINT UNSIGNED;
  DECLARE v_owner    BIGINT UNSIGNED;
  DECLARE v_paid     DECIMAL(12,2);

  DECLARE cur_bookings CURSOR FOR
    SELECT b.booking_id, b.user_id, COALESCE(p.amount, 0)
      FROM bookings b
      LEFT JOIN payments p ON p.booking_id = b.booking_id AND p.payment_status = 'SUCCESS'
     WHERE b.flight_id = p_flight_id AND b.booking_status = 'CONFIRMED';
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET p_bookings_cancelled = 0, p_total_refund = 0;

  SELECT role INTO v_role FROM users WHERE user_id = p_actor_user_id;
  IF v_role IS NULL OR v_role <> 'ADMIN' THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5002, MESSAGE_TEXT = 'Only an admin can cancel a flight';
  END IF;

  START TRANSACTION;
  SELECT status, departure_time INTO v_fstatus, v_dep FROM flights WHERE flight_id = p_flight_id FOR UPDATE;
  IF v_fstatus IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5001, MESSAGE_TEXT = 'Flight not found';
  END IF;
  IF v_fstatus = 'CANCELLED' THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5003, MESSAGE_TEXT = 'Flight is already cancelled';
  END IF;
  IF v_fstatus = 'COMPLETED' OR v_dep <= NOW() THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5004, MESSAGE_TEXT = 'A departed flight cannot be cancelled';
  END IF;

  -- lock every booking of the flight before walking them with the cursor
  SELECT COUNT(*) INTO v_bid FROM bookings WHERE flight_id = p_flight_id FOR UPDATE;

  SET v_done = 0;
  OPEN cur_bookings;
  booking_loop: LOOP
    FETCH cur_bookings INTO v_bid, v_owner, v_paid;
    IF v_done = 1 THEN LEAVE booking_loop; END IF;

    INSERT INTO cancellations (booking_id, refund_amount, reason, cancelled_by, cancellation_type, refund_policy)
    VALUES (v_bid, v_paid, COALESCE(p_reason, 'Flight cancelled by airline'), p_actor_user_id,
            'FLIGHT_CANCELLED', 'Airline cancellation: 100% refund');
    UPDATE payments SET payment_status = 'REFUNDED'
     WHERE booking_id = v_bid AND payment_status = 'SUCCESS' AND v_paid > 0;
    UPDATE bookings SET booking_status = 'CANCELLED' WHERE booking_id = v_bid;
    UPDATE passengers
       SET loyalty_points = GREATEST(CAST(loyalty_points AS SIGNED) - FLOOR(v_paid / 100), 0)
     WHERE user_id = v_owner;

    SET p_bookings_cancelled = p_bookings_cancelled + 1;
    SET p_total_refund = p_total_refund + v_paid;
  END LOOP;
  CLOSE cur_bookings;

  UPDATE flights SET status = 'CANCELLED' WHERE flight_id = p_flight_id;
  COMMIT;
END$$

-- ---------- Procedure: close out flights that have landed --------------
CREATE PROCEDURE sp_complete_departed_flights()
BEGIN
  UPDATE bookings b
    JOIN flights f ON f.flight_id = b.flight_id
     SET b.booking_status = 'COMPLETED'
   WHERE b.booking_status = 'CONFIRMED'
     AND f.status <> 'CANCELLED'
     AND f.arrival_time < NOW();

  UPDATE flights
     SET status = 'COMPLETED'
   WHERE status IN ('SCHEDULED','DELAYED')
     AND arrival_time < NOW();
END$$

-- ---------- Event: run the close-out every 10 minutes ------------------
-- (needs event_scheduler=ON, the MySQL 8 default; the API also calls the
--  procedure before analytics, so nothing breaks if events are off)
CREATE EVENT ev_complete_departed_flights
  ON SCHEDULE EVERY 10 MINUTE
  DO CALL sp_complete_departed_flights()$$

DELIMITER ;
