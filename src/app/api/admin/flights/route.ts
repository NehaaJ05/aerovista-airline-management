import { NextRequest, NextResponse } from 'next/server';
import { withDb } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { groupFlightRows, FLIGHT_SELECT } from '@/lib/flights';
import { IsoDate } from '@/lib/validators';

export const dynamic = 'force-dynamic';

/** GET /api/admin/flights?date=YYYY-MM-DD — flights of a day with fares + inventory */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const rawDate = req.nextUrl.searchParams.get('date');
  const date = rawDate ? IsoDate.safeParse(rawDate) : null;
  if (date && !date.success) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });

  const r = await withDb(async (pool) => {
    const [rows] = await pool.execute(
      `${FLIGHT_SELECT}
        WHERE DATE(f.departure_time) = COALESCE(?, CURDATE() + INTERVAL 1 DAY)
        ORDER BY f.departure_time, fc.sort_order`,
      [date?.success ? date.data : null]
    );
    const flights = groupFlightRows(rows as any[]);
    const [fuel] = await pool.query(
      `SELECT flight_id, fuel_cost FROM flights WHERE flight_id IN (?)`,
      [flights.length ? flights.map((f) => f.flight_id) : [0]]
    );
    const fuelBy = new Map((fuel as any[]).map((x) => [x.flight_id, Number(x.fuel_cost)]));
    return flights.map((f) => ({ ...f, fuel_cost: fuelBy.get(f.flight_id) ?? 0 }));
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ flights: r.value });
}
