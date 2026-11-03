/* npm run db:setup — one command for a working database.
 *   1. schema.sql  (creates OR upgrades in place, never drops data)
 *   2. seed.sql    (reference data + schedule around today)
 *   3. admin account from ADMIN_EMAIL / ADMIN_PASSWORD
 *   4. demo passenger + booking history (only if none exists yet)
 * Non-destructive: safe to run on your existing database. */
import './lib/env';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { requireEnv, dbNameFromUrl, serverUrl } from './lib/env';
import { runSqlFile } from './lib/sqlRunner';
import { ensureAdmin, ensureDemoUsers, generateHistory, hasHistory } from './lib/demoData';

async function main() {
  const url = requireEnv('DATABASE_URL');
  const dbName = dbNameFromUrl(url);
  console.log(`AeroVista database setup → ${dbName}`);

  const server = await mysql.createConnection(serverUrl(url));
  try {
    await runSqlFile(server, path.join('database', 'schema.sql'), { dbName });
  } finally {
    await server.end();
  }

  const conn = await mysql.createConnection(url);
  try {
    await runSqlFile(conn, path.join('database', 'seed.sql'), { dbName });
    await ensureAdmin(conn, process.env.ADMIN_EMAIL || 'admin@aerovista.local', process.env.ADMIN_PASSWORD || '');
    const { demoUserId, travellerIds } = await ensureDemoUsers(conn);
    if (await hasHistory(conn)) {
      console.log('  • booking history already present — kept as is');
    } else {
      await generateHistory(conn, demoUserId, travellerIds);
    }
    console.log('Done. Start the app with: npm run dev');
  } finally {
    await conn.end();
  }
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
