import { MongoClient, Db } from 'mongodb';

/**
 * MongoDB is the NoSQL / vector store for destination guides.
 * It is OPTIONAL at runtime: every booking and analytics feature runs on
 * MySQL alone, and guide endpoints answer 503 when MONGODB_URI is empty.
 */
let _client: MongoClient | null = null;
let _connecting: Promise<MongoClient> | null = null;

export function hasMongo(): boolean {
  return !!process.env.MONGODB_URI;
}

export async function getMongoDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  if (!_client) {
    if (!_connecting) {
      _connecting = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 3000 }).connect();
    }
    try {
      _client = await _connecting;
    } finally {
      _connecting = null;
    }
  }
  return _client.db(process.env.MONGODB_DB || 'airline_intelligence');
}

export function mongoUnavailable() {
  return { error: 'Destination guides need MongoDB. Set MONGODB_URI in .env.local and run npm run mongo:seed.' };
}
