import { NextResponse } from 'next/server';
import { withDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/routes/featured
 * Busiest routes with upcoming departures and the lowest available
 * Economy/Flex fare — straight from the schedule and inventory.
 */
export async function GET() {
  const r = await withDb(async (pool) => {
    const [rows] = await pool.query(
      `WITH upcoming AS (
         SELECT f.route_id, f.flight_id, f.departure_time, TIMESTAMPDIFF(MINUTE, f.departure_time, f.arrival_time) AS dur
           FROM flights f
          WHERE f.status IN ('SCHEDULED','DELAYED') AND f.departure_time > NOW() + INTERVAL 1 HOUR
       )
       SELECT o.airport_code AS origin_code, o.city AS origin_city,
              d.airport_code AS destination_code, d.city AS destination_city,
              r.distance_km,
              COUNT(DISTINCT u.flight_id)  AS upcoming_flights,
              MIN(u.dur)                   AS duration_min,
              MIN(u.departure_time)        AS next_departure,
              MIN(CASE WHEN ff.sold_seats < ff.allocated_seats THEN ff.current_fare END) AS from_fare,
              (SELECT COUNT(*) FROM bookings b JOIN flights f2 ON f2.flight_id = b.flight_id
                WHERE f2.route_id = r.route_id AND b.booking_status IN ('CONFIRMED','COMPLETED')) AS passengers_flown
         FROM upcoming u
         JOIN routes r        ON r.route_id = u.route_id
         JOIN airports o      ON o.airport_id = r.origin_airport_id
         JOIN airports d      ON d.airport_id = r.destination_airport_id
         JOIN flight_fares ff ON ff.flight_id = u.flight_id
        GROUP BY r.route_id, o.airport_code, o.city, d.airport_code, d.city, r.distance_km
        HAVING from_fare IS NOT NULL
        ORDER BY passengers_flown DESC
        LIMIT 6`
    );
    return rows;
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ routes: r.value });
}
