
-- Migration 007: Restore missing analytics views.
-- Does not modify transactional tables or existing records.

-- Align the existing cancellations table with the canonical schema.
-- Existing cancellation records are preserved.

ALTER TABLE cancellations
    ADD COLUMN cancelled_by BIGINT UNSIGNED NULL,
    ADD COLUMN cancellation_type
        ENUM('PASSENGER','ADMIN','FLIGHT_CANCELLED')
        NOT NULL DEFAULT 'PASSENGER',
    ADD COLUMN refund_policy VARCHAR(120) NULL,
    ADD CONSTRAINT fk_cancel_actor
        FOREIGN KEY (cancelled_by) REFERENCES users(user_id);

CREATE OR REPLACE VIEW v_daily_revenue AS
WITH g AS (
    SELECT
        DATE(paid_at) AS d,
        SUM(amount) AS gross,
        COUNT(*) AS bookings
    FROM payments
    WHERE payment_status IN (
        'SUCCESS',
        'REFUNDED',
        'PARTIALLY_REFUNDED'
    )
      AND paid_at IS NOT NULL
    GROUP BY DATE(paid_at)
),
r AS (
    SELECT
        DATE(cancellation_date) AS d,
        SUM(refund_amount) AS refunds,
        COUNT(*) AS cancellations
    FROM cancellations
    GROUP BY DATE(cancellation_date)
),
days AS (
    SELECT d FROM g
    UNION
    SELECT d FROM r
)
SELECT
    days.d AS revenue_date,
    COALESCE(g.gross, 0) AS gross_revenue,
    COALESCE(r.refunds, 0) AS refunds,
    COALESCE(g.gross, 0) - COALESCE(r.refunds, 0) AS net_revenue,
    COALESCE(g.bookings, 0) AS bookings,
    COALESCE(r.cancellations, 0) AS cancellations
FROM days
LEFT JOIN g ON g.d = days.d
LEFT JOIN r ON r.d = days.d;


-- Route-level performance: load factor and revenue.

CREATE OR REPLACE VIEW v_route_performance AS
SELECT
    rv.route_id,
    rv.origin_code,
    rv.destination_code,
    COUNT(*) AS flights,
    SUM(o.sold_seats) AS sold_seats,
    SUM(o.allocated_seats) AS allocated_seats,
    ROUND(
        100 * SUM(o.sold_seats) /
        NULLIF(SUM(o.allocated_seats), 0),
        2
    ) AS load_factor_pct,
    SUM(rv.gross_revenue) AS gross_revenue,
    SUM(rv.refunds) AS refunds,
    SUM(rv.net_revenue) AS net_revenue,
    SUM(rv.fuel_cost) AS fuel_cost,
    SUM(rv.revenue_after_fuel) AS revenue_after_fuel
FROM v_revenue_by_flight rv
JOIN v_flight_occupancy o
    ON o.flight_id = rv.flight_id
WHERE rv.status <> 'CANCELLED'
GROUP BY
    rv.route_id,
    rv.origin_code,
    rv.destination_code;


-- Passenger booking details view.
-- Restored from the original database/schema.sql.

CREATE OR REPLACE VIEW v_booking_details AS
SELECT
    b.booking_id,
    b.booking_reference,
    b.booking_status,
    b.total_amount,
    b.booked_at,
    b.user_id,

    u.name AS passenger_name,
    u.email AS passenger_email,
    u.phone AS passenger_phone,

    f.flight_id,
    f.flight_number,
    f.departure_time,
    f.arrival_time,
    f.status AS flight_status,

    TIMESTAMPDIFF(
        MINUTE,
        f.departure_time,
        f.arrival_time
    ) AS duration_min,

    o.airport_code AS origin_code,
    o.city AS origin_city,
    o.airport_name AS origin_airport,

    d.airport_code AS destination_code,
    d.city AS destination_city,
    d.airport_name AS destination_airport,

    ac.model AS aircraft_model,
    ac.registration_no,

    fc.class_code,
    fc.class_name,
    fc.refundable,
    fc.refund_pct,
    fc.late_refund_pct,
    fc.cabin_baggage_kg,
    fc.checkin_baggage_kg,
    fc.meal_included,
    fc.priority_boarding,

    p.payment_id,
    p.payment_type,
    p.payment_status,
    p.amount AS paid_amount,
    p.transaction_reference,
    p.paid_at,

    c.refund_amount,
    c.cancellation_date,
    c.reason AS cancellation_reason,
    c.cancellation_type,
    c.refund_policy

FROM bookings b
JOIN users u
    ON u.user_id = b.user_id
JOIN flights f
    ON f.flight_id = b.flight_id
JOIN routes r
    ON r.route_id = f.route_id
JOIN airports o
    ON o.airport_id = r.origin_airport_id
JOIN airports d
    ON d.airport_id = r.destination_airport_id
JOIN aircraft ac
    ON ac.aircraft_id = f.aircraft_id
JOIN flight_fares ff
    ON ff.flight_fare_id = b.flight_fare_id
JOIN fare_classes fc
    ON fc.fare_class_id = ff.fare_class_id
LEFT JOIN payments p
    ON p.booking_id = b.booking_id
LEFT JOIN cancellations c
    ON c.booking_id = b.booking_id;


-- Restore the original passenger booking details view.

CREATE OR REPLACE VIEW v_booking_details AS
SELECT
    b.booking_id,
    b.booking_reference,
    b.booking_status,
    b.total_amount,
    b.booked_at,
    b.user_id,
    u.name AS passenger_name,
    u.email AS passenger_email,
    u.phone AS passenger_phone,
    f.flight_id,
    f.flight_number,
    f.departure_time,
    f.arrival_time,
    f.status AS flight_status,
    TIMESTAMPDIFF(MINUTE, f.departure_time, f.arrival_time) AS duration_min,
    o.airport_code AS origin_code,
    o.city AS origin_city,
    o.airport_name AS origin_airport,
    d.airport_code AS destination_code,
    d.city AS destination_city,
    d.airport_name AS destination_airport,
    ac.model AS aircraft_model,
    ac.registration_no,
    fc.class_code,
    fc.class_name,
    fc.refundable,
    fc.refund_pct,
    fc.late_refund_pct,
    fc.cabin_baggage_kg,
    fc.checkin_baggage_kg,
    fc.meal_included,
    fc.priority_boarding,
    p.payment_id,
    p.payment_type,
    p.payment_status,
    p.amount AS paid_amount,
    p.transaction_reference,
    p.paid_at,
    c.refund_amount,
    c.cancellation_date,
    c.reason AS cancellation_reason,
    c.cancellation_type,
    c.refund_policy
FROM bookings b
JOIN users u ON u.user_id = b.user_id
JOIN flights f ON f.flight_id = b.flight_id
JOIN routes r ON r.route_id = f.route_id
JOIN airports o ON o.airport_id = r.origin_airport_id
JOIN airports d ON d.airport_id = r.destination_airport_id
JOIN aircraft ac ON ac.aircraft_id = f.aircraft_id
JOIN flight_fares ff ON ff.flight_fare_id = b.flight_fare_id
JOIN fare_classes fc ON fc.fare_class_id = ff.fare_class_id
LEFT JOIN payments p ON p.booking_id = b.booking_id
LEFT JOIN cancellations c ON c.booking_id = b.booking_id;
