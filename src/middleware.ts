import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * Page-level route protection (the API routes check the session again,
 * so this is a UX layer, not the only guard):
 *   /admin/*                      -> ADMIN only
 *   /bookings/*, /book, /profile  -> any signed-in user
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = req.cookies.get('airline_session')?.value;
  let role: string | null = null;
  if (token && process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET));
      role = String((payload as any).role ?? '');
    } catch {
      role = null;
    }
  }
  const toLogin = () => {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  };
  if (pathname.startsWith('/admin')) {
    if (!role) return toLogin();
    if (role !== 'ADMIN') {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      url.search = '?denied=admin';
      return NextResponse.redirect(url);
    }
  } else if (!role) {
    return toLogin();
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/bookings/:path*', '/book', '/profile'],
};
