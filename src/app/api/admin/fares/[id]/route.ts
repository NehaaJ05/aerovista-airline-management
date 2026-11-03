import { NextRequest, NextResponse } from 'next/server';
import { withDb } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { AdminFareUpdate } from '@/lib/validators';
import { readBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/fares/:id { currentFare?, allocatedSeats? }
 * Price changes affect only NEW bookings (existing bookings keep their
 * total_amount). Seat allocation can never go below seats already sold —
 * enforced by CHECK (sold_seats <= allocated_seats) in MySQL.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid fare id' }, { status: 400 });
  const body = await readBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  const parsed = AdminFareUpdate.safeParse(body.body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const r = await withDb(async (pool) => {
    const [res] = await pool.execute(
      `UPDATE flight_fares ff
         JOIN flights f ON f.flight_id = ff.flight_id
          SET ff.current_fare    = COALESCE(?, ff.current_fare),
              ff.allocated_seats = COALESCE(?, ff.allocated_seats)
        WHERE ff.flight_fare_id = ? AND f.status IN ('SCHEDULED','DELAYED') AND f.departure_time > NOW()`,
      [parsed.data.currentFare ?? null, parsed.data.allocatedSeats ?? null, id]
    );
    return (res as any).affectedRows as number;
  });
  if (!r.ok) {
    const msg = r.status === 409 ? 'Allocated seats cannot be lower than seats already sold' : r.error;
    return NextResponse.json({ error: msg }, { status: r.status });
  }
  if (!r.value) return NextResponse.json({ error: 'Fare not found or flight no longer editable' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
