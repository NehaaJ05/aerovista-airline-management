-- =====================================================================
-- Advanced DBMS features demonstrated for Level 3 evaluation
-- Safe to run in order; the DML examples at the bottom wrap destructive
-- statements in transactions you can ROLLBACK.
-- =====================================================================
USE airline_intelligence;

-- 1. DDL already defined in schema.sql
--    (CREATE TABLE / FK / UNIQUE / CHECK / NOT NULL / INDEX / VIEW / TRIGGER / FUNCTION / PROCEDURE)

-- 2. DML — read, insert, update, delete demonstrations
--    SELECT
SELECT flight_number, status, departure_time
  FROM flights
 ORDER BY departure_time
 LIMIT 10;

--    INSERT (safe demonstration; airport inserted only if not present)
INSERT IGNORE INTO airports (airport_code, city, airport_name)
VALUES ('MAA', 'Chennai', 'Chennai International Airport');

--    UPDATE example (wrapped in a transaction — ROLLBACK if just demonstrating)
START TRANSACTION;
UPDATE flights
   SET fuel_cost = fuel_cost
 WHERE flight_number = 'AV101';           -- no-op by design; replace to run
ROLLBACK;

--    DELETE example (operates on a non-existent demo row by design)
DELETE FROM airports WHERE airport_code = '__NO_SUCH_CODE__';

-- 3. JOIN: flights with origin, destination, fare class and seat info
SELECT f.flight_number,
       o.airport_code AS origin,
       d.airport_code AS destination,
       fc.class_name,
       ff.current_fare,
       ff.allocated_seats,
       ff.sold_seats,
       (ff.allocated_seats - ff.sold_seats) AS seats_left
  FROM flights f
  JOIN routes r         ON r.route_id = f.route_id
  JOIN airports o       ON o.airport_id = r.origin_airport_id
  JOIN airports d       ON d.airport_id = r.destination_airport_id
  JOIN flight_fares ff  ON ff.flight_id = f.flight_id
  JOIN fare_classes fc  ON fc.fare_class_id = ff.fare_class_id
 WHERE f.status = 'SCHEDULED'
 ORDER BY f.departure_time, fc.class_name;

-- 4. Nested subquery: flights with at least one fare above the overall average
SELECT flight_id, flight_number
  FROM flights
 WHERE flight_id IN (
   SELECT flight_id
     FROM flight_fares
    WHERE current_fare > (SELECT AVG(current_fare) FROM flight_fares)
 );

-- 5. Correlated subquery: fares priced above their own class average
SELECT ff.flight_id,
       fc.class_name,
       ff.current_fare
  FROM flight_fares ff
  JOIN fare_classes fc ON fc.fare_class_id = ff.fare_class_id
 WHERE ff.current_fare > (
   SELECT AVG(ff2.current_fare)
     FROM flight_fares ff2
    WHERE ff2.fare_class_id = ff.fare_class_id
 );

-- 6. Aggregation with HAVING: routes with more than one scheduled flight
SELECT r.route_id,
       o.airport_code AS origin,
       d.airport_code AS destination,
       COUNT(f.flight_id) AS flights_scheduled
  FROM routes r
  JOIN airports o ON o.airport_id = r.origin_airport_id
  JOIN airports d ON d.airport_id = r.destination_airport_id
  LEFT JOIN flights f ON f.route_id = r.route_id AND f.status = 'SCHEDULED'
 GROUP BY r.route_id, o.airport_code, d.airport_code
HAVING flights_scheduled > 0
 ORDER BY flights_scheduled DESC;

-- 7. CTE: confirmed-booking demand per route
WITH route_demand AS (
  SELECT r.route_id,
         COUNT(b.booking_id) AS booking_count
    FROM routes r
    JOIN flights f    ON f.route_id = r.route_id
    LEFT JOIN bookings b ON b.flight_id = f.flight_id AND b.booking_status = 'CONFIRMED'
   GROUP BY r.route_id
)
SELECT rd.route_id,
       o.airport_code AS origin,
       d.airport_code AS destination,
       rd.booking_count
  FROM route_demand rd
  JOIN routes r   ON r.route_id = rd.route_id
  JOIN airports o ON o.airport_id = r.origin_airport_id
  JOIN airports d ON d.airport_id = r.destination_airport_id
 ORDER BY rd.booking_count DESC;

-- 8. Recursive CTE: next 7 calendar dates
WITH RECURSIVE days AS (
  SELECT CURRENT_DATE AS travel_date, 1 AS day_no
  UNION ALL
  SELECT travel_date + INTERVAL 1 DAY, day_no + 1
    FROM days
   WHERE day_no < 7
)
SELECT * FROM days;

-- 9. Views
SELECT * FROM v_flight_occupancy    ORDER BY occupancy_pct DESC;
SELECT * FROM v_revenue_by_flight   ORDER BY net_revenue  DESC;

-- 10. Stored function demonstration
SELECT flight_id, fn_occupancy_pct(flight_id) AS occupancy_pct FROM flights;

-- 11. Full booking workflow in one transaction with row-level locking.
--     Uncomment and adjust the ids to run against a TEST database only.
/*
START TRANSACTION;
  SELECT sold_seats, allocated_seats
    FROM flight_fares
   WHERE flight_fare_id = 1
   FOR UPDATE;

  INSERT INTO bookings (user_id, flight_id, flight_fare_id, booking_reference, booking_status, total_amount)
       VALUES (1, 1, 1, 'DEMO000001', 'PENDING', 5500.00);

  INSERT INTO payments (booking_id, amount, payment_type, payment_status, transaction_reference, paid_at)
       VALUES (LAST_INSERT_ID(), 5500.00, 'DEMO', 'SUCCESS', 'TXN-DEMO000001', NOW());

  UPDATE bookings SET booking_status = 'CONFIRMED' WHERE booking_reference = 'DEMO000001';
COMMIT;
-- Use ROLLBACK instead if any step fails.
*/

-- 12. Server-side cancellation via stored procedure
--     CALL sp_cancel_booking(123, 5500.00, 'Passenger request');
