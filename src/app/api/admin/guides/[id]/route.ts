import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getMongoDb, hasMongo, mongoUnavailable } from '@/lib/mongo';
import { requireAdmin } from '@/lib/auth';
import { GUIDES, publicGuide } from '@/lib/guides';
import { GuideInput } from '@/lib/validators';
import { embedText, guideText } from '@/lib/embedding';
import { readBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

function oid(id: string) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

/** PUT /api/admin/guides/:id — UPDATE (re-computes the embedding) */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  if (!hasMongo()) return NextResponse.json(mongoUnavailable(), { status: 503 });
  const _id = oid(params.id);
  if (!_id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const body = await readBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  const parsed = GuideInput.safeParse(body.body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const db = await getMongoDb();
    const res = await db.collection(GUIDES).findOneAndUpdate(
      { _id },
      { $set: { ...parsed.data, embedding: embedText(guideText(parsed.data)), updated_at: new Date(), updated_by: admin.email } },
      { returnDocument: 'after', projection: { embedding: 0 } }
    );
    if (!res) return NextResponse.json({ error: 'Guide not found' }, { status: 404 });
    return NextResponse.json({ guide: publicGuide(res) });
  } catch (e: any) {
    if (e?.code === 11000) return NextResponse.json({ error: 'Another guide already uses this airport' }, { status: 409 });
    return NextResponse.json({ error: 'MongoDB unavailable' }, { status: 503 });
  }
}

/** DELETE /api/admin/guides/:id — DELETE */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  if (!hasMongo()) return NextResponse.json(mongoUnavailable(), { status: 503 });
  const _id = oid(params.id);
  if (!_id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  try {
    const db = await getMongoDb();
    const res = await db.collection(GUIDES).deleteOne({ _id });
    if (!res.deletedCount) return NextResponse.json({ error: 'Guide not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'MongoDB unavailable' }, { status: 503 });
  }
}
