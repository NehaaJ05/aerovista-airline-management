'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight, Briefcase, Check, CreditCard, Luggage, MapPin, Minus, Plane, RotateCcw, Search,
  ShieldCheck, Sparkles, Ticket, Utensils,
} from 'lucide-react';
import SearchForm from '@/components/SearchForm';
import { Alert } from '@/components/ui';
import { api } from '@/lib/client';
import { formatInr } from '@/lib/analytics';
import { fmtDuration, fmtShortDate, fmtTime } from '@/lib/format';

type Featured = {
  origin_code: string; origin_city: string; destination_code: string; destination_city: string;
  upcoming_flights: number; duration_min: number; next_departure: string; from_fare: number;
};
type FareClass = {
  class_code: string; class_name: string; refundable: number; refund_pct: number; late_refund_pct: number;
  cabin_baggage_kg: number; checkin_baggage_kg: number; meal_included: number; priority_boarding: number;
};
type Guide = { id: string; airport_code: string; city: string; title: string; summary: string; highlights: string[]; best_time: string; tags: string[]; score?: number };

function RouteArt() {
  // Stylised route network between the six AeroVista hubs (not a map).
  const pts: Record<string, [number, number]> = { DEL: [170, 40], CCU: [330, 120], BOM: [60, 170], HYD: [190, 200], BLR: [160, 270], MAA: [250, 260] };
  const links = [['BLR', 'DEL'], ['BLR', 'BOM'], ['BLR', 'HYD'], ['BLR', 'MAA'], ['BLR', 'CCU'], ['DEL', 'BOM'], ['DEL', 'HYD'], ['DEL', 'CCU'], ['HYD', 'BOM'], ['MAA', 'DEL'], ['BOM', 'MAA']];
  const arc = (a: [number, number], b: [number, number]) => {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - 26;
    return `M${a[0]},${a[1]} Q${mx},${my} ${b[0]},${b[1]}`;
  };
  return (
    <svg viewBox="0 0 400 310" width="100%" height="100%" role="img" aria-label="AeroVista route network">
      <defs>
        <pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.2" fill="rgba(255,255,255,.08)" /></pattern>
      </defs>
      <rect width="400" height="310" fill="url(#dots)" rx="20" />
      {links.map(([a, b]) => (
        <path key={a + b} d={arc(pts[a], pts[b])} fill="none" stroke="rgba(140,201,247,.45)" strokeWidth="1.5" strokeDasharray="4 5" />
      ))}
      {Object.entries(pts).map(([code, [x, y]]) => (
        <g key={code}>
          <circle cx={x} cy={y} r="13" fill="rgba(43,155,239,.18)" />
          <circle cx={x} cy={y} r="5" fill={code === 'BLR' ? '#f5b83d' : '#8cc9f7'} />
          <text x={x + 12} y={y - 10} fill="#dbe7f5" fontSize="12" fontWeight="700" fontFamily="inherit">{code}</text>
        </g>
      ))}
      <g transform="translate(232 72) rotate(32)"><path d="M0 -14 3 -4 14 2 14 5 3 2 2 11 6 14 6 16 0 14.5 -6 16 -6 14 -2 11 -3 2 -14 5 -14 2 -3 -4Z" fill="#fff" /></g>
    </svg>
  );
}

