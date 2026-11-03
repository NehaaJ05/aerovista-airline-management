/**
 * Maps MySQL errors to HTTP responses.
 * Custom business-rule errors are raised in the database with
 * SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 50xx (see schema.sql).
 */
const CUSTOM_STATUS: Record<number, number> = {
  5001: 404, // not found
  5002: 403, // not allowed
  5003: 409, // already cancelled
  5004: 409, // not cancellable
  5005: 409, // sold out
  5006: 409, // flight closed / not open
  5007: 400, // fare does not belong to flight
  5008: 400, // amount rule
  5009: 409, // illegal status transition
  5010: 400, // invalid input
};

type MysqlLikeError = { errno?: number; code?: string; sqlMessage?: string; message?: string };

export function sqlErrorResponse(e: unknown): { status: number; error: string; errno?: number } {
  const err = (e ?? {}) as MysqlLikeError;
  const msg = err.message ?? '';
  if (msg.includes('DATABASE_URL')) {
    return { status: 503, error: 'Database not configured. Set DATABASE_URL in .env.local.' };
  }
  if (typeof err.errno === 'number' && CUSTOM_STATUS[err.errno]) {
    return { status: CUSTOM_STATUS[err.errno], error: err.sqlMessage ?? 'Request rejected', errno: err.errno };
  }
  switch (err.code) {
    case 'ER_DUP_ENTRY':
      return { status: 409, error: 'Duplicate record', errno: err.errno };
    case 'ER_CHECK_CONSTRAINT_VIOLATED':
      return { status: 409, error: 'Rejected by a database CHECK constraint', errno: err.errno };
    case 'ER_NO_REFERENCED_ROW_2':
    case 'ER_NO_REFERENCED_ROW':
      return { status: 400, error: 'Referenced record does not exist', errno: err.errno };
    case 'ECONNREFUSED':
    case 'ER_ACCESS_DENIED_ERROR':
    case 'ER_BAD_DB_ERROR':
    case 'PROTOCOL_CONNECTION_LOST':
      return { status: 503, error: 'Database unavailable. Check MySQL is running and DATABASE_URL is correct.' };
  }
  if (process.env.NODE_ENV !== 'production') console.error('[db]', e);
  return { status: 500, error: 'Database error. Check MySQL and that schema.sql has been applied.' };
}
