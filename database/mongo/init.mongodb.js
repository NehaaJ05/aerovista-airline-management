// =====================================================================
// AeroVista — MongoDB (NoSQL / vector) database creation
// Run with mongosh:   mongosh "mongodb://127.0.0.1:27017" database/mongo/init.mongodb.js
// (npm run mongo:seed does the same through the Node driver AND loads data)
// =====================================================================
const dbx = db.getSiblingDB('airline_intelligence');

if (!dbx.getCollectionNames().includes('destination_guides')) {
  dbx.createCollection('destination_guides', {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['airport_code', 'city', 'title', 'summary', 'tags', 'embedding', 'updated_at'],
        properties: {
          airport_code: { bsonType: 'string', pattern: '^[A-Z]{3}$' },
          city:         { bsonType: 'string', minLength: 2 },
          title:        { bsonType: 'string', minLength: 4 },
          summary:      { bsonType: 'string', minLength: 20 },
          highlights:   { bsonType: 'array', items: { bsonType: 'string' } },
          best_time:    { bsonType: 'string' },
          tags:         { bsonType: 'array', items: { bsonType: 'string' } },
          embedding:    { bsonType: 'array', minItems: 128, maxItems: 128 },
          created_at:   { bsonType: 'date' },
          updated_at:   { bsonType: 'date' },
        },
      },
    },
    validationLevel: 'strict',
  });
}
dbx.destination_guides.createIndex({ airport_code: 1 }, { unique: true, name: 'uq_airport_code' });
dbx.destination_guides.createIndex({ tags: 1 }, { name: 'idx_tags' });
dbx.destination_guides.createIndex({ title: 'text', summary: 'text', highlights: 'text' }, { name: 'txt_guide' });

// Atlas only: vector index (128-dim cosine). Ignored on a local server.
try {
  dbx.destination_guides.createSearchIndex({
    name: 'guide_vector_index',
    type: 'vectorSearch',
    definition: { fields: [{ type: 'vector', path: 'embedding', numDimensions: 128, similarity: 'cosine' }] },
  });
  print('Atlas vector index requested: guide_vector_index');
} catch (e) {
  print('Vector index not created (local MongoDB) — the app uses its cosine aggregation fallback.');
}
printjson(dbx.destination_guides.getIndexes().map((i) => i.name));
