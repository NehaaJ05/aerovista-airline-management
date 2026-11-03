'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, Search } from 'lucide-react';
import { api } from '@/lib/client';
import { isoDay } from '@/lib/format';

export type Airport = { airport_code: string; city: string; airport_name: string };

let airportCache: Airport[] | null = null;
export function useAirports() {
  const [airports, setAirports] = useState<Airport[]>(airportCache ?? []);
  const [error, setError] = useState('');
  useEffect(() => {
    if (airportCache) return;
    api<{ airports: Airport[] }>('/api/airports').then((r) => {
      if (r.ok) { airportCache = r.data.airports; setAirports(r.data.airports); }
      else setError(r.data.error ?? 'Could not load airports');
    });
  }, []);
  return { airports, error };
}

export default function SearchForm({
  initial, onSearch, compact,
}: {
  initial?: { origin?: string; destination?: string; date?: string };
  onSearch?: (q: { origin: string; destination: string; date: string }) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const { airports, error } = useAirports();
  const [origin, setOrigin] = useState(initial?.origin ?? 'BLR');
  const [destination, setDestination] = useState(initial?.destination ?? 'DEL');
  const [date, setDate] = useState(initial?.date ?? '');
  const [msg, setMsg] = useState('');
  const today = isoDay(new Date());

  useEffect(() => {
    if (initial) {
      if (initial.origin !== undefined) setOrigin(initial.origin);
      if (initial.destination !== undefined) setDestination(initial.destination);
      if (initial.date !== undefined) setDate(initial.date);
    }
  }, [initial?.origin, initial?.destination, initial?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (origin && destination && origin === destination) { setMsg('Origin and destination must be different.'); return; }
    if (date && date < today) { setMsg('Please choose today or a future date.'); return; }
    setMsg('');
    const q = { origin, destination, date };
    if (onSearch) onSearch(q);
    else router.push(`/flights?${new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString()}`);
  }

  const opt = (a: Airport) => <option key={a.airport_code} value={a.airport_code}>{a.city} ({a.airport_code})</option>;
  return (
    <form onSubmit={submit} noValidate>
      <div className="search-grid">
        <label className="field">
          <span className="label">From</span>
          <select className="select" value={origin} onChange={(e) => setOrigin(e.target.value)} aria-label="Origin airport">
            <option value="">Any city</option>
            {airports.map(opt)}
          </select>
        </label>
        <button type="button" className="swap-btn" aria-label="Swap origin and destination"
          onClick={() => { setOrigin(destination); setDestination(origin); }}>
          <ArrowLeftRight size={17} />
        </button>
        <label className="field">
          <span className="label">To</span>
          <select className="select" value={destination} onChange={(e) => setDestination(e.target.value)} aria-label="Destination airport">
            <option value="">Any city</option>
            {airports.map(opt)}
          </select>
        </label>
        <label className="field">
          <span className="label">Departure date</span>
          <input className="input" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className={`btn btn-primary ${compact ? '' : 'btn-lg'}`} type="submit">
          <Search size={18} />Search flights
        </button>
      </div>
      {(msg || error) && <p className="field-error" style={{ marginTop: 10, marginBottom: 0 }}>{msg || error}</p>}
      {!compact && <p className="xs muted" style={{ margin: '10px 0 0' }}>1 passenger per booking · leave the date empty to see every upcoming departure</p>}
    </form>
  );
}
