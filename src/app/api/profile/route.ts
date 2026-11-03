import { NextRequest, NextResponse } from 'next/server';
import { withDb } from '@/lib/db';
import { currentUser, createSession } from '@/lib/auth';
import { ProfileUpdate } from '@/lib/validators';
import { readBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

async function loadProfile(userId: number) {
  return withDb(async (pool) => {
    const [rows] = await pool.execute(
      `SELECT u.user_id, u.name, u.email, u.phone, u.role, u.created_at,
              p.loyalty_tier, p.loyalty_points,
              (SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.user_id AND b.booking_status = 'COMPLETED') AS trips_completed,
              (SELECT COUNT(*) FROM bookings b JOIN flights f ON f.flight_id = b.flight_id
                WHERE b.user_id = u.user_id AND b.booking_status = 'CONFIRMED' AND f.departure_time > NOW()) AS trips_upcoming,
              (SELECT COALESCE(SUM(b.total_amount), 0) FROM bookings b
                WHERE b.user_id = u.user_id AND b.booking_status IN ('CONFIRMED','COMPLETED')) AS total_spent
         FROM users u LEFT JOIN passengers p ON p.user_id = u.user_id
        WHERE u.user_id = ?`,
      [userId]
    );
    return (rows as any[])[0] ?? null;
  });
}

export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });
  const r = await loadProfile(u.userId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  if (!r.value) return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  return NextResponse.json({ profile: r.value });
}

/** PATCH /api/profile { name, phone } — email and role are not editable */
export async function PATCH(req: NextRequest) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });
  const body = await readBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  const parsed = ProfileUpdate.safeParse(body.body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const w = await withDb(async (pool) => {
    await pool.execute('UPDATE users SET name = ?, phone = ? WHERE user_id = ?',
      [parsed.data.name, parsed.data.phone ?? null, u.userId]);
    return true;
  });
  if (!w.ok) return NextResponse.json({ error: w.error }, { status: w.status });
  await createSession({ ...u, name: parsed.data.name });   // keep the nav name in sync
  const r = await loadProfile(u.userId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ profile: r.value });
}
