/* npm run db:seed — create or upgrade the admin account from .env.local */
import './lib/env';
import mysql from 'mysql2/promise';
import { requireEnv } from './lib/env';
import { ensureAdmin } from './lib/demoData';

async function main() {
  const conn = await mysql.createConnection(requireEnv('DATABASE_URL'));
  try {
    await ensureAdmin(conn, process.env.ADMIN_EMAIL || 'admin@aerovista.local', process.env.ADMIN_PASSWORD || '');
  } finally {
    await conn.end();
  }
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
