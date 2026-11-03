import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { splitSql } from '../scripts/lib/sqlRunner';
import { embedText, cosine } from '../src/lib/embedding';

describe('splitSql (DELIMITER-aware runner)', () => {
  it('keeps a procedure body with inner semicolons as one statement', () => {
    const out = splitSql('SELECT 1;\nDELIMITER $$\nCREATE PROCEDURE p() BEGIN SELECT 1; SELECT 2; END$$\nDELIMITER ;\nSELECT 3;');
    expect(out).toHaveLength(3);
    expect(out[1]).toMatch(/^CREATE PROCEDURE p\(\) BEGIN SELECT 1; SELECT 2; END$/);
  });
  it('ignores semicolons inside strings and comments', () => {
    expect(splitSql("SELECT 'a;b'; -- x;y\nSELECT 2;")).toEqual(["SELECT 'a;b'", 'SELECT 2']);
  });
  it('parses the real schema.sql', () => {
    const stmts = splitSql(fs.readFileSync('database/schema.sql', 'utf8'));
    expect(stmts.some((s) => s.startsWith('CREATE PROCEDURE sp_cancel_booking'))).toBe(true);
    expect(stmts.some((s) => s.startsWith('CREATE TRIGGER trg_booking_status_guard'))).toBe(true);
  });
});

describe('embedding (vector feature)', () => {
  it('is unit-length and ranks related text higher', () => {
    const beach = embedText('seaside promenade and seafood');
    expect(Math.abs(cosine(beach, beach) - 1)).toBeLessThan(1e-4);
    const mumbai = embedText('Mumbai coastal city beach nightlife food');
    const delhi = embedText('Delhi monuments forts heritage history');
    expect(cosine(beach, mumbai)).toBeGreaterThan(cosine(beach, delhi));
  });
});
