import { NextResponse } from 'next/server';
import { withDb } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { parseBookingKey } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** GET /api/bookings/:idOrReference — owner (or admin) only */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });
  const key = parseBookingKey(params.id);
  if (!key) return NextResponse.json({ error: 'Invalid booking reference' }, { status: 400 });

  const r = await withDb(async (pool) => {
    const [rows] = await pool.execute(
      `SELECT v.*, fn_refund_amount(v.booking_id) AS refund_if_cancelled_now,
              (v.booking_status = 'CONFIRMED' AND v.departure_time > NOW()) AS can_cancel
         FROM v_booking_details v
        WHERE ${key.id ? 'v.booking_id = ?' : 'v.booking_reference = ?'}`,
      [(key.id ?? key.ref) as string | number]
    );
    return (rows as any[])[0] ?? null;
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  // Same 404 for "not yours" and "doesn't exist" — no booking enumeration.
  if (!r.value || (r.value.user_id !== u.userId && u.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }
  return NextResponse.json({ booking: r.value });
}
