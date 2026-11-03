/* Minimal .sql file runner that understands the mysql-client DELIMITER
 * directive, so schema.sql (triggers / procedures) can be applied from
 * Node without the mysql CLI. Statements run one at a time on a single
 * connection, so session variables (SET @x) carry across statements. */
import fs from 'node:fs';
import type { Connection } from 'mysql2/promise';

export function splitSql(source: string): string[] {
  const out: string[] = [];
  let delimiter = ';';
  let buf = '';
  let i = 0;
  let quote: string | null = null;
  let atLineStart = true;

  while (i < source.length) {
    const ch = source[i];

    // DELIMITER directive (only at the start of a line, outside quotes)
    if (!quote && atLineStart) {
      const rest = source.slice(i);
      const m = /^[ \t]*DELIMITER[ \t]+(\S+)[ \t]*(\r?\n|$)/i.exec(rest);
      if (m) {
        if (buf.trim()) { out.push(buf.trim()); buf = ''; }
        delimiter = m[1];
        i += m[0].length;
        atLineStart = true;
        continue;
      }
    }

    if (!quote) {
      // line comment
      if (ch === '-' && source[i + 1] === '-' && /\s/.test(source[i + 2] ?? ' ')) {
        const nl = source.indexOf('\n', i);
        i = nl === -1 ? source.length : nl;
        continue;
      }
      if (ch === '#') {
        const nl = source.indexOf('\n', i);
        i = nl === -1 ? source.length : nl;
        continue;
      }
      // block comment
      if (ch === '/' && source[i + 1] === '*') {
        const end = source.indexOf('*/', i + 2);
        i = end === -1 ? source.length : end + 2;
        continue;
      }
      if (source.startsWith(delimiter, i)) {
        if (buf.trim()) out.push(buf.trim());
        buf = '';
        i += delimiter.length;
        atLineStart = false;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    } else if (ch === quote) {
      if (source[i + 1] === quote) { buf += ch + ch; i += 2; continue; }  // escaped ''
      quote = null;
    } else if (ch === '\\' && quote !== '`') {
      buf += ch + (source[i + 1] ?? '');
      i += 2;
      continue;
    }

    buf += ch;
    atLineStart = ch === '\n';
    i++;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

export async function runSqlFile(
  conn: Connection,
  file: string,
  opts: { dbName?: string; quiet?: boolean } = {}
): Promise<void> {
  let sql = fs.readFileSync(file, 'utf8');
  if (opts.dbName && opts.dbName !== 'airline_intelligence') {
    sql = sql.replace(/\bairline_intelligence\b/g, opts.dbName);
  }
  for (const stmt of splitSql(sql)) {
    try {
      await conn.query(stmt);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`${file}: ${msg}\n--- statement ---\n${stmt.slice(0, 400)}`);
    }
  }
  if (!opts.quiet) console.log(`  ✓ applied ${file}`);
}
