
-- ================================================================
-- Migration 003: Restore canonical booking and cancellation logic.
-- Source: original database/schema.sql
--
-- Includes:
--   sp_book_flight
--   sp_cancel_booking
--
-- This migration replaces the outdated three-parameter
-- sp_cancel_booking implementation.
-- Existing bookings, payments and cancellations are preserved.
-- ================================================================

USE airline_intelligence;

DROP PROCEDURE IF EXISTS sp_book_flight;
DROP PROCEDURE IF EXISTS sp_cancel_booking;
DROP FUNCTION IF EXISTS fn_refund_amount;

DELIMITER $$


-- ================================================================
-- FUNCTION: Calculate the refund available for a booking.
-- Source: original database/schema.sql
-- ================================================================

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

    SELECT
        b.booking_status,
        f.departure_time,
        fc.refund_pct,
        fc.late_refund_pct
    INTO
        v_status,
        v_dep,
        v_pct,
        v_late_pct
    FROM bookings b
    JOIN flights f
        ON f.flight_id = b.flight_id
    JOIN flight_fares ff
        ON ff.flight_fare_id = b.flight_fare_id
    JOIN fare_classes fc
        ON fc.fare_class_id = ff.fare_class_id
    WHERE b.booking_id = p_booking_id;

    IF v_status IS NULL
       OR v_status <> 'CONFIRMED'
       OR v_dep <= NOW() THEN
        RETURN 0;
    END IF;

    SELECT COALESCE(SUM(amount), 0)
    INTO v_paid
    FROM payments
    WHERE booking_id = p_booking_id
      AND payment_status = 'SUCCESS';

    RETURN LEAST(
        v_paid,
        ROUND(
            v_paid *
            IF(
                TIMESTAMPDIFF(MINUTE, NOW(), v_dep) >= 24 * 60,
                v_pct,
                v_late_pct
            ) / 100,
            2
        )
    );
END$$

-- ================================================================
-- BOOK A FLIGHT
-- ================================================================

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

    SET p_booking_id = NULL;
    SET p_booking_reference = NULL;

    IF p_payment_type IS NULL
       OR p_payment_type NOT IN ('CARD','UPI','NETBANKING','DEMO') THEN
        SIGNAL SQLSTATE '45000'
            SET MYSQL_ERRNO = 5010,
                MESSAGE_TEXT = 'Unsupported payment method';
    END IF;

    SELECT COUNT(*)
      INTO v_user_ok
      FROM users
     WHERE user_id = p_user_id;

    IF v_user_ok = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MYSQL_ERRNO = 5001,
                MESSAGE_TEXT = 'User not found';
    END IF;

    START TRANSACTION;

    -- Lock the fare row to prevent concurrent overselling.
    SELECT
        ff.flight_id,
        ff.current_fare,
        ff.allocated_seats,
        ff.sold_seats,
        f.status,
        f.departure_time
    INTO
        v_fare_flight,
        v_fare,
        v_alloc,
        v_sold,
        v_fstatus,
        v_dep
    FROM flight_fares ff
    JOIN flights f ON f.flight_id = ff.flight_id
    WHERE ff.flight_fare_id = p_flight_fare_id
    FOR UPDATE OF ff;

    IF v_fare_flight IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MYSQL_ERRNO = 5001,
                MESSAGE_TEXT = 'Fare not found';
    END IF;

    IF v_fare_flight <> p_flight_id THEN
        SIGNAL SQLSTATE '45000'
            SET MYSQL_ERRNO = 5007,
                MESSAGE_TEXT = 'Fare does not belong to this flight';
    END IF;

    IF v_fstatus NOT IN ('SCHEDULED','DELAYED') THEN
        SIGNAL SQLSTATE '45000'
            SET MYSQL_ERRNO = 5006,
                MESSAGE_TEXT = 'This flight is not open for booking';
    END IF;

    IF v_dep <= NOW() + INTERVAL 1 HOUR THEN
        SIGNAL SQLSTATE '45000'
            SET MYSQL_ERRNO = 5006,
                MESSAGE_TEXT = 'Booking has closed for this flight';
    END IF;

    IF v_sold >= v_alloc THEN
        SIGNAL SQLSTATE '45000'
            SET MYSQL_ERRNO = 5005,
                MESSAGE_TEXT = 'This fare is sold out';
    END IF;

    -- Generate a unique 10-character booking reference.
    REPEAT
        SET v_ref = CONCAT(
            'AV',
            UPPER(SUBSTRING(MD5(CONCAT(UUID(), RAND())), 1, 8))
        );
    UNTIL NOT EXISTS (
        SELECT 1
        FROM bookings
        WHERE booking_reference = v_ref
    )
    END REPEAT;

    INSERT INTO bookings (
        user_id,
        flight_id,
        flight_fare_id,
        booking_reference,
        booking_status,
        total_amount
    )
    VALUES (
        p_user_id,
        p_flight_id,
        p_flight_fare_id,
        v_ref,
        'PENDING',
        v_fare
    );

    SET p_booking_id = LAST_INSERT_ID();

    -- Exactly one simulated payment per booking.
    INSERT INTO payments (
        booking_id,
        amount,
        payment_type,
        payment_status,
        transaction_reference,
        paid_at
    )
    VALUES (
        p_booking_id,
        v_fare,
        p_payment_type,
        'SUCCESS',
        CONCAT('SIM-', v_ref),
        NOW()
    );

    -- The existing trigger updates sold-seat inventory.
    UPDATE bookings
       SET booking_status = 'CONFIRMED'
     WHERE booking_id = p_booking_id;

    -- Loyalty: one point per Rs 100 paid.
    SET v_points = FLOOR(v_fare / 100);

    INSERT INTO passengers (user_id, loyalty_points)
    VALUES (p_user_id, v_points)
    ON DUPLICATE KEY UPDATE
        loyalty_points = loyalty_points + v_points;

    UPDATE passengers
       SET loyalty_tier = CASE
            WHEN loyalty_points >= 5000 THEN 'PLATINUM'
            WHEN loyalty_points >= 2500 THEN 'GOLD'
            WHEN loyalty_points >= 1000 THEN 'SILVER'
            ELSE 'STANDARD'
       END
     WHERE user_id = p_user_id;

    SET p_booking_reference = v_ref;

    COMMIT;
