import { NextRequest, NextResponse } from 'next/server';
import { withDb } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { AdminFlightUpdate } from '@/lib/validators';
import { readBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** PATCH /api/admin/flights/:id { status?: SCHEDULED|DELAYED, fuelCost? } */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid flight id' }, { status: 400 });
  const body = await readBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  const parsed = AdminFlightUpdate.safeParse(body.body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const r = await withDb(async (pool) => {
    // Only flights that have not departed and are not cancelled/completed can be edited.
    const [res] = await pool.execute(
      `UPDATE flights
          SET status    = COALESCE(?, status),
              fuel_cost = COALESCE(?, fuel_cost)
        WHERE flight_id = ? AND status IN ('SCHEDULED','DELAYED') AND departure_time > NOW()`,
      [parsed.data.status ?? null, parsed.data.fuelCost ?? null, id]
    );
    return (res as any).affectedRows as number;
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  if (!r.value) return NextResponse.json({ error: 'Flight not found or no longer editable' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
