-- =====================================================================
-- AeroVista — reference data + flight schedule
-- Idempotent: re-running never duplicates airports, routes, flights or
-- fares (UNIQUE keys + INSERT IGNORE). Re-running on a later day simply
-- extends the schedule so there are always upcoming flights to book.
-- Fictional schedules, prices and seat allocations for coursework only.
--
-- Run:  mysql -u root -p airline_intelligence < database/seed.sql
-- =====================================================================
USE airline_intelligence;

-- How much schedule to generate around today
SET @days_back  = 7;    -- past flights (become COMPLETED; used for history)
SET @days_ahead = 14;   -- bookable flights

-- Airports ------------------------------------------------------------
INSERT IGNORE INTO airports (airport_code, city, airport_name) VALUES
  ('BLR', 'Bengaluru', 'Kempegowda International Airport'),
  ('DEL', 'Delhi',     'Indira Gandhi International Airport'),
  ('BOM', 'Mumbai',    'Chhatrapati Shivaji Maharaj International Airport'),
  ('HYD', 'Hyderabad', 'Rajiv Gandhi International Airport'),
  ('MAA', 'Chennai',   'Chennai International Airport'),
  ('CCU', 'Kolkata',   'Netaji Subhas Chandra Bose International Airport');

-- Aircraft ------------------------------------------------------------
INSERT IGNORE INTO aircraft (registration_no, total_seats, model) VALUES
  ('VT-AV1', 180, 'Airbus A320'),
  ('VT-AV2', 220, 'Boeing 737-800'),
  ('VT-AV3', 189, 'Airbus A320neo'),
  ('VT-AV4', 222, 'Airbus A321neo'),
  ('VT-AV5', 186, 'Boeing 737 MAX 8'),
  ('VT-AV6',  78, 'ATR 72-600');

-- Fare families — the policy columns drive fn_refund_amount() ---------
INSERT INTO fare_classes
  (class_code, class_name, refundable, refund_pct, late_refund_pct,
   cabin_baggage_kg, checkin_baggage_kg, meal_included, priority_boarding, sort_order)
VALUES
  ('ECO',  'Economy',      0,   0,  0,  7, 15, 0, 0, 1),
  ('FLEX', 'Flex Economy', 1, 100, 50,  7, 20, 1, 0, 2),
  ('BUS',  'Business',     1, 100, 75, 14, 35, 1, 1, 3)
ON DUPLICATE KEY UPDATE
  class_name = VALUES(class_name), refundable = VALUES(refundable),
  refund_pct = VALUES(refund_pct), late_refund_pct = VALUES(late_refund_pct),
  cabin_baggage_kg = VALUES(cabin_baggage_kg), checkin_baggage_kg = VALUES(checkin_baggage_kg),
  meal_included = VALUES(meal_included), priority_boarding = VALUES(priority_boarding),
  sort_order = VALUES(sort_order);

-- Routes (directional) ------------------------------------------------
INSERT IGNORE INTO routes (origin_airport_id, destination_airport_id, distance_km)
SELECT o.airport_id, d.airport_id, v.distance
FROM (SELECT 'BLR' AS o_code, 'DEL' AS d_code, 1740 AS distance UNION ALL
      SELECT 'DEL', 'BLR', 1740 UNION ALL
      SELECT 'BLR', 'BOM',  840 UNION ALL
      SELECT 'BOM', 'BLR',  840 UNION ALL
      SELECT 'BLR', 'HYD',  500 UNION ALL
      SELECT 'HYD', 'BLR',  500 UNION ALL
      SELECT 'DEL', 'BOM', 1150 UNION ALL
      SELECT 'BOM', 'DEL', 1150 UNION ALL
      SELECT 'DEL', 'HYD', 1270 UNION ALL
      SELECT 'HYD', 'DEL', 1270 UNION ALL
      SELECT 'HYD', 'BOM',  620 UNION ALL
      SELECT 'BOM', 'HYD',  620 UNION ALL
      SELECT 'BLR', 'MAA',  290 UNION ALL
      SELECT 'MAA', 'BLR',  290 UNION ALL
      SELECT 'BLR', 'CCU', 1560 UNION ALL
      SELECT 'CCU', 'BLR', 1560 UNION ALL
      SELECT 'DEL', 'CCU', 1310 UNION ALL
      SELECT 'CCU', 'DEL', 1310 UNION ALL
      SELECT 'MAA', 'DEL', 1760 UNION ALL
      SELECT 'BOM', 'MAA', 1030) AS v
JOIN airports o ON o.airport_code = v.o_code
JOIN airports d ON d.airport_code = v.d_code;

-- Daily schedule × every date in the window (RECURSIVE CTE) -----------
-- dep = local departure time, dur = block time in minutes,
-- peak = demand multiplier applied to fares for that departure slot
INSERT IGNORE INTO flights
  (flight_number, route_id, aircraft_id, departure_time, arrival_time, available_seats, fuel_cost, status)
