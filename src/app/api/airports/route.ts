import { NextResponse } from 'next/server';
import { withDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** GET /api/airports — airports that have at least one route */
export async function GET() {
  const r = await withDb(async (pool) => {
    const [rows] = await pool.query(
      `SELECT a.airport_code, a.city, a.airport_name
         FROM airports a
        WHERE EXISTS (SELECT 1 FROM routes r
                       WHERE r.origin_airport_id = a.airport_id OR r.destination_airport_id = a.airport_id)
        ORDER BY a.city`
    );
    return rows;
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ airports: r.value });
}
