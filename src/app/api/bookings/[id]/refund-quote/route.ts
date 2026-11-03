import { NextResponse } from 'next/server';
import { withDb } from '@/lib/db';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** GET /api/bookings/:id/refund-quote — what sp_cancel_booking would refund right now */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid booking id' }, { status: 400 });

  const r = await withDb(async (pool) => {
    const [rows] = await pool.execute(
      `SELECT b.booking_id, b.user_id, b.booking_status, f.departure_time,
              TIMESTAMPDIFF(MINUTE, NOW(), f.departure_time) AS minutes_to_departure,
              fc.class_name, fc.refund_pct, fc.late_refund_pct,
              p.amount AS paid_amount, fn_refund_amount(b.booking_id) AS refund_amount
         FROM bookings b
         JOIN flights f       ON f.flight_id = b.flight_id
         JOIN flight_fares ff ON ff.flight_fare_id = b.flight_fare_id
         JOIN fare_classes fc ON fc.fare_class_id = ff.fare_class_id
         LEFT JOIN payments p ON p.booking_id = b.booking_id
        WHERE b.booking_id = ?`,
      [id]
    );
    return (rows as any[])[0] ?? null;
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  if (!r.value || (r.value.user_id !== u.userId && u.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }
  const q = r.value;
  const early = Number(q.minutes_to_departure) >= 24 * 60;
  return NextResponse.json({
    quote: {
      bookingId: q.booking_id,
      cancellable: q.booking_status === 'CONFIRMED' && Number(q.minutes_to_departure) > 0,
      paidAmount: Number(q.paid_amount ?? 0),
      refundAmount: Number(q.refund_amount),
      appliedPct: early ? Number(q.refund_pct) : Number(q.late_refund_pct),
      window: early ? '24h+ before departure' : 'under 24h before departure',
      className: q.class_name,
    },
  });
}
