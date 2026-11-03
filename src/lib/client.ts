'use client';
/* Browser-side fetch helper: always returns parsed JSON or a readable error. */
export async function api<T = any>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  try {
    const r = await fetch(url, {
      cache: 'no-store',
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    const text = await r.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: `Server error (${r.status})` }; }
    if (!r.ok && !data.error) data.error = `Request failed (${r.status})`;
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'Network error — is the server running?' } as any };
  }
}

export type Me = { userId: number; name: string; email: string; role: 'PASSENGER' | 'ADMIN' } | null;
