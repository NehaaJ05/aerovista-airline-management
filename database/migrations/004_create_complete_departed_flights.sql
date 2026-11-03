
USE airline_intelligence;

DROP PROCEDURE IF EXISTS sp_complete_departed_flights;

DELIMITER $$

CREATE PROCEDURE sp_complete_departed_flights()
BEGIN
    UPDATE bookings b
    JOIN flights f
        ON f.flight_id = b.flight_id
    SET b.booking_status = 'COMPLETED'
    WHERE b.booking_status = 'CONFIRMED'
      AND f.status <> 'CANCELLED'
      AND f.arrival_time < NOW();

    UPDATE flights
    SET status = 'COMPLETED'
    WHERE status IN ('SCHEDULED', 'DELAYED')
      AND arrival_time < NOW();
END$$

DELIMITER ;
