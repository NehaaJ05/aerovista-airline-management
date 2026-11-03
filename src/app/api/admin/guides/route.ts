import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb, hasMongo, mongoUnavailable } from '@/lib/mongo';
import { requireAdmin } from '@/lib/auth';
import { GUIDES, ensureGuidesCollection, publicGuide } from '@/lib/guides';
import { GuideInput } from '@/lib/validators';
import { embedText, guideText } from '@/lib/embedding';
import { readBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** GET /api/admin/guides — all guides incl. embedding size (admin READ) */
export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  if (!hasMongo()) return NextResponse.json(mongoUnavailable(), { status: 503 });
  try {
    const db = await getMongoDb();
    const docs = await db.collection(GUIDES).aggregate([
      { $addFields: { embedding_dims: { $size: { $ifNull: ['$embedding', []] } } } },
      { $project: { embedding: 0 } },
      { $sort: { city: 1 } },
    ]).toArray();
    return NextResponse.json({ guides: docs.map(publicGuide) });
  } catch {
    return NextResponse.json({ error: 'MongoDB unavailable' }, { status: 503 });
  }
}

/** POST /api/admin/guides — CREATE (embedding generated server-side) */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  if (!hasMongo()) return NextResponse.json(mongoUnavailable(), { status: 503 });
  const body = await readBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  const parsed = GuideInput.safeParse(body.body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const db = await getMongoDb();
    const col = await ensureGuidesCollection(db);
    const now = new Date();
    const doc = { ...parsed.data, embedding: embedText(guideText(parsed.data)), created_at: now, updated_at: now, updated_by: admin.email };
    const res = await col.insertOne(doc);
    return NextResponse.json({ guide: publicGuide({ ...doc, _id: res.insertedId }) }, { status: 201 });
  } catch (e: any) {
    if (e?.code === 11000) return NextResponse.json({ error: 'A guide for this airport already exists' }, { status: 409 });
    if (e?.code === 121) return NextResponse.json({ error: 'Rejected by the collection validator' }, { status: 400 });
    return NextResponse.json({ error: 'MongoDB unavailable' }, { status: 503 });
  }
}
