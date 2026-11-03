import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { withConnection } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { CancelInput } from '@/lib/validators';

export const dynamic = 'force-dynamic';

/** POST /api/admin/flights/:id/cancel — sp_cancel_flight: cancels every booking with a 100% refund */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid flight id' }, { status: 400 });
  let body: unknown = {};
  try { body = await req.json(); } catch { /* optional */ }
  const parsed = CancelInput.safeParse(body ?? {});
  const reason = (parsed.success && parsed.data.reason) || 'Flight cancelled by airline';

  const r = await withConnection(async (conn) => {
    await conn.query('CALL sp_cancel_flight(?, ?, ?, @n, @t)', [id, admin.userId, reason]);
    const [[out]] = await conn.query<RowDataPacket[]>('SELECT @n AS n, @t AS t');
    return { bookingsCancelled: Number(out.n), totalRefund: Number(out.t) };
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, ...r.value });
}
