
USE airline_intelligence;

-- ============================================================
-- 1. RESTORE MISSING FARE CLASS COLUMNS
-- ============================================================

ALTER TABLE fare_classes
    ADD COLUMN refund_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
    ADD COLUMN late_refund_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
    ADD COLUMN cabin_baggage_kg TINYINT UNSIGNED NOT NULL DEFAULT 7,
    ADD COLUMN checkin_baggage_kg TINYINT UNSIGNED NOT NULL DEFAULT 15,
    ADD COLUMN meal_included BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN priority_boarding BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN sort_order TINYINT UNSIGNED NOT NULL DEFAULT 1;


-- ============================================================
-- 2. RESTORE ORIGINAL FARE POLICIES
-- Existing fare_class_id values are preserved.
-- ============================================================

UPDATE fare_classes
SET
    refundable = 0,
    refund_pct = 0,
    late_refund_pct = 0,
    cabin_baggage_kg = 7,
    checkin_baggage_kg = 15,
    meal_included = 0,
    priority_boarding = 0,
    sort_order = 1
WHERE class_code = 'ECO';

UPDATE fare_classes
SET
    refundable = 1,
    refund_pct = 100,
    late_refund_pct = 50,
    cabin_baggage_kg = 7,
    checkin_baggage_kg = 20,
    meal_included = 1,
    priority_boarding = 0,
    sort_order = 2
WHERE class_code = 'FLEX';

UPDATE fare_classes
SET
    refundable = 1,
    refund_pct = 100,
    late_refund_pct = 75,
    cabin_baggage_kg = 14,
    checkin_baggage_kg = 35,
    meal_included = 1,
    priority_boarding = 1,
    sort_order = 3
WHERE class_code = 'BUS';


-- ============================================================
-- 3. RESTORE FARE CLASS VALIDATION
-- ============================================================

ALTER TABLE fare_classes
    ADD CONSTRAINT chk_fc_refund_range
    CHECK (
        refund_pct BETWEEN 0 AND 100
        AND late_refund_pct BETWEEN 0 AND refund_pct
    );

ALTER TABLE fare_classes
    ADD CONSTRAINT chk_fc_refundable
    CHECK (
        (refundable = 1 AND refund_pct > 0)
        OR
        (refundable = 0 AND refund_pct = 0)
    );


-- ============================================================
-- 4. RESTORE FLIGHT OCCUPANCY VIEW
-- Include flight status for admin analytics.
-- ============================================================

CREATE OR REPLACE VIEW v_flight_occupancy AS
SELECT
    f.flight_id,
    f.flight_number,
    f.departure_time,
    r.route_id,
    oa.airport_code AS origin_code,
    da.airport_code AS destination_code,

    COALESCE(
        SUM(ff.allocated_seats),
        f.available_seats
    ) AS allocated_seats,

    COALESCE(
        SUM(ff.sold_seats),
        0
    ) AS sold_seats,

    COALESCE(
        ROUND(
            100 * SUM(ff.sold_seats)
            / NULLIF(SUM(ff.allocated_seats), 0),
            2
        ),
        0
    ) AS occupancy_pct,

    f.status

FROM flights f

JOIN routes r
    ON r.route_id = f.route_id

JOIN airports oa
    ON oa.airport_id = r.origin_airport_id

JOIN airports da
    ON da.airport_id = r.destination_airport_id

LEFT JOIN flight_fares ff
    ON ff.flight_id = f.flight_id

GROUP BY
    f.flight_id,
    f.flight_number,
    f.departure_time,
    r.route_id,
    oa.airport_code,
    da.airport_code,
    f.available_seats,
    f.status;
