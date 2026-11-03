import { NextResponse } from 'next/server';

export function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function readBody(req: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false };
  }
}

/** Accepts a numeric id or a 10-char booking reference (AVXXXXXXXX). */
export function parseBookingKey(raw: string): { id?: number; ref?: string } | null {
  if (/^\d+$/.test(raw)) {
    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? { id } : null;
  }
  const ref = raw.trim().toUpperCase();
  return /^[A-Z0-9]{10}$/.test(ref) ? { ref } : null;
}
