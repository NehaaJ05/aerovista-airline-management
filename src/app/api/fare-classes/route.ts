import { NextResponse } from 'next/server';
import { withDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** GET /api/fare-classes — fare families with their policy + benefits */
export async function GET() {
  const r = await withDb(async (pool) => {
    const [rows] = await pool.query(
      `SELECT fare_class_id, class_code, class_name, refundable, refund_pct, late_refund_pct,
              cabin_baggage_kg, checkin_baggage_kg, meal_included, priority_boarding
         FROM fare_classes ORDER BY sort_order`
    );
    return rows;
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ fareClasses: r.value });
}
