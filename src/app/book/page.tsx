'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Building2, CreditCard, Lock, Plane, ShieldCheck, Smartphone, User } from 'lucide-react';
import { Alert } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useSession } from '@/components/Session';
import { api } from '@/lib/client';
import { formatInr } from '@/lib/analytics';
import { fmtDate, fmtDuration, fmtTime } from '@/lib/format';
import type { FlightResult } from '@/lib/flights';

const METHODS = [
  { id: 'UPI', label: 'UPI', icon: Smartphone, hint: 'Any UPI app' },
  { id: 'CARD', label: 'Credit / debit card', icon: CreditCard, hint: 'Visa, Mastercard, RuPay' },
  { id: 'NETBANKING', label: 'Netbanking', icon: Building2, hint: 'All major banks' },
] as const;

function BookInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { me } = useSession();
  const flightId = Number(sp.get('flight'));
  const fareId = Number(sp.get('fare'));
  const [flight, setFlight] = useState<FlightResult | null>(null);
  const [err, setErr] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [method, setMethod] = useState<'UPI' | 'CARD' | 'NETBANKING'>('UPI');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!flightId || !fareId) { setErr('Choose a flight and fare first.'); return; }
    api<{ flight: FlightResult }>(`/api/flights/${flightId}`).then((r) => r.ok ? setFlight(r.data.flight) : setErr(r.data.error ?? 'Flight not found'));
    api<{ profile: any }>('/api/profile').then((r) => r.ok && setProfile(r.data.profile));
  }, [flightId, fareId]);

  const fare = flight?.fares.find((f) => f.flight_fare_id === fareId);

  async function pay() {
    if (!fare || !flight) return;
    setBusy(true); setErr('');
    const r = await api<{ bookingReference: string }>('/api/bookings', {
      method: 'POST', body: JSON.stringify({ flightId: flight.flight_id, flightFareId: fare.flight_fare_id, paymentType: method }),
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.data.error ?? 'Booking failed');
      toast('error', r.data.error ?? 'Booking failed');
      api<{ flight: FlightResult }>(`/api/flights/${flightId}`).then((x) => x.ok && setFlight(x.data.flight));
      return;
    }
    toast('success', `Booking ${r.data.bookingReference} confirmed`);
    router.push(`/bookings/${r.data.bookingReference}?new=1`);
  }

  if (err && !flight) return <main className="page"><div className="container" style={{ maxWidth: 720 }}><Alert kind="danger">{err}</Alert><p style={{ marginTop: 16 }}><Link href="/flights" className="btn btn-secondary"><ArrowLeft size={16} />Back to flights</Link></p></div></main>;
  if (!flight) return <main className="page"><div className="container"><div className="skeleton" style={{ height: 420 }} /></div></main>;
  if (!fare) return <main className="page"><div className="container"><Alert kind="danger">This fare does not belong to the selected flight.</Alert></div></main>;

  return (
    <main className="page">
      <div className="container">
        <Link href={`/flights?origin=${flight.origin.code}&destination=${flight.destination.code}&date=${flight.departure_time.slice(0, 10)}`} className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>
          <ArrowLeft size={16} />Change flight
        </Link>
        <div className="page-head"><div><div className="eyebrow">Review & pay</div><h1>Complete your booking</h1></div></div>
        {me?.role === 'ADMIN' && <div style={{ marginBottom: 16 }}><Alert kind="warning">You are signed in as an admin. Admin accounts can’t book — sign in as a passenger.</Alert></div>}
        <div className="results-layout" style={{ gridTemplateColumns: '1fr 360px' }}>
          <div className="stack" style={{ gap: 18 }}>
            <section className="card">
              <div className="card-head"><h2><Plane size={17} style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />Flight</h2><span className="fn-tag">{flight.flight_number} · {flight.aircraft_model}</span></div>
              <div className="card-body">
                <div className="itin">
                  <div><div className="t tnum">{fmtTime(flight.departure_time)}</div><div className="c">{flight.origin.city} ({flight.origin.code})</div><div className="xs muted">{flight.origin.airport}</div></div>
                  <div className="mid">{fmtDuration(flight.duration_min)}<div className="line" />Nonstop</div>
                  <div style={{ textAlign: 'right' }}><div className="t tnum">{fmtTime(flight.arrival_time)}</div><div className="c">{flight.destination.city} ({flight.destination.code})</div><div className="xs muted">{flight.destination.airport}</div></div>
                </div>
                <p className="small text-2" style={{ margin: '14px 0 0' }}>{fmtDate(flight.departure_time)}</p>
              </div>
            </section>
            <section className="card">
              <div className="card-head"><h2>Passenger</h2><span className="badge badge-sky"><User />1 adult</span></div>
              <div className="card-body kv-grid" style={{ padding: '18px 22px' }}>
                <div className="kv"><div className="k">Name</div><div className="v">{profile?.name ?? me?.name ?? '—'}</div></div>
                <div className="kv"><div className="k">Email</div><div className="v">{profile?.email ?? me?.email ?? '—'}</div></div>
                <div className="kv"><div className="k">Phone</div><div className="v">{profile?.phone ?? '—'}</div></div>
                <div className="kv"><div className="k">Loyalty</div><div className="v">{profile?.loyalty_tier ?? 'STANDARD'}</div></div>
              </div>
              <p className="xs muted" style={{ padding: '0 22px 16px', margin: 0 }}>Ticket is issued in the account holder’s name. <Link href="/profile">Edit profile</Link></p>
            </section>
            <section className="card">
              <div className="card-head"><h2>Payment method</h2><span className="badge badge-warning">Simulated</span></div>
              <div className="card-body stack">
                {METHODS.map((m) => (
                  <label key={m.id} className={`pay-opt ${method === m.id ? 'selected' : ''}`}>
                    <input type="radio" name="pay" checked={method === m.id} onChange={() => setMethod(m.id)} />
                    <m.icon size={20} />
                    <span style={{ flex: 1 }}><strong>{m.label}</strong><br /><span className="xs muted">{m.hint}</span></span>
                  </label>
                ))}
                <Alert kind="info">Demo payment: no card or UPI details are collected and no money moves. A payment record with status SUCCESS is created in MySQL.</Alert>
              </div>
            </section>
          </div>

          <aside className="card card-pad" style={{ position: 'sticky', top: 86 }}>
            <h2>Price summary</h2>
            <div className="summary-row"><span>{fare.class_name} fare × 1</span><strong className="tnum">{formatInr(fare.price)}</strong></div>
            <div className="summary-row"><span>Taxes & fees</span><strong>Included</strong></div>
            <div className="summary-row summary-total"><span>Total</span><strong className="tnum">{formatInr(fare.price)}</strong></div>
            <ul className="benefits" style={{ margin: '14px 0' }}>
              <li><ShieldCheck />{fare.refundable ? `${fare.refund_pct}% refund if cancelled 24h+ before departure, ${fare.late_refund_pct}% after.` : 'Non-refundable: you can cancel, but no money is returned.'}</li>
              <li><ShieldCheck />{fare.checkin_baggage_kg} kg check-in, {fare.cabin_baggage_kg} kg cabin{fare.meal_included ? ', meal included' : ''}.</li>
            </ul>
            <p className={`small ${fare.sold_out ? '' : 'muted'}`} style={{ color: fare.sold_out ? 'var(--danger)' : undefined }}>
              {fare.sold_out ? 'This fare has just sold out.' : `${fare.seats_left} seat${fare.seats_left === 1 ? '' : 's'} left at this price`}
            </p>
            <label className="row small" style={{ gap: 8, alignItems: 'flex-start', margin: '6px 0 14px' }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 4 }} />
              <span>I accept the fare rules and the refund policy above.</span>
            </label>
            {err && <div style={{ marginBottom: 12 }}><Alert kind="danger">{err}</Alert></div>}
            <button className="btn btn-primary btn-lg btn-block" disabled={!agree || busy || fare.sold_out || me?.role === 'ADMIN'} onClick={pay}>
              {busy ? <span className="spinner" /> : <Lock size={17} />}Pay {formatInr(fare.price)}
            </button>
          </aside>
        </div>
      </div>
    </main>
  );
}
export default function BookPage() { return <Suspense><BookInner /></Suspense>; }
