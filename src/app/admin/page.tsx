'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, ComposedChart,
} from 'recharts';
import { ArrowDownUp, Fuel, IndianRupee, Percent, Plane, RefreshCw, RotateCcw, Search, Ticket, TicketCheck, Wallet } from 'lucide-react';
import AdminTabs from '@/components/AdminTabs';
import { Alert, EmptyState, FlightBadge } from '@/components/ui';
import { api } from '@/lib/client';
import { formatInr } from '@/lib/analytics';
import { fmtDateTime, fmtShortDate } from '@/lib/format';

// Validated categorical slots (dataviz reference palette, light mode)
const C = { gross: '#2a78d6', refunds: '#eb6834', net: '#1baf7a', navy: '#173a69', grid: '#e8edf4', axis: '#7b889b' };
const STATUS_COLORS: Record<string, string> = { CONFIRMED: '#2a78d6', COMPLETED: '#1baf7a', CANCELLED: '#eb6834', PENDING: '#eda100' };

type Data = { summary: any; daily: any[]; routes: any[]; flights: any[]; statusMix: any[]; fareMix: any[]; generatedAt: string };

function Tip({ active, payload, label, money = true, suffix = '' }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="tt">{label}</div>
      {payload.map((p: any) => (
        <div className="tr" key={p.dataKey}><span><i style={{ background: p.color ?? p.payload?.fill }} />{p.name}</span><b>{money ? formatInr(p.value) : `${p.value}${suffix}`}</b></div>
      ))}
    </div>
  );
}
const axisMoney = (v: number) => formatInr(v, { compact: true }).replace('.00', '');

