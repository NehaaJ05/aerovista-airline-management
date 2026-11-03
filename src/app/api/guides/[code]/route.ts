import { NextResponse } from 'next/server';
import { getMongoDb, hasMongo, mongoUnavailable } from '@/lib/mongo';
import { GUIDES, publicGuide } from '@/lib/guides';
import { AirportCode } from '@/lib/validators';

export const dynamic = 'force-dynamic';

/** GET /api/guides/:airportCode — one guide (shown next to search results) */
export async function GET(_req: Request, { params }: { params: { code: string } }) {
  if (!hasMongo()) return NextResponse.json(mongoUnavailable(), { status: 503 });
  const code = AirportCode.safeParse(params.code);
  if (!code.success) return NextResponse.json({ error: 'Invalid airport code' }, { status: 400 });
  try {
    const db = await getMongoDb();
    const doc = await db.collection(GUIDES).findOne({ airport_code: code.data }, { projection: { embedding: 0 } });
    if (!doc) return NextResponse.json({ error: 'No guide for this destination' }, { status: 404 });
    return NextResponse.json({ guide: publicGuide(doc) });
  } catch {
    return NextResponse.json({ error: 'MongoDB unavailable' }, { status: 503 });
  }
}
