import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { withDb, withConnection } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { BookingInput } from '@/lib/validators';
import { readBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/bookings — the signed-in user's bookings (from v_booking_details),
 * with the refund they would get if they cancelled now (fn_refund_amount).
 */
export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'Please sign in to view your bookings' }, { status: 401 });

  const r = await withDb(async (pool) => {
    await pool.query('CALL sp_complete_departed_flights()');
    const [rows] = await pool.execute(
      `SELECT v.*,
              fn_refund_amount(v.booking_id) AS refund_if_cancelled_now,
              (v.booking_status = 'CONFIRMED' AND v.departure_time > NOW()) AS can_cancel
         FROM v_booking_details v
        WHERE v.user_id = ?
        ORDER BY v.departure_time DESC`,
      [u.userId]
    );
    return rows;
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ bookings: r.value });
}

/**
 * POST /api/bookings  { flightId, flightFareId, paymentType }
 * Calls sp_book_flight, which in ONE transaction locks the fare row
 * (SELECT ... FOR UPDATE), validates flight/fare/seat rules, inserts the
 * booking + exactly one simulated payment, and confirms the booking (the
 * trigger moves seat inventory). Any rule failure rolls everything back.
 */
export async function POST(req: NextRequest) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'Please sign in to book a flight' }, { status: 401 });
  if (u.role === 'ADMIN') {
    return NextResponse.json({ error: 'Admin accounts cannot book flights. Sign in as a passenger.' }, { status: 403 });
  }

  const body = await readBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  const parsed = BookingInput.safeParse(body.body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid booking request' }, { status: 400 });
  }
  const { flightId, flightFareId, paymentType } = parsed.data;

  const r = await withConnection(async (conn) => {
    await conn.query('CALL sp_book_flight(?, ?, ?, ?, @bid, @ref)', [u.userId, flightId, flightFareId, paymentType]);
    const [[out]] = await conn.query<RowDataPacket[]>('SELECT @bid AS bookingId, @ref AS bookingReference');
    return { bookingId: Number(out.bookingId), bookingReference: String(out.bookingReference) };
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, ...r.value }, { status: 201 });
}