function Home() {
  const denied = useSearchParams().get('denied');
  const [routes, setRoutes] = useState<Featured[] | null>(null);
  const [routesErr, setRoutesErr] = useState('');
  const [fares, setFares] = useState<FareClass[]>([]);
  const [guides, setGuides] = useState<Guide[] | null>(null);
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState<Guide[] | null>(null);
  const [engine, setEngine] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    api<{ routes: Featured[] }>('/api/routes/featured').then((r) => {
      if (r.ok) setRoutes(r.data.routes); else { setRoutes([]); setRoutesErr(r.data.error ?? ''); }
    });
    api<{ fareClasses: FareClass[] }>('/api/fare-classes').then((r) => r.ok && setFares(r.data.fareClasses));
    api<{ guides: Guide[] }>('/api/guides').then((r) => setGuides(r.ok ? r.data.guides : []));
  }, []);

  async function discover(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setSearching(true);
    const r = await api<{ guides: Guide[]; engine: string }>(`/api/guides?q=${encodeURIComponent(q.trim())}`);
    setSearching(false);
    setMatches(r.ok ? r.data.guides : []);
    setEngine(r.ok ? r.data.engine : '');
  }

  const shownGuides = matches ?? guides ?? [];

  return (
    <main>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <div className="eyebrow">Fly across India with AeroVista</div>
            <h1>Smarter fares. Clear refunds. Seats you can count on.</h1>
            <p className="lead">Compare Economy, Flex and Business on every flight, book in under a minute, and see exactly what you get back if your plans change.</p>
            <div className="hero-stats">
              <div><strong>6</strong>city hubs</div>
              <div><strong>22</strong>daily departures</div>
              <div><strong>3</strong>fare families</div>
            </div>
          </div>
          <div className="hero-art"><RouteArt /></div>
        </div>
      </section>

      <div className="container">
        <div className="search-panel">
          <div className="search-tabs"><span className="search-tab"><Plane size={15} />One-way flight</span></div>
          <SearchForm />
        </div>
        {denied && <div style={{ marginTop: 16 }}><Alert kind="warning">That page is for AeroVista administrators. Sign in with an admin account to open the revenue dashboard.</Alert></div>}

        <section className="section">
          <div className="section-head">
            <div>
              <div className="eyebrow">Popular right now</div>
              <h2>Featured routes</h2>
              <p>Live lowest available fares from our schedule.</p>
            </div>
            <Link href="/flights" className="btn btn-secondary">All flights <ArrowRight size={16} /></Link>
          </div>
          {routesErr && <Alert kind="danger">{routesErr}</Alert>}
          <div className="grid grid-3">
            {routes === null && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 170 }} />)}
            {routes?.map((r) => (
              <Link key={r.origin_code + r.destination_code} className="card route-card"
                href={`/flights?origin=${r.origin_code}&destination=${r.destination_code}`}>
                <div className="route-line">
                  <div><div className="code">{r.origin_code}</div><div className="city">{r.origin_city}</div></div>
                  <div className="path"><Plane /></div>
                  <div style={{ textAlign: 'right' }}><div className="code">{r.destination_code}</div><div className="city">{r.destination_city}</div></div>
                </div>
                <div className="row small text-2" style={{ gap: 14 }}>
                  <span>{fmtDuration(r.duration_min)} nonstop</span>
                  <span>·</span>
                  <span>Next: {fmtShortDate(r.next_departure)}, {fmtTime(r.next_departure)}</span>
                </div>
                <div className="route-foot">
                  <div className="price-from">One-way from<strong className="tnum">{formatInr(r.from_fare)}</strong></div>
                  <span className="badge badge-sky">{r.upcoming_flights} departures</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <div className="eyebrow">Booking with AeroVista</div>
              <h2>From search to boarding pass in four steps</h2>
            </div>
          </div>
          <div className="grid grid-4">
            {[
              [Search, 'Search', 'Pick your cities and date. Every flight shows all three fares side by side.'],
              [Ticket, 'Choose a fare', 'Compare price, baggage, meals, seats left and refund rules before you commit.'],
              [CreditCard, 'Pay securely', 'Confirm with UPI, card or netbanking. Your seat is locked the moment you pay.'],
              [RotateCcw, 'Manage anytime', 'See every trip in My Trips and cancel eligible bookings with an instant refund quote.'],
            ].map(([Icon, title, text], i) => {
              const I = Icon as typeof Search;
              return (
                <div key={i} className="card step">
                  <div className="step-num"><I size={18} /></div>
                  <h3>{title as string}</h3>
                  <p>{text as string}</p>
                </div>
              );
            })}
          </div>
        </section>

        {fares.length > 0 && (
          <section className="section">
            <div className="section-head">
              <div>
                <div className="eyebrow">Fare families</div>
                <h2>Pick the flexibility you need</h2>
                <p>Refund rules are applied automatically when you cancel, based on how close to departure you are.</p>
              </div>
            </div>
            <div className="grid grid-3">
              {fares.map((f) => (
                <div key={f.class_code} className={`card fare-family ${f.class_code === 'FLEX' ? 'featured' : ''}`}>
                  <div className="row between">
                    <h3 style={{ margin: 0 }}>{f.class_name}</h3>
                    {f.class_code === 'FLEX' && <span className="badge badge-navy">Most popular</span>}
                  </div>
                  <ul className="benefits">
                    <li><Briefcase />{f.cabin_baggage_kg} kg cabin baggage</li>
                    <li><Luggage />{f.checkin_baggage_kg} kg check-in baggage</li>
                    <li className={f.meal_included ? '' : 'no'}>{f.meal_included ? <Utensils /> : <Minus />}{f.meal_included ? 'Meal included' : 'Meals available to buy'}</li>
                    <li className={f.priority_boarding ? '' : 'no'}>{f.priority_boarding ? <Check /> : <Minus />}{f.priority_boarding ? 'Priority check-in & boarding' : 'Standard boarding'}</li>
                    <li className={f.refundable ? '' : 'no'}>{f.refundable ? <ShieldCheck /> : <Minus />}
                      {f.refundable ? `${Number(f.refund_pct)}% refund 24h+ before departure, ${Number(f.late_refund_pct)}% after` : 'Non-refundable (seat released if cancelled)'}
                    </li>
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="section">
          <div className="section-head">
            <div>
              <div className="eyebrow">Destination guides</div>
              <h2>Not sure where to go?</h2>
              <p>Describe the trip you want and we’ll match it to a destination.</p>
            </div>
          </div>
          {guides !== null && guides.length === 0 && matches === null ? (
            <Alert kind="info">Destination guides are offline right now (they need the MongoDB guide store). Flight search and booking work as normal.</Alert>
          ) : (
            <>
              <form onSubmit={discover} className="card card-pad" style={{ marginBottom: 18 }}>
                <div className="row row-wrap" style={{ gap: 10 }}>
                  <div className="field" style={{ flex: 1, minWidth: 220 }}>
                    <label className="label" htmlFor="discover">What kind of trip?</label>
                    <input id="discover" className="input" placeholder="e.g. beaches and seafood, history and old markets, craft beer weekend"
                      value={q} onChange={(e) => setQ(e.target.value)} maxLength={200} />
                  </div>
                  <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} disabled={searching || q.trim().length < 2}>
                    {searching ? <span className="spinner" /> : <Sparkles size={16} />}Find my destination
                  </button>
                  {matches !== null && (
                    <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-end' }} onClick={() => { setMatches(null); setQ(''); }}>Show all</button>
                  )}
                </div>
                {matches !== null && (
                  <p className="xs muted" style={{ margin: '10px 0 0' }}>
                    {matches.length ? `Best matches by vector similarity (${engine}).` : 'No close match — try words like beach, food, history, nightlife or culture.'}
                  </p>
                )}
              </form>
              <div className="grid grid-3">
                {guides === null && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 200 }} />)}
                {shownGuides.map((g, i) => (
                  <div key={g.id} className="card guide-card" style={matches && i === 0 ? { borderColor: 'var(--sky-500)' } : undefined}>
                    <div className="row between">
                      <span className="row small text-2" style={{ gap: 6 }}><MapPin size={15} />{g.city} · {g.airport_code}</span>
                      {typeof g.score === 'number' && <span className="badge badge-sky">{Math.round(g.score * 100)}% match</span>}
                    </div>
                    <h3 style={{ margin: 0 }}>{g.title}</h3>
                    <p className="small text-2" style={{ margin: 0 }}>{g.summary}</p>
                    <div className="tags">{g.tags.map((t) => <span key={t} className="badge">{t}</span>)}</div>
                    <div className="row between" style={{ marginTop: 'auto', paddingTop: 6 }}>
                      <span className="xs muted">Best time: {g.best_time || '—'}</span>
                      <Link className="btn btn-secondary btn-sm" href={`/flights?destination=${g.airport_code}`}>Flights <ArrowRight size={14} /></Link>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

export default function Page() {
  return <Suspense><Home /></Suspense>;
}
