import { NextResponse } from 'next/server';
import { withDb } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/analytics  (admin only)
 * Every figure comes from the MySQL analytics views — revenue is never
 * re-computed here, so KPI cards, charts and tables always agree:
 *   v_revenue_summary   -> KPI totals (built from v_revenue_by_flight)
 *   v_revenue_by_flight -> flight-wise revenue table
 *   v_flight_occupancy  -> seats sold / allocated / occupancy
 *   v_daily_revenue     -> revenue trend
 *   v_route_performance -> route comparison
 */
export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;

  const r = await withDb(async (pool) => {
    await pool.query('CALL sp_complete_departed_flights()');

    const [[summary]] = (await pool.query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM bookings)                                       AS total_bookings,
              (SELECT COUNT(*) FROM bookings WHERE booking_status = 'CONFIRMED')    AS confirmed_bookings,
              (SELECT COUNT(*) FROM bookings WHERE booking_status = 'COMPLETED')    AS completed_bookings,
              (SELECT COUNT(*) FROM bookings WHERE booking_status = 'CANCELLED')    AS cancelled_bookings,
              (SELECT ROUND(AVG(occupancy_pct), 2) FROM v_flight_occupancy WHERE status <> 'CANCELLED') AS avg_occupancy,
              (SELECT ROUND(AVG(occupancy_pct), 2) FROM v_flight_occupancy WHERE status = 'COMPLETED')  AS avg_occupancy_completed,
              (SELECT ROUND(AVG(occupancy_pct), 2) FROM v_flight_occupancy WHERE status IN ('SCHEDULED','DELAYED')) AS avg_occupancy_upcoming,
              (SELECT COALESCE(SUM(sold_seats), 0) FROM v_flight_occupancy WHERE status <> 'CANCELLED') AS seats_sold,
              (SELECT COALESCE(SUM(allocated_seats), 0) FROM v_flight_occupancy WHERE status <> 'CANCELLED') AS seats_allocated
         FROM v_revenue_summary s`
    )) as any;

    const [daily] = await pool.query(
      `SELECT revenue_date, gross_revenue, refunds, net_revenue, bookings, cancellations
         FROM v_daily_revenue
        WHERE revenue_date >= CURDATE() - INTERVAL 29 DAY
        ORDER BY revenue_date`
    );
    const [routes] = await pool.query(`SELECT * FROM v_route_performance ORDER BY net_revenue DESC`);
    const [flights] = await pool.query(
      `SELECT rv.flight_id, rv.flight_number, rv.origin_code, rv.destination_code, rv.departure_time, rv.status,
              o.allocated_seats, o.sold_seats, o.occupancy_pct,
              rv.active_bookings, rv.cancelled_bookings,
              rv.gross_revenue, rv.refunds, rv.net_revenue, rv.fuel_cost, rv.revenue_after_fuel
         FROM v_revenue_by_flight rv
         JOIN v_flight_occupancy o ON o.flight_id = rv.flight_id
        ORDER BY rv.departure_time`
    );
    const [statusMix] = await pool.query(
      `SELECT booking_status AS status, COUNT(*) AS count FROM bookings GROUP BY booking_status`
    );
    const [fareMix] = await pool.query(
      `SELECT fc.class_name, fc.class_code,
              SUM(b.booking_status IN ('CONFIRMED','COMPLETED')) AS seats_sold,
              SUM(b.booking_status = 'CANCELLED')                AS cancellations,
              COALESCE(SUM(CASE WHEN p.payment_status IN ('SUCCESS','REFUNDED','PARTIALLY_REFUNDED') THEN p.amount END), 0) AS gross_revenue,
              COALESCE(SUM(c.refund_amount), 0) AS refunds
         FROM fare_classes fc
         JOIN flight_fares ff ON ff.fare_class_id = fc.fare_class_id
         LEFT JOIN bookings b      ON b.flight_fare_id = ff.flight_fare_id
         LEFT JOIN payments p      ON p.booking_id = b.booking_id
         LEFT JOIN cancellations c ON c.booking_id = b.booking_id
        GROUP BY fc.fare_class_id, fc.class_name, fc.class_code, fc.sort_order
        ORDER BY fc.sort_order`
    );
    return { summary, daily, routes, flights, statusMix, fareMix };
  });

  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ...r.value, generatedAt: new Date().toISOString() });
}
