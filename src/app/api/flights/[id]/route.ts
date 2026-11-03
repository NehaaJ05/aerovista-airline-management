import { NextResponse } from 'next/server';
import { withDb } from '@/lib/db';
import { groupFlightRows, FLIGHT_SELECT } from '@/lib/flights';

export const dynamic = 'force-dynamic';

/** GET /api/flights/:id — one flight with its fares (booking review page) */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid flight id' }, { status: 400 });
  }
  const r = await withDb(async (pool) => {
    const [rows] = await pool.execute(`${FLIGHT_SELECT} WHERE f.flight_id = ? ORDER BY fc.sort_order`, [id]);
    return groupFlightRows(rows as any[])[0] ?? null;
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  if (!r.value) return NextResponse.json({ error: 'Flight not found' }, { status: 404 });
  return NextResponse.json({ flight: r.value });
}
