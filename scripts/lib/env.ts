/* Loads .env.local first (what Next.js uses), then .env as a fallback.
 * The v1 scripts imported 'dotenv/config', which only reads .env — so
 * following the README (.env.local) made every seed script fail. */
import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(process.cwd(), '.env.local') });
config({ path: path.resolve(process.cwd(), '.env') });

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
  }
  return v;
}

/** Database name from a mysql:// URL, e.g. airline_intelligence */
export function dbNameFromUrl(url: string): string {
  const u = new URL(url);
  return decodeURIComponent(u.pathname.replace(/^\//, '')) || 'airline_intelligence';
}

/** Same URL but without a database, for CREATE DATABASE. */
export function serverUrl(url: string): string {
  const u = new URL(url);
  u.pathname = '/';
  return u.toString();
}
