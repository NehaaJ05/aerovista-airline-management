import { NextResponse } from 'next/server';
import { withDb } from '@/lib/db';
import { getMongoDb, hasMongo } from '@/lib/mongo';

export const dynamic = 'force-dynamic';

export async function GET() {
  const mysql = await withDb(async (pool) => {
    const [[r]] = (await pool.query(
      `SELECT VERSION() AS version, (SELECT COUNT(*) FROM flights WHERE status IN ('SCHEDULED','DELAYED') AND departure_time > NOW()) AS bookable_flights`
    )) as any;
    return r;
  });
  let mongo: string = 'not configured';
  if (hasMongo()) {
    try { await (await getMongoDb()).command({ ping: 1 }); mongo = 'connected'; } catch { mongo = 'unavailable'; }
  }
  const body = {
    ok: mysql.ok,
    mysql: mysql.ok ? { status: 'connected', ...mysql.value } : { status: 'unavailable', error: mysql.error },
    mongodb: mongo,
  };
  return NextResponse.json(body, { status: mysql.ok ? 200 : 503 });
}