function Kpi({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div className="card kpi">
      <span className="kpi-label"><span className="kpi-icon"><Icon /></span>{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

type SortK = 'departure_time' | 'occupancy_pct' | 'gross_revenue' | 'refunds' | 'net_revenue' | 'revenue_after_fuel';

export default function AdminDashboard() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<'all' | 'upcoming' | 'completed' | 'cancelled'>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ k: SortK; dir: 1 | -1 }>({ k: 'departure_time', dir: -1 });
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api<Data>('/api/admin/analytics');
    setLoading(false);
    if (r.ok) { setD(r.data); setErr(''); } else setErr(r.data.error ?? 'Could not load analytics');
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const s = d?.summary;
  const daily = useMemo(() => (d?.daily ?? []).map((x) => ({ ...x, label: fmtShortDate(x.revenue_date) })), [d]);
  const routes = useMemo(() => (d?.routes ?? []).map((r) => ({ ...r, label: `${r.origin_code}–${r.destination_code}` })), [d]);
  const topFlights = useMemo(() => [...(d?.flights ?? [])].sort((a, b) => b.net_revenue - a.net_revenue).slice(0, 10)
    .map((f) => ({ ...f, label: `${f.flight_number} ${fmtShortDate(f.departure_time)}` })), [d]);
  const occ = useMemo(() => [...routes].sort((a, b) => b.load_factor_pct - a.load_factor_pct), [routes]);

  const table = useMemo(() => {
    let xs = d?.flights ?? [];
    if (scope === 'upcoming') xs = xs.filter((f) => f.status === 'SCHEDULED' || f.status === 'DELAYED');
    if (scope === 'completed') xs = xs.filter((f) => f.status === 'COMPLETED');
    if (scope === 'cancelled') xs = xs.filter((f) => f.status === 'CANCELLED');
    const qq = q.trim().toUpperCase();
    if (qq) xs = xs.filter((f) => f.flight_number.includes(qq) || `${f.origin_code}-${f.destination_code}`.includes(qq) || f.origin_code === qq || f.destination_code === qq);
    return [...xs].sort((a, b) => (a[sort.k] > b[sort.k] ? 1 : a[sort.k] < b[sort.k] ? -1 : 0) * sort.dir);
  }, [d, scope, q, sort]);
  useEffect(() => setPage(0), [scope, q, sort]);
  const PAGE = 15;
  const pageRows = table.slice(page * PAGE, page * PAGE + PAGE);
  const th = (k: SortK, label: string) => (
    <th className="sortable num" onClick={() => setSort((p) => ({ k, dir: p.k === k ? (p.dir === 1 ? -1 : 1) : -1 }))} aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      {label}{sort.k === k ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
    </th>
  );

  return (
    <main className="page">
      <div className="container">
        <div className="page-head">
          <div><div className="eyebrow">Revenue management</div><h1>Revenue & occupancy dashboard</h1><p>Every figure is read live from the MySQL analytics views.</p></div>
          <div className="row" style={{ gap: 12 }}>
            {d && <span className="updated"><span className="live-dot" />Updated {new Date(d.generatedAt).toLocaleTimeString('en-IN')}</span>}
            <button className="btn btn-secondary" onClick={load} disabled={loading}>{loading ? <span className="spinner" /> : <RefreshCw size={16} />}Refresh</button>
          </div>
        </div>
        <AdminTabs />
        {err && <div style={{ marginBottom: 16 }}><Alert kind="danger">{err}</Alert></div>}

        {!d ? (
          <div className="kpi-grid">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 112 }} />)}</div>
        ) : (
          <>
            <div className="kpi-grid">
              <Kpi icon={IndianRupee} label="Gross revenue" value={formatInr(s.gross_revenue, { compact: true })} sub="All captured payments, incl. later refunded" />
              <Kpi icon={RotateCcw} label="Total refunds" value={formatInr(s.total_refunds, { compact: true })} sub={`${s.cancelled_bookings.toLocaleString('en-IN')} cancellations`} />
              <Kpi icon={Wallet} label="Net revenue" value={formatInr(s.net_revenue, { compact: true })} sub="Gross − refunds" />
              <Kpi icon={Fuel} label="Revenue after fuel" value={formatInr(s.revenue_after_fuel, { compact: true })} sub={`Net − fuel (${formatInr(s.fuel_cost, { compact: true })})`} />
              <Kpi icon={Plane} label="Total flights" value={Number(s.total_flights).toLocaleString('en-IN')} sub={`${s.upcoming_flights} upcoming · ${s.completed_flights} flown · ${s.cancelled_flights} cancelled`} />
              <Kpi icon={Ticket} label="Total bookings" value={Number(s.total_bookings).toLocaleString('en-IN')} sub={`${(100 * s.cancelled_bookings / Math.max(1, s.total_bookings)).toFixed(1)}% cancellation rate`} />
              <Kpi icon={TicketCheck} label="Confirmed bookings" value={Number(s.confirmed_bookings).toLocaleString('en-IN')} sub={`+ ${Number(s.completed_bookings).toLocaleString('en-IN')} completed trips`} />
              <Kpi icon={Percent} label="Average occupancy" value={`${Number(s.avg_occupancy ?? 0).toFixed(1)}%`} sub={`Flown ${Number(s.avg_occupancy_completed ?? 0).toFixed(1)}% · upcoming ${Number(s.avg_occupancy_upcoming ?? 0).toFixed(1)}%`} />
            </div>

            <div className="grid grid-2" style={{ marginTop: 20 }}>
              <section className="card">
                <div className="card-head"><div><h2>Revenue trend</h2><p>Last 30 days · gross by payment date, refunds by cancellation date</p></div></div>
                <div className="card-body chart-box">
                  {daily.length === 0 ? <EmptyState icon={<IndianRupee />} title="No payments in the last 30 days" /> : (
                    <ResponsiveContainer>
                      <ComposedChart data={daily} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={C.grid} vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} />
                        <YAxis tickFormatter={axisMoney} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} width={64} />
                        <Tooltip content={<Tip />} />
                        <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                        <Area type="monotone" dataKey="gross_revenue" name="Gross" stroke={C.gross} fill={C.gross} fillOpacity={0.12} strokeWidth={2} />
                        <Line type="monotone" dataKey="net_revenue" name="Net" stroke={C.net} strokeWidth={2} dot={false} />
                        <Bar dataKey="refunds" name="Refunds" fill={C.refunds} radius={[3, 3, 0, 0]} barSize={8} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </section>
              <section className="card">
                <div className="card-head"><div><h2>Gross revenue vs refunds by route</h2><p>All flights on each route</p></div></div>
                <div className="card-body chart-box">
                  <ResponsiveContainer>
                    <BarChart data={routes} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barGap={2}>
                      <CartesianGrid stroke={C.grid} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.axis }} tickLine={false} axisLine={false} interval={0} angle={-35} textAnchor="end" height={50} />
                      <YAxis tickFormatter={axisMoney} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} width={64} />
                      <Tooltip content={<Tip />} cursor={{ fill: 'rgba(23,58,105,.05)' }} />
                      <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="gross_revenue" name="Gross" fill={C.gross} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="refunds" name="Refunds" fill={C.refunds} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
              <section className="card">
                <div className="card-head"><div><h2>Top 10 flights by net revenue</h2><p>Individual departures</p></div></div>
                <div className="card-body chart-box">
                  <ResponsiveContainer>
                    <BarChart data={topFlights} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={C.grid} horizontal={false} />
                      <XAxis type="number" tickFormatter={axisMoney} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="label" width={104} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                      <Tooltip content={<Tip />} cursor={{ fill: 'rgba(23,58,105,.05)' }} />
                      <Bar dataKey="net_revenue" name="Net revenue" fill={C.navy} radius={[0, 4, 4, 0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
              <section className="card">
                <div className="card-head"><div><h2>Occupancy by route</h2><p>Seats sold ÷ seats allocated (load factor)</p></div></div>
                <div className="card-body chart-box">
                  <ResponsiveContainer>
                    <BarChart data={occ} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={C.grid} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.axis }} tickLine={false} axisLine={false} interval={0} angle={-35} textAnchor="end" height={50} />
                      <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} width={40} />
                      <Tooltip content={<Tip money={false} suffix="%" />} cursor={{ fill: 'rgba(23,58,105,.05)' }} />
                      <Bar dataKey="load_factor_pct" name="Load factor" fill={C.gross} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
              <section className="card">
                <div className="card-head"><div><h2>Bookings & cancellations</h2><p>Daily new bookings vs cancellations, last 30 days</p></div></div>
                <div className="card-body chart-box">
                  <ResponsiveContainer>
                    <AreaChart data={daily} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={C.grid} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} minTickGap={18} />
                      <YAxis tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} width={44} />
                      <Tooltip content={<Tip money={false} />} />
                      <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="bookings" name="Bookings" stroke={C.gross} fill={C.gross} fillOpacity={0.12} strokeWidth={2} />
                      <Area type="monotone" dataKey="cancellations" name="Cancellations" stroke={C.refunds} fill={C.refunds} fillOpacity={0.15} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>
              <section className="card">
                <div className="card-head"><div><h2>Booking status & fare mix</h2><p>All bookings in the system</p></div></div>
                <div className="card-body">
                  <div className="stack" style={{ gap: 10 }}>
                    {d.statusMix.map((x) => {
                      const pct = (100 * x.count) / Math.max(1, s.total_bookings);
                      return (
                        <div key={x.status}>
                          <div className="row between small"><span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: STATUS_COLORS[x.status] ?? C.navy, marginRight: 8 }} />{x.status}</span><span className="tnum">{Number(x.count).toLocaleString('en-IN')} · {pct.toFixed(1)}%</span></div>
                          <div className="bar" style={{ marginTop: 5 }}><span style={{ width: `${pct}%`, background: STATUS_COLORS[x.status] ?? C.navy }} /></div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="table-wrap" style={{ marginTop: 18 }}>
                    <table className="table">
                      <thead><tr><th>Fare class</th><th className="num">Seats sold</th><th className="num">Cancelled</th><th className="num">Gross</th><th className="num">Refunds</th></tr></thead>
                      <tbody>{d.fareMix.map((f) => (
                        <tr key={f.class_code}><td>{f.class_name}</td><td className="num">{Number(f.seats_sold).toLocaleString('en-IN')}</td><td className="num">{Number(f.cancellations).toLocaleString('en-IN')}</td><td className="num">{formatInr(f.gross_revenue, { compact: true })}</td><td className="num">{formatInr(f.refunds, { compact: true })}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              </section>
            </div>

            <section className="card" style={{ marginTop: 20 }}>
              <div className="card-head" style={{ flexWrap: 'wrap' }}>
                <div><h2>Flight-wise performance</h2><p>v_revenue_by_flight ⨝ v_flight_occupancy · {table.length} flights</p></div>
                <div className="row row-wrap" style={{ gap: 8 }}>
                  <div className="segmented">{(['all', 'upcoming', 'completed', 'cancelled'] as const).map((k) => (
                    <button key={k} className={scope === k ? 'on' : ''} onClick={() => setScope(k)}>{k[0].toUpperCase() + k.slice(1)}</button>
                  ))}</div>
                  <div className="input-wrap" style={{ width: 200 }}>
                    <input className="input" style={{ height: 36 }} placeholder="AV101, BLR, BLR-DEL" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter flights" />
                    <span className="reveal" style={{ top: 0, pointerEvents: 'none' }}><Search size={15} /></span>
                  </div>
                </div>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr>
                    <th>Flight</th><th>Route</th>
                    <th className="sortable" onClick={() => setSort((p) => ({ k: 'departure_time', dir: p.k === 'departure_time' ? (p.dir === 1 ? -1 : 1) : 1 }))}>Departure{sort.k === 'departure_time' ? (sort.dir === 1 ? ' ↑' : ' ↓') : <ArrowDownUp size={11} style={{ display: 'inline', marginLeft: 4 }} />}</th>
                    <th>Status</th><th className="num">Sold / allocated</th>{th('occupancy_pct', 'Occupancy')}
                    {th('gross_revenue', 'Gross')}{th('refunds', 'Refunds')}{th('net_revenue', 'Net')}<th className="num">Fuel</th>{th('revenue_after_fuel', 'After fuel')}
                  </tr></thead>
                  <tbody>
                    {pageRows.length === 0 && <tr><td colSpan={11} className="muted" style={{ textAlign: 'center', padding: 30 }}>No flights match this filter.</td></tr>}
                    {pageRows.map((f) => (
                      <tr key={f.flight_id}>
                        <td style={{ fontWeight: 700 }}>{f.flight_number}</td>
                        <td>{f.origin_code} → {f.destination_code}</td>
                        <td className="tnum">{fmtDateTime(f.departure_time)}</td>
                        <td><FlightBadge status={f.status} /></td>
                        <td className="num">{f.sold_seats} / {f.allocated_seats}</td>
                        <td className="num"><div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}><div className="bar" style={{ width: 70 }}><span style={{ width: `${Math.min(100, f.occupancy_pct)}%` }} /></div>{Number(f.occupancy_pct).toFixed(1)}%</div></td>
                        <td className="num">{formatInr(f.gross_revenue)}</td>
                        <td className="num">{formatInr(f.refunds)}</td>
                        <td className="num">{formatInr(f.net_revenue)}</td>
                        <td className="num">{formatInr(f.fuel_cost)}</td>
                        <td className={`num ${f.revenue_after_fuel < 0 ? 'neg' : 'pos'}`}>{formatInr(f.revenue_after_fuel)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pager">
                <span>Showing {table.length ? page * PAGE + 1 : 0}–{Math.min(table.length, (page + 1) * PAGE)} of {table.length} · upcoming flights show negative after-fuel until their seats sell</span>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
                  <button className="btn btn-secondary btn-sm" disabled={(page + 1) * PAGE >= table.length} onClick={() => setPage((p) => p + 1)}>Next</button>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
