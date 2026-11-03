import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import { sqlErrorResponse } from './sqlErrors';

/**
 * Lazily-constructed MySQL connection pool.
 *
 * - Never throws at import time (a missing DATABASE_URL becomes a JSON 503
 *   at request time instead of an HTML crash page).
 * - dateStrings: DATETIME values come back exactly as stored
 *   ("2026-11-03 06:00:00"), so flight times are never shifted by the
 *   server's or browser's time zone.
 * - decimalNumbers: DECIMAL money columns arrive as numbers.
 */
let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and set DATABASE_URL.');
  }
  _pool = mysql.createPool({
    uri: url,
    connectionLimit: 10,
    waitForConnections: true,
    enableKeepAlive: true,
    dateStrings: true,
    decimalNumbers: true,
  });
  return _pool;
}

type DbResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

/**
 * Run fn with the pool. Database failures are converted to
 * { ok:false, status, error } — custom SIGNAL errors (MYSQL_ERRNO 5001-5010)
 * keep their message and map to a meaningful HTTP status.
 */
export async function withDb<T>(fn: (pool: Pool) => Promise<T>): Promise<DbResult<T>> {
  try {
    const pool = getPool();
    return { ok: true, value: await fn(pool) };
  } catch (e: unknown) {
    const r = sqlErrorResponse(e);
    return { ok: false, status: r.status, error: r.error };
  }
}

/** Same as withDb but with one dedicated connection (needed for CALL ... OUT params). */
export async function withConnection<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<DbResult<T>> {
  let conn: PoolConnection | null = null;
  try {
    conn = await getPool().getConnection();
    return { ok: true, value: await fn(conn) };
  } catch (e: unknown) {
    const r = sqlErrorResponse(e);
    return { ok: false, status: r.status, error: r.error };
  } finally {
    conn?.release();
  }
}
