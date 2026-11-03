-- =====================================================================
-- Migration 002: add AFTER INSERT trigger as defence in depth
-- Idempotent: drops first, then creates.
-- =====================================================================
USE airline_intelligence;

DROP TRIGGER IF EXISTS trg_booking_insert_confirmed;

DELIMITER $$
CREATE TRIGGER trg_booking_insert_confirmed
AFTER INSERT ON bookings
FOR EACH ROW
BEGIN
  IF NEW.booking_status = 'CONFIRMED' THEN
    UPDATE flight_fares
       SET sold_seats = sold_seats + 1
     WHERE flight_fare_id = NEW.flight_fare_id
       AND sold_seats < allocated_seats;

    IF ROW_COUNT() = 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Cannot create confirmed booking: fare is sold out';
    END IF;
  END IF;
END$$
DELIMITER ;
