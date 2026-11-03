import { describe, it, expect } from 'vitest';
import {
  occupancyPercent,
  netRevenue,
  revenueAfterFuel,
  formatInr,
  refundFor,
} from '../src/lib/analytics';

describe('occupancyPercent', () => {
  it('computes a basic percentage', () => {
    expect(occupancyPercent(45, 180)).toBe(25);
  });

  it('returns 0 when allocated is zero', () => {
    expect(occupancyPercent(1, 0)).toBe(0);
  });

  it('returns 0 when allocated is negative', () => {
    expect(occupancyPercent(5, -10)).toBe(0);
  });

  it('rounds to two decimal places', () => {
    expect(occupancyPercent(1, 3)).toBeCloseTo(33.33, 2);
  });

  it('handles NaN inputs', () => {
    expect(occupancyPercent(NaN as any, 100)).toBe(0);
    expect(occupancyPercent(10, NaN as any)).toBe(0);
  });
});

describe('netRevenue', () => {
  it('subtracts refunds from gross', () => {
    expect(netRevenue(1000, 125)).toBe(875);
  });

  it('allows negative result (refunds > gross)', () => {
    expect(netRevenue(100, 200)).toBe(-100);
  });

  it('rounds to two decimals', () => {
    expect(netRevenue(1000.126, 0)).toBe(1000.13);
  });
});

describe('revenueAfterFuel', () => {
  it('matches the SQL view definition (net - fuel), even with no bookings yet', () => {
    // v1 clamped this to 0 in the UI while the SQL view returned -fuel_cost,
    // so the dashboard and the database disagreed. One definition now.
    expect(revenueAfterFuel(0, 0, 185000)).toBe(-185000);
  });

  it('subtracts fuel from net when revenue exists', () => {
    expect(revenueAfterFuel(100000, 10000, 50000)).toBe(40000);
  });

  it('allows negative when revenue exists but is less than fuel + refunds', () => {
    expect(revenueAfterFuel(1000, 0, 50000)).toBe(-49000);
  });
});

describe('refundFor (mirror of fn_refund_amount)', () => {
  it('applies the full-window percentage 24h+ before departure', () => {
    expect(refundFor(10000, 48, 100, 50)).toBe(10000);
  });
  it('applies the late percentage inside 24h', () => {
    expect(refundFor(10000, 5, 100, 50)).toBe(5000);
  });
  it('returns 0 for non-refundable fares and departed flights', () => {
    expect(refundFor(10000, 48, 0, 0)).toBe(0);
    expect(refundFor(10000, -1, 100, 75)).toBe(0);
  });
  it('never exceeds the amount paid', () => {
    expect(refundFor(999, 100, 100, 100)).toBe(999);
  });
});

describe('formatInr', () => {
  it('formats compact crore / lakh values', () => {
    expect(formatInr(28405596, { compact: true })).toBe('₹2.84 Cr');
    expect(formatInr(560000, { compact: true })).toBe('₹5.60 L');
  });
  it('formats negatives with a minus sign', () => {
    expect(formatInr(-1500)).toBe('−₹1,500');
  });

  it('formats integer rupees', () => {
    expect(formatInr(12345)).toBe('₹12,345');
  });

  it('formats null as zero', () => {
    expect(formatInr(null)).toBe('₹0');
  });

  it('formats string input', () => {
    expect(formatInr('99999')).toBe('₹99,999');
  });

  it('handles non-numeric strings', () => {
    expect(formatInr('abc')).toBe('₹0');
  });
});
