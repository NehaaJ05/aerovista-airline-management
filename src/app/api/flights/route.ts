import { NextRequest, NextResponse } from 'next/server';
import { withDb } from '@/lib/db';
import { FlightSearchQuery } from '@/lib/validators';
import { groupFlightRows, FLIGHT_SELECT } from '@/lib/flights';

export const dynamic = 'force-dynamic';

/**
 * GET /api/flights?origin=BLR&destination=DEL&date=2026-11-05
 * One entry PER FLIGHT, each with all of its fare options (Economy /
 * Flex / Business), including sold-out ones flagged as such.
 * Only upcoming SCHEDULED/DELAYED flights that are still open for
 * booking (> 1 hour to departure) are returned.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const parsed = FlightSearchQuery.safeParse({
    origin: sp.get('origin') ?? '',
    destination: sp.get('destination') ?? '',
    date: sp.get('date') ?? '',
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid search' }, { status: 400 });
  }
  const { origin, destination, date } = parsed.data;

  const r = await withDb(async (pool) => {
    const [rows] = await pool.execute(
      `${FLIGHT_SELECT}
        WHERE f.status IN ('SCHEDULED','DELAYED')
          AND f.departure_time > NOW() + INTERVAL 1 HOUR
          AND (? IS NULL OR o.airport_code = ?)
          AND (? IS NULL OR d.airport_code = ?)
          AND (? IS NULL OR DATE(f.departure_time) = ?)
        ORDER BY f.departure_time, fc.sort_order
        LIMIT 600`,
      [origin ?? null, origin ?? null, destination ?? null, destination ?? null, date ?? null, date ?? null]
    );
    return groupFlightRows(rows as any[]);
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ flights: r.value });
}
