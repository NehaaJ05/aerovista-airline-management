import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getPool } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { RegisterInput } from '@/lib/validators';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = RegisterInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    );
  }
  const { name, email, password, phone } = parsed.data;

  let pool;
  try {
    pool = getPool();
  } catch (e) {
    return NextResponse.json(
      { error: 'Database not configured. Set DATABASE_URL in .env.local.' },
      { status: 503 }
    );
  }

  const hash = await bcrypt.hash(password, 12);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Role is pinned server-side to PASSENGER; the client cannot escalate.
    const [result] = await conn.execute(
      'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [name, email, phone ?? null, hash, 'PASSENGER']
    );
    const insertId = (result as { insertId: number }).insertId;

    await conn.execute('INSERT INTO passengers (user_id) VALUES (?)', [insertId]);
    await conn.commit();

    await createSession({ userId: insertId, name, email, role: 'PASSENGER' });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    try { await conn.rollback(); } catch { /* ignore */ }
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('ER_DUP_ENTRY') || msg.toLowerCase().includes('duplicate')) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }
    return NextResponse.json(
      { error: 'Registration failed. Check server configuration.' },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