WITH RECURSIVE days AS (
  SELECT CURDATE() - INTERVAL @days_back DAY AS d
  UNION ALL
  SELECT d + INTERVAL 1 DAY FROM days WHERE d < CURDATE() + INTERVAL @days_ahead DAY
),
tpl AS (
  SELECT 'AV101' AS fno, 'BLR' AS o, 'DEL' AS dst, '06:00' AS dep, 170 AS dur, 'VT-AV1' AS reg UNION ALL
  SELECT 'AV103', 'BLR', 'DEL', '18:30', 170, 'VT-AV4' UNION ALL
  SELECT 'AV102', 'DEL', 'BLR', '10:15', 170, 'VT-AV1' UNION ALL
  SELECT 'AV104', 'DEL', 'BLR', '21:40', 170, 'VT-AV4' UNION ALL
  SELECT 'AV201', 'BLR', 'BOM', '07:10', 105, 'VT-AV3' UNION ALL
  SELECT 'AV202', 'BOM', 'BLR', '13:40', 105, 'VT-AV3' UNION ALL
  SELECT 'AV301', 'BLR', 'HYD', '09:05',  75, 'VT-AV2' UNION ALL
  SELECT 'AV302', 'HYD', 'BLR', '20:10',  75, 'VT-AV2' UNION ALL
  SELECT 'AV401', 'DEL', 'BOM', '08:00', 130, 'VT-AV5' UNION ALL
  SELECT 'AV402', 'BOM', 'DEL', '19:05', 130, 'VT-AV5' UNION ALL
  SELECT 'AV501', 'DEL', 'HYD', '11:20', 135, 'VT-AV2' UNION ALL
  SELECT 'AV502', 'HYD', 'DEL', '16:35', 135, 'VT-AV2' UNION ALL
  SELECT 'AV601', 'HYD', 'BOM', '17:00',  85, 'VT-AV3' UNION ALL
  SELECT 'AV602', 'BOM', 'HYD', '06:45',  85, 'VT-AV3' UNION ALL
  SELECT 'AV701', 'BLR', 'MAA', '12:30',  60, 'VT-AV6' UNION ALL
  SELECT 'AV702', 'MAA', 'BLR', '15:00',  60, 'VT-AV6' UNION ALL
  SELECT 'AV801', 'BLR', 'CCU', '14:15', 155, 'VT-AV5' UNION ALL
  SELECT 'AV802', 'CCU', 'BLR', '19:30', 155, 'VT-AV5' UNION ALL
  SELECT 'AV901', 'DEL', 'CCU', '07:30', 130, 'VT-AV4' UNION ALL
  SELECT 'AV902', 'CCU', 'DEL', '12:00', 130, 'VT-AV4' UNION ALL
  SELECT 'AV951', 'MAA', 'DEL', '09:40', 175, 'VT-AV1' UNION ALL
  SELECT 'AV961', 'BOM', 'MAA', '16:10', 120, 'VT-AV1'
)
SELECT tpl.fno,
       r.route_id,
       a.aircraft_id,
       TIMESTAMP(days.d, tpl.dep),
       TIMESTAMP(days.d, tpl.dep) + INTERVAL tpl.dur MINUTE,
       a.total_seats,
       ROUND(r.distance_km * CASE WHEN a.total_seats < 100 THEN 42 ELSE 104 END + 9000, -2),
       'SCHEDULED'
  FROM days
  CROSS JOIN tpl
  JOIN airports o ON o.airport_code = tpl.o
  JOIN airports d ON d.airport_code = tpl.dst
  JOIN routes r   ON r.origin_airport_id = o.airport_id AND r.destination_airport_id = d.airport_id
  JOIN aircraft a ON a.registration_no = tpl.reg;

-- Fares for every flight that has none yet ----------------------------
-- Economy is priced by distance, departure slot and weekday; Flex and
-- Business are fixed multiples of it. The ATR (78 seats) has no Business cabin.
INSERT IGNORE INTO flight_fares (flight_id, fare_class_id, current_fare, allocated_seats, sold_seats)
SELECT f.flight_id, fc.fare_class_id,
       CASE fc.class_code
         WHEN 'ECO'  THEN eco.price
         WHEN 'FLEX' THEN ROUND(eco.price * 1.45, -1)
         WHEN 'BUS'  THEN ROUND(eco.price * 3.10, -1)
       END,
       CASE fc.class_code
         WHEN 'BUS'  THEN FLOOR(f.available_seats * 0.10)
         WHEN 'FLEX' THEN FLOOR(f.available_seats * 0.20)
         ELSE f.available_seats
              - FLOOR(f.available_seats * 0.20)
              - IF(f.available_seats < 100, 0, FLOOR(f.available_seats * 0.10))
       END,
       0
  FROM flights f
  JOIN routes r ON r.route_id = f.route_id
  JOIN (
    SELECT f2.flight_id,
           ROUND((1900 + r2.distance_km * 2.35)
                 * CASE WHEN HOUR(f2.departure_time) IN (6,7,8,18,19,20) THEN 1.18
                        WHEN HOUR(f2.departure_time) IN (12,13,14,15)    THEN 0.92
                        ELSE 1.0 END
                 * CASE WHEN DAYOFWEEK(f2.departure_time) IN (1,6) THEN 1.12 ELSE 1.0 END
                 * (1 + (f2.flight_id MOD 7) / 100), -1) AS price
      FROM flights f2
      JOIN routes r2 ON r2.route_id = f2.route_id
  ) eco ON eco.flight_id = f.flight_id
  CROSS JOIN fare_classes fc
 WHERE NOT (fc.class_code = 'BUS' AND f.available_seats < 100)
   AND NOT EXISTS (SELECT 1 FROM flight_fares x WHERE x.flight_id = f.flight_id AND x.fare_class_id = fc.fare_class_id);

-- Close out anything in the past window
CALL sp_complete_departed_flights();

SELECT COUNT(*) AS flights_in_schedule,
       SUM(status IN ('SCHEDULED','DELAYED')) AS bookable,
       SUM(status = 'COMPLETED') AS completed
  FROM flights;
