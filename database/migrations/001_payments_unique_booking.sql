-- =====================================================================
-- Migration 001: enforce one payment per booking
-- Run this ONCE against an existing database that was created with the
-- old schema (without UNIQUE(booking_id) on payments).
-- Fresh installs that run the current schema.sql do not need this.
-- =====================================================================
USE airline_intelligence;

-- 1. Fail loudly if duplicates exist. Resolve them manually before
--    applying the constraint. Query returns offending booking_ids.
SELECT booking_id, COUNT(*) AS payment_rows
  FROM payments
 GROUP BY booking_id
HAVING payment_rows > 1;

-- 2. Add the UNIQUE constraint. This will fail if the previous SELECT
--    returned any rows — that is intentional.
ALTER TABLE payments
  ADD CONSTRAINT uq_payments_booking UNIQUE (booking_id);
