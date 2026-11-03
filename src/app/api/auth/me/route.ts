import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/me
 * Returns the current user when authenticated, or `{ user: null }`
 * when not. Always returns JSON, never HTML — the frontend relies on
 * this to decide what to render in the nav and on protected pages.
 */
export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      userId: u.userId,
      name: u.name,
      email: u.email,
      role: u.role,
    },
  });
}
