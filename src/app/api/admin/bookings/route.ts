import { NextRequest, NextResponse } from 'next/server';
import { withDb } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** GET /api/admin/bookings?q=<reference | email | flight no> — latest 50 matches */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 120);

  const r = await withDb(async (pool) => {
    const like = `%${q}%`;
    const [rows] = await pool.execute(
      `SELECT v.booking_id, v.booking_reference, v.booking_status, v.total_amount, v.booked_at,
              v.passenger_name, v.passenger_email, v.flight_number, v.departure_time,
              v.origin_code, v.destination_code, v.class_name, v.payment_status, v.refund_amount,
              v.cancellation_type, v.refund_policy,
              fn_refund_amount(v.booking_id) AS refund_if_cancelled_now,
              (v.booking_status = 'CONFIRMED' AND v.departure_time > NOW()) AS can_cancel
         FROM v_booking_details v
        WHERE ? = '' OR v.booking_reference = ? OR v.passenger_email LIKE ? OR v.flight_number = ?
        ORDER BY v.booked_at DESC, v.booking_id DESC
        LIMIT 50`,
      [q, q.toUpperCase(), like, q.toUpperCase()]
    );
    return rows;
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ bookings: r.value });
}
