import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { withConnection } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { CancelInput } from '@/lib/validators';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings/:id/cancel  { reason? }
 *
 * Delegates entirely to sp_cancel_booking, which (in one transaction):
 *   - locks the booking row (FOR UPDATE) so concurrent cancels serialise
 *   - checks ownership (or ADMIN), status, and that the flight hasn't left
 *   - computes the refund from the fare-class policy (fn_refund_amount),
 *     capped at the amount paid — the client cannot choose the refund
 *   - inserts the single cancellation row, marks the payment
 *     REFUNDED / PARTIALLY_REFUNDED, and CANCELs the booking
 *     (trigger releases the seat exactly once)
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });

  const bookingId = Number(params.id);
  if (!Number.isSafeInteger(bookingId) || bookingId <= 0) {
    return NextResponse.json({ error: 'Invalid booking id' }, { status: 400 });
  }

  let body: unknown = {};
  try { body = await req.json(); } catch { /* body optional */ }
  const parsed = CancelInput.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: 'Reason is too long' }, { status: 400 });
  const reason = parsed.data.reason || (u.role === 'ADMIN' ? 'Cancelled by admin' : 'Cancelled by passenger');

  const r = await withConnection(async (conn) => {
    await conn.query('CALL sp_cancel_booking(?, ?, ?, @refund)', [bookingId, u.userId, reason]);
    const [[out]] = await conn.query<RowDataPacket[]>('SELECT @refund AS refund');
    const [[c]] = await conn.query<RowDataPacket[]>(
      'SELECT refund_policy FROM cancellations WHERE booking_id = ?', [bookingId]
    );
    return { refundAmount: Number(out.refund), refundPolicy: c?.refund_policy ?? null };
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, bookingId, ...r.value });
}
