
USE airline_intelligence;

-- Update the revenue view to match the current project schema.

CREATE OR REPLACE VIEW v_revenue_by_flight AS
SELECT
    f.flight_id,
    f.flight_number,
    oa.airport_code AS origin_code,
    da.airport_code AS destination_code,

    COALESCE(bk.gross_revenue, 0) AS gross_revenue,
    COALESCE(bk.refunds, 0) AS refunds,

    COALESCE(bk.gross_revenue, 0)
        - COALESCE(bk.refunds, 0) AS net_revenue,

    IF(f.status = 'CANCELLED', 0, f.fuel_cost) AS fuel_cost,

    COALESCE(bk.gross_revenue, 0)
        - COALESCE(bk.refunds, 0)
        - IF(f.status = 'CANCELLED', 0, f.fuel_cost)
        AS revenue_after_fuel,

    f.departure_time,
    f.status,
    r.route_id,

    COALESCE(bk.active_bookings, 0) AS active_bookings,
    COALESCE(bk.cancelled_bookings, 0) AS cancelled_bookings

FROM flights f

JOIN routes r
    ON r.route_id = f.route_id

JOIN airports oa
    ON oa.airport_id = r.origin_airport_id

JOIN airports da
    ON da.airport_id = r.destination_airport_id

LEFT JOIN (
    SELECT
        b.flight_id,

        SUM(
            b.booking_status IN ('CONFIRMED', 'COMPLETED')
        ) AS active_bookings,

        SUM(
            b.booking_status = 'CANCELLED'
        ) AS cancelled_bookings,

        SUM(
            CASE
                WHEN p.payment_status IN (
                    'SUCCESS',
                    'REFUNDED',
                    'PARTIALLY_REFUNDED'
                )
                THEN p.amount
                ELSE 0
            END
        ) AS gross_revenue,

        SUM(
            COALESCE(c.refund_amount, 0)
        ) AS refunds

    FROM bookings b

    LEFT JOIN payments p
        ON p.booking_id = b.booking_id

    LEFT JOIN cancellations c
        ON c.booking_id = b.booking_id

    GROUP BY b.flight_id
) bk
    ON bk.flight_id = f.flight_id;


-- Create the summary view used by admin KPI cards.

CREATE OR REPLACE VIEW v_revenue_summary AS
SELECT
    COUNT(*) AS total_flights,

    SUM(status IN ('SCHEDULED', 'DELAYED'))
        AS upcoming_flights,

    SUM(status = 'COMPLETED')
        AS completed_flights,

    SUM(status = 'CANCELLED')
        AS cancelled_flights,

    COALESCE(SUM(gross_revenue), 0)
        AS gross_revenue,

    COALESCE(SUM(refunds), 0)
        AS total_refunds,

    COALESCE(SUM(net_revenue), 0)
        AS net_revenue,

    COALESCE(SUM(fuel_cost), 0)
        AS fuel_cost,

    COALESCE(SUM(revenue_after_fuel), 0)
        AS revenue_after_fuel

FROM v_revenue_by_flight;