END$$


-- ================================================================
-- CANCEL A BOOKING WITH DATABASE-CALCULATED REFUND
-- ================================================================

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

    SELECT role
      INTO v_actor_role
      FROM users
     WHERE user_id = p_actor_user_id;

    IF v_actor_role IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MYSQL_ERRNO = 5002,
                MESSAGE_TEXT = 'Unknown user';
    END IF;

    START TRANSACTION;

    SELECT
        b.user_id,
        b.booking_status,
        f.departure_time,
        fc.class_code,
        fc.refund_pct,
        fc.late_refund_pct
    INTO
        v_owner,
        v_status,
        v_dep,
        v_class,
        v_pct,
        v_late_pct
    FROM bookings b
    JOIN flights f
        ON f.flight_id = b.flight_id
    JOIN flight_fares ff
        ON ff.flight_fare_id = b.flight_fare_id
    JOIN fare_classes fc
        ON fc.fare_class_id = ff.fare_class_id
    WHERE b.booking_id = p_booking_id
    FOR UPDATE OF b;

    IF v_owner IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MYSQL_ERRNO = 5001,
                MESSAGE_TEXT = 'Booking not found';
    END IF;

    IF v_owner <> p_actor_user_id AND v_actor_role <> 'ADMIN' THEN
        SIGNAL SQLSTATE '45000'
            SET MYSQL_ERRNO = 5002,
                MESSAGE_TEXT = 'You can only cancel your own bookings';
    END IF;

    SELECT COUNT(*)
      INTO v_cancelled
      FROM cancellations
     WHERE booking_id = p_booking_id;

    IF v_status = 'CANCELLED' OR v_cancelled > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MYSQL_ERRNO = 5003,
                MESSAGE_TEXT = 'Booking is already cancelled';
    END IF;

    IF v_status <> 'CONFIRMED' THEN
        SIGNAL SQLSTATE '45000'
            SET MYSQL_ERRNO = 5004,
                MESSAGE_TEXT = 'Only confirmed upcoming bookings can be cancelled';
    END IF;

    IF v_dep <= NOW() THEN
        SIGNAL SQLSTATE '45000'
            SET MYSQL_ERRNO = 5004,
                MESSAGE_TEXT = 'This flight has already departed';
    END IF;

    SELECT COALESCE(SUM(amount), 0)
      INTO v_paid
      FROM payments
     WHERE booking_id = p_booking_id
       AND payment_status = 'SUCCESS'
     FOR UPDATE;

    SET v_early = TIMESTAMPDIFF(MINUTE, NOW(), v_dep) >= 24 * 60;
    SET v_refund = fn_refund_amount(p_booking_id);

    IF v_refund > v_paid THEN
        SET v_refund = v_paid;
    END IF;

    INSERT INTO cancellations (
        booking_id,
        refund_amount,
        reason,
        cancelled_by,
        cancellation_type,
        refund_policy
    )
    VALUES (
        p_booking_id,
        v_refund,
        p_reason,
        p_actor_user_id,
        IF(v_owner = p_actor_user_id, 'PASSENGER', 'ADMIN'),
        CONCAT(
            v_class,
            IF(v_early, ' (24h+ before departure): ', ' (under 24h): '),
            TRIM(
                TRAILING '.00'
                FROM CAST(IF(v_early, v_pct, v_late_pct) AS CHAR)
            ),
            '% refund'
        )
    );

    UPDATE payments
       SET payment_status = CASE
            WHEN v_refund = 0 THEN 'SUCCESS'
            WHEN v_refund >= amount THEN 'REFUNDED'
            ELSE 'PARTIALLY_REFUNDED'
       END
     WHERE booking_id = p_booking_id
       AND payment_status = 'SUCCESS';

    -- Existing trigger releases the seat.
    UPDATE bookings
       SET booking_status = 'CANCELLED'
     WHERE booking_id = p_booking_id;

    -- Reverse loyalty points earned on this booking.
    UPDATE passengers
       SET loyalty_points = GREATEST(
            CAST(loyalty_points AS SIGNED) - FLOOR(v_paid / 100),
            0
       )
     WHERE user_id = v_owner;

    SET p_refund_amount = v_refund;

    COMMIT;
END$$

DELIMITER ;
