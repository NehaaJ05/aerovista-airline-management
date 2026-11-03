/* npm run demo:reset -- --confirm=<database_name>
 *
 * Restores the KNOWN DEMO STATE: deletes every booking, payment,
 * cancellation, inventory-log row and flight, regenerates the schedule
 * around today, and rebuilds the demo booking history.
 * Users (including accounts registered during a demo) are kept.
 *
 * Because it deletes transactional data it refuses to run unless you
 * type the database name, so it can never wipe the wrong database by
 * accident. Back up first if the data matters:
 *   mysqldump -u root -p airline_intelligence > backup.sql            */
import './lib/env';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { requireEnv, dbNameFromUrl, serverUrl } from './lib/env';
import { runSqlFile } from './lib/sqlRunner';
import { ensureAdmin, ensureDemoUsers, generateHistory, wipeTransactions } from './lib/demoData';

async function main() {
  const url = requireEnv('DATABASE_URL');
  const dbName = dbNameFromUrl(url);
  const host = new URL(url).host;
  const confirm = process.argv.find((a) => a.startsWith('--confirm='))?.split('=')[1];

  if (confirm !== dbName) {
    console.error(
      `\nThis resets ALL bookings, payments, cancellations and flights in "${dbName}" on ${host}.\n` +
      `Users are kept. To proceed, run:\n\n    npm run demo:reset -- --confirm=${dbName}\n`
    );
    process.exit(2);
  }

  console.log(`Resetting demo data in ${dbName} @ ${host}`);
  const server = await mysql.createConnection(serverUrl(url));
  try {
    await runSqlFile(server, path.join('database', 'schema.sql'), { dbName });
  } finally {
    await server.end();
  }

  const conn = await mysql.createConnection(url);
  try {
    await wipeTransactions(conn);
    console.log('  ✓ cleared bookings, payments, cancellations, inventory log and flights');
    await runSqlFile(conn, path.join('database', 'seed.sql'), { dbName });
    await ensureAdmin(conn, process.env.ADMIN_EMAIL || 'admin@aerovista.local', process.env.ADMIN_PASSWORD || '');
    const { demoUserId, travellerIds } = await ensureDemoUsers(conn);
    await generateHistory(conn, demoUserId, travellerIds);
    console.log('Demo state restored.');
  } finally {
    await conn.end();
  }
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
