'use client';
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, Plane, Printer } from 'lucide-react';
import { Alert, BookingBadge, PaymentBadge, FlightBadge } from '@/components/ui';
import CancelBooking from '@/components/CancelBooking';
import { api } from '@/lib/client';
import { formatInr } from '@/lib/analytics';
import { fmtDate, fmtDateTime, fmtDuration, fmtTime } from '@/lib/format';

function TicketInner() {
  const { ref } = useParams<{ ref: string }>();
  const isNew = useSearchParams().get('new') === '1';
  const [b, setB] = useState<any>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => {
    api<{ booking: any }>(`/api/bookings/${ref}`).then((r) => r.ok ? setB(r.data.booking) : setErr(r.data.error ?? 'Booking not found'));
  }, [ref]);
  useEffect(load, [load]);

  if (err) return <main className="page"><div className="container" style={{ maxWidth: 760 }}><Alert kind="danger">{err}</Alert><p style={{ marginTop: 14 }}><Link className="btn btn-secondary" href="/bookings">My trips</Link></p></div></main>;
  if (!b) return <main className="page"><div className="container" style={{ maxWidth: 860 }}><div className="skeleton" style={{ height: 460 }} /></div></main>;

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 860 }}>
        <Link href="/bookings" className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}><ArrowLeft size={16} />My trips</Link>
        {isNew && b.booking_status === 'CONFIRMED' && (
          <div className="row" style={{ gap: 16, marginBottom: 20 }}>
            <div className="success-ring"><Check size={28} /></div>
            <div><h1 style={{ margin: 0 }}>Booking confirmed</h1><p className="text-2" style={{ margin: 0 }}>Your seat is reserved and a confirmation has been recorded. Have a great trip, {b.passenger_name.split(' ')[0]}!</p></div>
          </div>
        )}
        <article className="card ticket">
          <div className="ticket-top">
            <div>
              <div className="muted xs" style={{ letterSpacing: '.1em', textTransform: 'uppercase' }}>Booking reference</div>
              <h1 className="mono" style={{ fontSize: '1.9rem' }}>{b.booking_reference}</h1>
            </div>
            <div className="row row-wrap" style={{ gap: 8 }}>
              <BookingBadge status={b.booking_status} />
              <PaymentBadge status={b.payment_status} />
            </div>
          </div>
          <div className="ticket-route">
            <div><div className="code">{b.origin_code}</div><div className="small text-2">{b.origin_city}</div><div className="t" style={{ fontWeight: 700, marginTop: 6 }}>{fmtTime(b.departure_time)}</div><div className="xs muted">{b.origin_airport}</div></div>
            <div className="plane"><Plane size={26} color="var(--sky-600)" />{fmtDuration(b.duration_min)}<span>{b.flight_number}</span></div>
            <div className="right"><div className="code">{b.destination_code}</div><div className="small text-2">{b.destination_city}</div><div className="t" style={{ fontWeight: 700, marginTop: 6 }}>{fmtTime(b.arrival_time)}</div><div className="xs muted">{b.destination_airport}</div></div>
          </div>
          <div className="perforation" />
          <div className="kv-grid">
            <div className="kv"><div className="k">Passenger</div><div className="v">{b.passenger_name}</div></div>
            <div className="kv"><div className="k">Travel date</div><div className="v">{fmtDate(b.departure_time)}</div></div>
            <div className="kv"><div className="k">Flight</div><div className="v">{b.flight_number} · <FlightBadge status={b.flight_status} /></div></div>
            <div className="kv"><div className="k">Aircraft</div><div className="v">{b.aircraft_model}</div></div>
            <div className="kv"><div className="k">Fare class</div><div className="v">{b.class_name}</div></div>
            <div className="kv"><div className="k">Baggage</div><div className="v">{b.checkin_baggage_kg} kg + {b.cabin_baggage_kg} kg cabin</div></div>
            <div className="kv"><div className="k">Amount paid</div><div className="v tnum">{formatInr(b.paid_amount ?? b.total_amount)}</div></div>
            <div className="kv"><div className="k">Payment</div><div className="v">{b.payment_type} · <span className="mono xs">{b.transaction_reference}</span></div></div>
            <div className="kv"><div className="k">Booked on</div><div className="v">{fmtDateTime(b.booked_at)}</div></div>
            <div className="kv"><div className="k">Email</div><div className="v" style={{ wordBreak: 'break-all' }}>{b.passenger_email}</div></div>
            <div className="kv"><div className="k">Refund policy</div><div className="v">{b.refundable ? `${Number(b.refund_pct)}% / ${Number(b.late_refund_pct)}% <24h` : 'Non-refundable'}</div></div>
            <div className="kv"><div className="k">Meal</div><div className="v">{b.meal_included ? 'Included' : 'Not included'}</div></div>
          </div>
          {b.booking_status === 'CANCELLED' && (
            <div style={{ padding: '0 26px 22px' }}>
              <Alert kind="warning">
                Cancelled on {fmtDateTime(b.cancellation_date)}. Refund: <strong>{formatInr(b.refund_amount)}</strong>
                {b.refund_policy ? ` (${b.refund_policy})` : ''}{b.cancellation_reason ? ` · Reason: ${b.cancellation_reason}` : ''}
              </Alert>
            </div>
          )}
          <div className="flight-cta">
            <span className="xs muted">Payment simulated for demonstration — no money was charged.</span>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => window.print()}><Printer size={15} />Print</button>
              {!!b.can_cancel && <CancelBooking small bookingId={b.booking_id} reference={b.booking_reference} onDone={load} />}
            </div>
          </div>
        </article>
        {!!b.can_cancel && <p className="small muted" style={{ marginTop: 12 }}>If you cancel now you would get back <strong>{formatInr(b.refund_if_cancelled_now)}</strong>.</p>}
      </div>
    </main>
  );
}
export default function TicketPage() { return <Suspense><TicketInner /></Suspense>; }
