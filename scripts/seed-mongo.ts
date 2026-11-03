/* npm run mongo:seed — create the destination_guides collection (validator +
 * indexes, Atlas vector index when available) and upsert the 6 guides with
 * their embeddings. Idempotent. */
import './lib/env';
import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import { requireEnv } from './lib/env';
import { ensureGuidesCollection } from '../src/lib/guides';
import { embedText, guideText, EMBEDDING_DIM } from '../src/lib/embedding';

async function main() {
  const client = await new MongoClient(requireEnv('MONGODB_URI'), { serverSelectionTimeoutMS: 5000 }).connect();
  try {
    const db = client.db(process.env.MONGODB_DB || 'airline_intelligence');
    const col = await ensureGuidesCollection(db);
    const guides = JSON.parse(fs.readFileSync(path.join('database', 'mongo', 'destination_guides.json'), 'utf8'));
    const now = new Date();
    for (const g of guides) {
      await col.updateOne(
        { airport_code: g.airport_code },
        { $set: { ...g, embedding: embedText(guideText(g)), updated_at: now, updated_by: 'seed' }, $setOnInsert: { created_at: now } },
        { upsert: true }
      );
    }
    const index = process.env.MONGODB_VECTOR_INDEX;
    if (index) {
      try {
        await col.createSearchIndex({
          name: index, type: 'vectorSearch',
          definition: { fields: [{ type: 'vector', path: 'embedding', numDimensions: EMBEDDING_DIM, similarity: 'cosine' }] },
        } as any);
        console.log(`  ✓ Atlas vector index "${index}" requested`);
      } catch {
        console.log('  • vector index not created (local MongoDB or already exists) — cosine aggregation fallback is used');
      }
    }
    console.log(`  ✓ ${guides.length} destination guides upserted into ${db.databaseName}.destination_guides`);
  } finally {
    await client.close();
  }
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
