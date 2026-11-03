import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb, hasMongo, mongoUnavailable } from '@/lib/mongo';
import { GUIDES, publicGuide, searchGuides } from '@/lib/guides';

export const dynamic = 'force-dynamic';

/**
 * GET /api/guides            -> all destination guides (READ)
 * GET /api/guides?q=beaches  -> vector similarity search
 */
export async function GET(req: NextRequest) {
  if (!hasMongo()) return NextResponse.json(mongoUnavailable(), { status: 503 });
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 200);
  try {
    if (q) {
      const { engine, results } = await searchGuides(q, 3);
      return NextResponse.json({ query: q, engine, guides: results });
    }
    const db = await getMongoDb();
    const docs = await db.collection(GUIDES).find({}, { projection: { embedding: 0 } }).sort({ city: 1 }).toArray();
    return NextResponse.json({ guides: docs.map(publicGuide) });
  } catch {
    return NextResponse.json({ error: 'MongoDB unavailable. Check MONGODB_URI.' }, { status: 503 });
  }
}
