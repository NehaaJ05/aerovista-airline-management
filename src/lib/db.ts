
import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import { sqlErrorResponse } from './sqlErrors';

/**
 * Preserve the pool across Next.js development hot reloads.
 * This prevents every module reload from creating another pool.
 */
const globalForMysql = globalThis as typeof globalThis & {
  mysqlPool?: Pool;
};

export function getPool(): Pool {
  if (globalForMysql.mysqlPool) {
    return globalForMysql.mysqlPool;
  }

  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and set DATABASE_URL.'
    );
  }

  const pool = mysql.createPool({
    uri: url,
    connectionLimit: 10,
    waitForConnections: true,
    enableKeepAlive: true,
    dateStrings: true,
    decimalNumbers: true,
  });

  globalForMysql.mysqlPool = pool;
  return pool;
}

type DbResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string };

/**
 * Run a callback using the shared pool.
 * Database failures are converted into structured API responses.
 */
export async function withDb<T>(
  fn: (pool: Pool) => Promise<T>
): Promise<DbResult<T>> {
  try {
    const pool = getPool();
    return { ok: true, value: await fn(pool) };
  } catch (e: unknown) {
    const r = sqlErrorResponse(e);
    return { ok: false, status: r.status, error: r.error };
  }
}

/**
 * Run a callback using one dedicated connection.
 *
 * Always attempt to roll back any unfinished transaction before
 * returning the connection to the pool.
 *
 * Stored procedures that manage their own transactions can still
 * COMMIT or ROLLBACK normally. A final ROLLBACK after a successful
 * procedure call is harmless.
 */
export async function withConnection<T>(
  fn: (conn: PoolConnection) => Promise<T>
): Promise<DbResult<T>> {
  let conn: PoolConnection | null = null;

  try {
    conn = await getPool().getConnection();

    const value = await fn(conn);

    return { ok: true, value };
  } catch (e: unknown) {
    const r = sqlErrorResponse(e);
    return { ok: false, status: r.status, error: r.error };
  } finally {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // Ignore rollback errors during cleanup.
        // The connection may already have been disconnected.
      }

      conn.release();
    }
  }
}
