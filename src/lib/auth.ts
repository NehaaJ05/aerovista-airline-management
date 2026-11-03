import { cookies } from 'next/headers';
import { SignJWT, jwtVerify, JWTPayload } from 'jose';

export type Role = 'PASSENGER' | 'ADMIN';

export type SessionUser = {
  userId: number;
  name: string;
  email: string;
  role: Role;
};

const COOKIE_NAME = 'airline_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters');
  }
  return new TextEncoder().encode(s);
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT(user as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      userId: Number((payload as any).userId),
      name: String((payload as any).name),
      email: String((payload as any).email),
      role: (payload as any).role === 'ADMIN' ? 'ADMIN' : 'PASSENGER',
    };
  } catch {
    return null;
  }
}

export function clearSession(): void {
  cookies().set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function requireUser(): Promise<SessionUser | Response> {
  const u = await currentUser();
  if (!u) {
    return new Response(JSON.stringify({ error: 'Login required' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  return u;
}

export async function requireAdmin(): Promise<SessionUser | Response> {
  const u = await currentUser();
  if (!u || u.role !== 'ADMIN') {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
  return u;
}
