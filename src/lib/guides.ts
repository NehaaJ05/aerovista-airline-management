import { ObjectId, type Db } from 'mongodb';
import { getMongoDb } from './mongo';
import { EMBEDDING_DIM, embedText } from './embedding';

export const GUIDES = 'destination_guides';

/** $jsonSchema validator — MongoDB rejects malformed guide documents itself. */
export const GUIDE_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['airport_code', 'city', 'title', 'summary', 'tags', 'embedding', 'updated_at'],
    properties: {
      airport_code: { bsonType: 'string', pattern: '^[A-Z]{3}$' },
      city: { bsonType: 'string', minLength: 2 },
      title: { bsonType: 'string', minLength: 4 },
      summary: { bsonType: 'string', minLength: 20 },
      highlights: { bsonType: 'array', items: { bsonType: 'string' } },
      best_time: { bsonType: 'string' },
      tags: { bsonType: 'array', items: { bsonType: 'string' } },
      embedding: { bsonType: 'array', minItems: EMBEDDING_DIM, maxItems: EMBEDDING_DIM, items: { bsonType: ['double', 'int'] } },
      created_at: { bsonType: 'date' },
      updated_at: { bsonType: 'date' },
      updated_by: { bsonType: 'string' },
    },
  },
};

export async function ensureGuidesCollection(db: Db) {
  const exists = await db.listCollections({ name: GUIDES }).hasNext();
  if (!exists) {
    await db.createCollection(GUIDES, { validator: GUIDE_VALIDATOR, validationLevel: 'strict' });
  } else {
    await db.command({ collMod: GUIDES, validator: GUIDE_VALIDATOR, validationLevel: 'strict' });
  }
  const col = db.collection(GUIDES);
  await col.createIndex({ airport_code: 1 }, { unique: true, name: 'uq_airport_code' });
  await col.createIndex({ tags: 1 }, { name: 'idx_tags' });
  await col.createIndex({ title: 'text', summary: 'text', highlights: 'text' }, { name: 'txt_guide' });
  return col;
}

export type GuideDoc = {
  _id?: ObjectId;
  airport_code: string; city: string; title: string; summary: string;
  highlights: string[]; best_time: string; tags: string[];
  embedding: number[]; created_at: Date; updated_at: Date; updated_by?: string;
};

export function publicGuide(d: any) {
  const { embedding, _id, ...rest } = d;
  void embedding;
  return { id: String(_id), ...rest };
}

/**
 * Vector similarity search.
 * 1. Atlas Vector Search ($vectorSearch) when running on Atlas with the index.
 * 2. Otherwise cosine similarity computed INSIDE MongoDB with an aggregation
 *    pipeline ($reduce over the vector) — works on any local MongoDB.
 */
export async function searchGuides(query: string, limit = 3) {
  const db = await getMongoDb();
  const q = embedText(query);
  if (q.every((x) => x === 0)) return { engine: 'none', results: [] as any[] };

  const col = db.collection(GUIDES);
  const index = process.env.MONGODB_VECTOR_INDEX;
  if (index) {
    try {
      const results = await col.aggregate([
        { $vectorSearch: { index, path: 'embedding', queryVector: q, numCandidates: 50, limit } },
        { $project: { embedding: 0, score: { $meta: 'vectorSearchScore' } } },
      ]).toArray();
      return { engine: 'atlas-vector-search', results: results.map(publicGuide) };
    } catch {
      /* not Atlas / index missing -> fall back */
    }
  }
  const results = await col.aggregate([
    {
      $addFields: {
        score: {
          $reduce: {
            input: { $range: [0, EMBEDDING_DIM] },
            initialValue: 0,
            in: { $add: ['$$value', { $multiply: [{ $arrayElemAt: ['$embedding', '$$this'] }, { $arrayElemAt: [q, '$$this'] }] }] },
          },
        },
      },
    },
    { $match: { score: { $gt: 0.05 } } },
    { $sort: { score: -1 } },
    { $limit: limit },
    { $project: { embedding: 0 } },
  ]).toArray();
  return { engine: 'mongodb-cosine-aggregation', results: results.map(publicGuide) };
}
