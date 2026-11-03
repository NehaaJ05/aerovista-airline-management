import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hasMongo, mongoUnavailable } from '@/lib/mongo';
import { searchGuides } from '@/lib/guides';

export const dynamic = 'force-dynamic';

const Body = z.object({ query: z.string().trim().min(2).max(200), limit: z.number().int().min(1).max(10).optional() });

/** POST /api/vector-search { query } — semantic search over destination guides */
export async function POST(req: NextRequest) {
  if (!hasMongo()) return NextResponse.json(mongoUnavailable(), { status: 503 });
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Provide { "query": "beaches and seafood" }' }, { status: 400 });
  try {
    const { engine, results } = await searchGuides(parsed.data.query, parsed.data.limit ?? 3);
    return NextResponse.json({ engine, results });
  } catch {
    return NextResponse.json({ error: 'Vector search failed. Check MongoDB.' }, { status: 500 });
  }
}
