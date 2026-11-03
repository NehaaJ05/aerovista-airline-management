import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { withDb } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { LoginInput } from '@/lib/validators';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = LoginInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    );
  }
  const { email, password } = parsed.data;

  const result = await withDb(async (pool) => {
    const [rows] = await pool.execute(
      'SELECT user_id, name, email, password_hash, role FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    return rows as Array<{
      user_id: number;
      name: string;
      email: string;
      password_hash: string;
      role: 'PASSENGER' | 'ADMIN';
    }>;
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const user = result.value[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    // Deliberately uniform error to avoid user enumeration.
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  await createSession({
    userId: Number(user.user_id),
    name: user.name,
    email: user.email,
    role: user.role,
  });

  return NextResponse.json({ ok: true, role: user.role });
}
