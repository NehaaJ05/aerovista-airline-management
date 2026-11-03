/**
 * Pure helpers shared by the UI and unit tests.
 * Revenue itself is defined ONCE, in the MySQL views (v_revenue_by_flight,
 * v_revenue_summary); these mirror the same formulas for display/tests:
 *   net_revenue        = gross_revenue - refunds
 *   revenue_after_fuel = net_revenue - fuel_cost
 */

export function occupancyPercent(sold: number, allocated: number): number {
  if (!Number.isFinite(sold) || !Number.isFinite(allocated) || allocated <= 0) return 0;
  return Math.round((sold / allocated) * 10000) / 100;
}

export function netRevenue(gross: number, refunds: number): number {
  const g = Number.isFinite(gross) ? gross : 0;
  const r = Number.isFinite(refunds) ? refunds : 0;
  return Math.round((g - r) * 100) / 100;
}

/** Same definition as the SQL view — no clamping, so UI and SQL always agree. */
export function revenueAfterFuel(gross: number, refunds: number, fuelCost: number): number {
  const f = Number.isFinite(fuelCost) ? fuelCost : 0;
  return Math.round((netRevenue(gross, refunds) - f) * 100) / 100;
}

/** Mirrors fn_refund_amount() for previews/tests (the DB stays authoritative). */
export function refundFor(
  paid: number,
  hoursToDeparture: number,
  refundPct: number,
  lateRefundPct: number
): number {
  if (!Number.isFinite(paid) || paid <= 0 || !(hoursToDeparture > 0)) return 0;
  const pct = hoursToDeparture >= 24 ? refundPct : lateRefundPct;
  return Math.min(paid, Math.round(paid * pct) / 100);
}

export function formatInr(n: number | string | null | undefined, opts: { compact?: boolean } = {}): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '₹0';
  if (opts.compact) {
    const a = Math.abs(v);
    const sign = v < 0 ? '−' : '';
    if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
    if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`;
    if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(1)}K`;
  }
  return (v < 0 ? '−₹' : '₹') + Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
