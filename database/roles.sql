-- =====================================================================
-- AeroVista — database roles and role-based access control (RBAC)
-- Apply with an administrator account AFTER schema.sql:
--     mysql -u root -p < database/roles.sql
-- Re-runnable.
--
-- Two roles mirror the two application roles (users.role):
--   airline_passenger_role : read the catalogue; book / cancel ONLY via the
--                            stored procedures (which enforce seat limits,
--                            ownership and the refund policy). No direct
--                            INSERT/UPDATE/DELETE on bookings or payments.
--   airline_admin_role     : full DML on every table + all routines.
-- =====================================================================
USE airline_intelligence;

CREATE ROLE IF NOT EXISTS 'airline_passenger_role';
CREATE ROLE IF NOT EXISTS 'airline_admin_role';

-- ---------- passenger -------------------------------------------------
GRANT SELECT ON airline_intelligence.airports          TO 'airline_passenger_role';
GRANT SELECT ON airline_intelligence.routes            TO 'airline_passenger_role';
GRANT SELECT ON airline_intelligence.aircraft          TO 'airline_passenger_role';
GRANT SELECT ON airline_intelligence.flights           TO 'airline_passenger_role';
GRANT SELECT ON airline_intelligence.flight_fares      TO 'airline_passenger_role';
GRANT SELECT ON airline_intelligence.fare_classes      TO 'airline_passenger_role';
GRANT SELECT ON airline_intelligence.v_flight_occupancy TO 'airline_passenger_role';
GRANT EXECUTE ON PROCEDURE airline_intelligence.sp_book_flight    TO 'airline_passenger_role';
GRANT EXECUTE ON PROCEDURE airline_intelligence.sp_cancel_booking TO 'airline_passenger_role';
GRANT EXECUTE ON FUNCTION  airline_intelligence.fn_refund_amount  TO 'airline_passenger_role';
GRANT EXECUTE ON FUNCTION  airline_intelligence.fn_occupancy_pct  TO 'airline_passenger_role';

-- ---------- admin -----------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON airline_intelligence.* TO 'airline_admin_role';
GRANT EXECUTE ON airline_intelligence.*                        TO 'airline_admin_role';

-- ---------- demo database accounts (local only) -------------------------
-- Used in the viva to show that the database itself enforces access.
CREATE USER IF NOT EXISTS 'av_admin'@'localhost'     IDENTIFIED BY 'AvAdmin@2026';
CREATE USER IF NOT EXISTS 'av_passenger'@'localhost' IDENTIFIED BY 'AvPassenger@2026';
GRANT 'airline_admin_role'     TO 'av_admin'@'localhost';
GRANT 'airline_passenger_role' TO 'av_passenger'@'localhost';
SET DEFAULT ROLE 'airline_admin_role'     TO 'av_admin'@'localhost';
SET DEFAULT ROLE 'airline_passenger_role' TO 'av_passenger'@'localhost';

-- Inspect:
--   SHOW GRANTS FOR 'airline_passenger_role';
--   SHOW GRANTS FOR 'av_passenger'@'localhost' USING 'airline_passenger_role';
--
-- Live check (new terminal):  mysql -u av_passenger -p airline_intelligence
--   SELECT CURRENT_USER(), CURRENT_ROLE();
--   SELECT flight_number, departure_time FROM flights LIMIT 5;      -- OK
--   UPDATE flight_fares SET current_fare = 1;                       -- ERROR 1142 denied
--   DELETE FROM payments;                                           -- ERROR 1142 denied
--   UPDATE users SET role = 'ADMIN';                                -- ERROR 1142 denied
--   CALL sp_book_flight(<user_id>, <flight_id>, <flight_fare_id>, 'UPI', @id, @ref);  -- OK, via procedure
