import { NextRequest, NextResponse } from 'next/server';
import { withDb } from '@/lib/db';
import { AirportCode } from '@/lib/validators';

export const dynamic = 'force-dynamic';

/** GET /api/flights/calendar?origin=BLR&destination=DEL — lowest open fare per day */
export async function GET(req: NextRequest) {
  const o = AirportCode.safeParse(req.nextUrl.searchParams.get('origin') ?? '');
  const d = AirportCode.safeParse(req.nextUrl.searchParams.get('destination') ?? '');
  if (!o.success || !d.success) {
    return NextResponse.json({ error: 'origin and destination are required' }, { status: 400 });
  }
  const r = await withDb(async (pool) => {
    const [rows] = await pool.execute(
      `SELECT DATE(f.departure_time) AS date,
              MIN(ff.current_fare) AS min_fare,
              COUNT(DISTINCT f.flight_id) AS flights
         FROM flights f
         JOIN routes r        ON r.route_id = f.route_id
         JOIN airports oa     ON oa.airport_id = r.origin_airport_id
         JOIN airports da     ON da.airport_id = r.destination_airport_id
         JOIN flight_fares ff ON ff.flight_id = f.flight_id AND ff.sold_seats < ff.allocated_seats
        WHERE oa.airport_code = ? AND da.airport_code = ?
          AND f.status IN ('SCHEDULED','DELAYED')
          AND f.departure_time > NOW() + INTERVAL 1 HOUR
        GROUP BY DATE(f.departure_time)
        ORDER BY DATE(f.departure_time)
        LIMIT 21`,
      [o.data, d.data]
    );
    return rows;
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ days: r.value });
}
