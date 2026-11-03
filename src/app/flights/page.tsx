'use client';
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Briefcase, Luggage, MapPin, Plane, PlaneTakeoff, RefreshCw, SearchX, ShieldCheck, Utensils } from 'lucide-react';
import SearchForm from '@/components/SearchForm';
import { Alert, EmptyState, FlightBadge } from '@/components/ui';
import { useSession } from '@/components/Session';
import { api } from '@/lib/client';
import { formatInr } from '@/lib/analytics';
import { dayDiff, fmtDate, fmtDuration, fmtTime, isoDay, parseDbDate } from '@/lib/format';
import type { FlightResult, FareOption } from '@/lib/flights';

type SortKey = 'price' | 'departure' | 'duration';
type CalDay = { date: string; min_fare: number; flights: number };

function seatsText(f: FareOption) {
  if (f.sold_out) return <span className="seats out">Sold out</span>;
  if (f.seats_left <= 5) return <span className="seats low">Only {f.seats_left} left</span>;
  return <span className="seats ok">{f.seats_left} seats left</span>;
}

function FlightCard({ flight, onBook }: { flight: FlightResult; onBook: (f: FlightResult, fare: FareOption) => void }) {
  const firstOpen = flight.fares.find((x) => !x.sold_out) ?? null;
  const [sel, setSel] = useState<number | null>(firstOpen?.flight_fare_id ?? null);
  const chosen = flight.fares.find((x) => x.flight_fare_id === sel) ?? null;
  const order = ['ECO', 'FLEX', 'BUS'];
  const fares = [...flight.fares].sort((a, b) => order.indexOf(a.class_code) - order.indexOf(b.class_code));
  const nextDay = dayDiff(flight.arrival_time) - dayDiff(flight.departure_time);

  return (
    <article className="card flight-card" aria-label={`${flight.flight_number} ${flight.origin.code} to ${flight.destination.code}`}>
      <div className="flight-main">
        <div>
          <div className="itin">
            <div>
              <div className="t tnum">{fmtTime(flight.departure_time)}</div>
              <div className="c">{flight.origin.code} · {flight.origin.city}</div>
            </div>
            <div className="mid">
              {fmtDuration(flight.duration_min)}
              <div className="line" />
              Nonstop
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="t tnum">{fmtTime(flight.arrival_time)}{nextDay > 0 && <sup className="xs muted"> +{nextDay}</sup>}</div>
              <div className="c">{flight.destination.code} · {flight.destination.city}</div>
            </div>
          </div>
          <div className="flight-meta">
            <span className="fn-tag"><Plane size={14} />{flight.flight_number}</span>
            <span className="xs muted">{flight.aircraft_model}</span>
            <span className="xs muted">· {fmtDate(flight.departure_time)}</span>
            {flight.status === 'DELAYED' && <FlightBadge status="DELAYED" />}
          </div>
        </div>
        <div className="small text-2" style={{ justifySelf: 'end', textAlign: 'right' }}>
          <div className="xs muted">{flight.origin.airport}</div>
          <div className="xs muted">to {flight.destination.airport}</div>
          {flight.lowest_fare !== null
            ? <div style={{ marginTop: 8 }}>from <strong className="tnum" style={{ fontSize: '1.2rem', color: 'var(--navy-900)', fontFamily: 'var(--font-head)' }}>{formatInr(flight.lowest_fare)}</strong></div>
            : <span className="badge badge-danger" style={{ marginTop: 8 }}>Fully booked</span>}
        </div>
      </div>

      <div className="fare-options" role="radiogroup" aria-label="Fare options">
        {fares.map((f) => (
          <button key={f.flight_fare_id} type="button" role="radio" aria-checked={sel === f.flight_fare_id}
            className={`fare-opt ${sel === f.flight_fare_id ? 'selected' : ''}`} disabled={f.sold_out}
            onClick={() => setSel(f.flight_fare_id)}>
            <span className="fname"><span>{f.class_name}</span><span className="radio-dot" /></span>
            <span className="fprice tnum">{formatInr(f.price)}</span>
            <span className="fperks">
              <span><Luggage />{f.checkin_baggage_kg} kg check-in · {f.cabin_baggage_kg} kg cabin</span>
              <span><ShieldCheck />{f.refundable ? `Refundable (${f.refund_pct}% / ${f.late_refund_pct}% <24h)` : 'Non-refundable'}</span>
              {f.meal_included && <span><Utensils />Meal included{f.priority_boarding ? ' · priority boarding' : ''}</span>}
            </span>
            {seatsText(f)}
          </button>
        ))}
        {fares.length < 3 && (
          <div className="fare-opt" style={{ cursor: 'default', opacity: .7 }}>
            <span className="fname">Business</span>
            <span className="small muted">Not offered on this aircraft</span>
          </div>
        )}
      </div>

      <div className="flight-cta">
        <span className="total">
          {chosen ? <>{chosen.class_name} · 1 adult<strong className="tnum">{formatInr(chosen.price)}</strong></> : 'All fares on this flight are sold out'}
        </span>
        <button className="btn btn-primary" disabled={!chosen} onClick={() => chosen && onBook(flight, chosen)}>
          Continue to book <ArrowRight size={16} />
        </button>
      </div>
    </article>
  );
}

function FlightsInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const { me } = useSession();
  const origin = sp.get('origin') ?? '';
  const destination = sp.get('destination') ?? '';
  const date = sp.get('date') ?? '';

  const [flights, setFlights] = useState<FlightResult[] | null>(null);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<SortKey>('departure');
  const [cal, setCal] = useState<CalDay[]>([]);
  const [guide, setGuide] = useState<any>(null);

  const load = useCallback(async () => {
    setFlights(null); setError('');
    const qs = new URLSearchParams(Object.entries({ origin, destination, date }).filter(([, v]) => v)).toString();
    const r = await api<{ flights: FlightResult[] }>(`/api/flights?${qs}`);
    if (r.ok) setFlights(r.data.flights);
    else { setError(r.data.error ?? 'Could not load flights'); setFlights([]); }
  }, [origin, destination, date]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setCal([]);
    if (origin && destination) {
      api<{ days: CalDay[] }>(`/api/flights/calendar?origin=${origin}&destination=${destination}`).then((r) => r.ok && setCal(r.data.days));
    }
    setGuide(null);
    if (destination) api<{ guide: any }>(`/api/guides/${destination}`).then((r) => r.ok && setGuide(r.data.guide));
  }, [origin, destination]);

  const sorted = useMemo(() => {
    const xs = [...(flights ?? [])];
    if (sort === 'price') xs.sort((a, b) => (a.lowest_fare ?? Infinity) - (b.lowest_fare ?? Infinity));
    if (sort === 'duration') xs.sort((a, b) => a.duration_min - b.duration_min);
    if (sort === 'departure') xs.sort((a, b) => a.departure_time.localeCompare(b.departure_time));
    return xs;
  }, [flights, sort]);

  function go(q: { origin: string; destination: string; date: string }) {
    router.push(`/flights?${new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString()}`);
  }

  function onBook(f: FlightResult, fare: FareOption) {
    const target = `/book?flight=${f.flight_id}&fare=${fare.flight_fare_id}`;
    if (!me) router.push(`/login?next=${encodeURIComponent(target)}`);
    else router.push(target);
  }

  // 7-day strip around the chosen date (or from today)
  const strip = useMemo(() => {
    if (!origin || !destination) return [];
    const base = date ? parseDbDate(date)! : new Date();
    const start = new Date(base); start.setDate(start.getDate() - (date ? 3 : 0));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (start < today) start.setTime(today.getTime());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const key = isoDay(d);
      return { key, d, info: cal.find((c) => c.date === key) };
    });
  }, [origin, destination, date, cal]);

  const title = origin && destination ? `${origin} → ${destination}` : origin ? `Flights from ${origin}` : destination ? `Flights to ${destination}` : 'All upcoming flights';

  return (
    <main className="page">
      <div className="container">
        <div className="card search-bar"><SearchForm compact initial={{ origin, destination, date }} onSearch={go} /></div>

        {strip.length > 0 && (
          <div className="date-strip" aria-label="Lowest fare by date">
            {strip.map(({ key, d, info }) => (
              <button key={key} className={`date-cell ${key === date ? 'active' : ''} ${info ? '' : 'none'}`}
                onClick={() => go({ origin, destination, date: key })}>
                <div className="d">{d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                <div className="p tnum">{info ? formatInr(info.min_fare) : 'No flights'}</div>
              </button>
            ))}
          </div>
        )}

        <div className="results-layout">
          <section>
            <div className="toolbar">
              <div>
                <h1 style={{ fontSize: '1.4rem', margin: 0 }}>{title}</h1>
                <p className="small muted" style={{ margin: 0 }}>
                  {date ? fmtDate(date) : 'Any date'} · 1 adult · {flights ? `${flights.length} flight${flights.length === 1 ? '' : 's'}` : 'searching…'}
                </p>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className="xs muted">Sort</span>
                <div className="segmented" role="group" aria-label="Sort flights">
                  {([['departure', 'Earliest'], ['price', 'Cheapest'], ['duration', 'Shortest']] as const).map(([k, l]) => (
                    <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)} aria-pressed={sort === k}>{l}</button>
                  ))}
                </div>
              </div>
            </div>

            {error && <Alert kind="danger">{error} <button className="btn btn-sm btn-secondary" style={{ marginLeft: 8 }} onClick={load}><RefreshCw size={14} />Retry</button></Alert>}
            {flights === null && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 230, marginBottom: 16 }} />)}
            {flights && !error && flights.length === 0 && (
              <div className="card">
                <EmptyState icon={<SearchX />} title="No flights match this search"
                  action={date ? <button className="btn btn-secondary" onClick={() => go({ origin, destination, date: '' })}>Show all dates</button>
                    : <Link className="btn btn-secondary" href="/flights">Clear filters</Link>}>
                  {date ? 'Try another date from the strip above, or search without a date.' : 'We don’t fly this route yet. Try another city pair.'}
                </EmptyState>
              </div>
            )}
            {sorted.map((f) => <FlightCard key={f.flight_id} flight={f} onBook={onBook} />)}
          </section>

          <aside className="stack" style={{ position: 'sticky', top: 86 }}>
            {guide && (
              <div className="card card-pad">
                <div className="row small text-2" style={{ gap: 6, marginBottom: 6 }}><MapPin size={15} />About {guide.city}</div>
                <h3>{guide.title}</h3>
                <p className="small text-2">{guide.summary}</p>
                <ul className="benefits">{guide.highlights.slice(0, 3).map((h: string) => <li key={h}><PlaneTakeoff />{h}</li>)}</ul>
              </div>
            )}
            <div className="card card-pad">
              <h3>Good to know</h3>
              <ul className="benefits">
                <li><ShieldCheck />Your seat is held the moment payment succeeds. Two people can’t buy the same last seat.</li>
                <li><Briefcase />Booking closes 1 hour before departure.</li>
                <li><Luggage />Baggage allowance depends on the fare you pick.</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function FlightsPage() {
  return <Suspense><FlightsInner /></Suspense>;
}
