/* npm run db:demo-data — demo passenger + realistic booking history.
 * Skips if history already exists (use `npm run demo:reset` to rebuild). */
import './lib/env';
import mysql from 'mysql2/promise';
import { requireEnv } from './lib/env';
import { ensureDemoUsers, generateHistory, hasHistory } from './lib/demoData';

async function main() {
  const conn = await mysql.createConnection(requireEnv('DATABASE_URL'));
  try {
    const { demoUserId, travellerIds } = await ensureDemoUsers(conn);
    if (await hasHistory(conn)) {
      console.log('  • booking history already present — nothing to do (npm run demo:reset rebuilds it)');
      return;
    }
    await generateHistory(conn, demoUserId, travellerIds);
  } finally {
    await conn.end();
  }
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
