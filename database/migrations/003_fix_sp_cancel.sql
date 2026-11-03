-- =====================================================================
-- Migration 003: replace sp_cancel_booking
-- Removes the unsafe ON DUPLICATE KEY UPDATE on cancellations.
-- =====================================================================
USE airline_intelligence;

DROP PROCEDURE IF EXISTS sp_cancel_booking;

DELIMITER $$
CREATE PROCEDURE sp_cancel_booking(
  IN p_booking_id BIGINT UNSIGNED,
  IN p_refund     DECIMAL(12,2),
  IN p_reason     VARCHAR(255)
)
BEGIN
  DECLARE v_status            VARCHAR(20);
  DECLARE v_already_cancelled INT DEFAULT 0;

  START TRANSACTION;

  SELECT booking_status INTO v_status
    FROM bookings
   WHERE booking_id = p_booking_id
   FOR UPDATE;

  IF v_status IS NULL THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Booking not found';
  END IF;
  IF v_status = 'CANCELLED' THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Booking already cancelled';
  END IF;
  IF v_status <> 'CONFIRMED' THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only confirmed bookings can be cancelled';
  END IF;

  SELECT COUNT(*) INTO v_already_cancelled
    FROM cancellations
   WHERE booking_id = p_booking_id;
  IF v_already_cancelled > 0 THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cancellation record already exists';
  END IF;

  INSERT INTO cancellations (booking_id, refund_amount, reason)
  VALUES (p_booking_id, p_refund, p_reason);

  UPDATE payments
     SET payment_status = 'REFUNDED'
   WHERE booking_id = p_booking_id
     AND payment_status = 'SUCCESS';

  UPDATE bookings
     SET booking_status = 'CANCELLED'
   WHERE booking_id = p_booking_id;

  COMMIT;
END$$
DELIMITER ;
