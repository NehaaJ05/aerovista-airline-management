/* Display helpers for "YYYY-MM-DD HH:MM:SS" strings from MySQL.
 * Flight times are airport-local, so they are parsed as wall-clock
 * values and never converted between time zones. */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export function parseDbDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
}

export function fmtTime(s: string | null | undefined): string {
  const d = parseDbDate(s);
  return d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '—';
}

export function fmtDate(s: string | null | undefined, withWeekday = true): string {
  const d = parseDbDate(s);
  if (!d) return '—';
  return `${withWeekday ? DAYS[d.getDay()] + ', ' : ''}${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtShortDate(s: string | null | undefined): string {
  const d = parseDbDate(s);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : '—';
}

export function fmtDateTime(s: string | null | undefined): string {
  return s ? `${fmtDate(s, false)}, ${fmtTime(s)}` : '—';
}

export function fmtDuration(min: number | null | undefined): string {
  const m = Number(min);
  if (!Number.isFinite(m) || m <= 0) return '—';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}h ${String(r).padStart(2, '0')}m` : `${r}m`;
}

/** Local YYYY-MM-DD for <input type="date"> */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayDiff(s: string): number {
  const d = parseDbDate(s);
  if (!d) return 0;
  const t = new Date();
  const a = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}
