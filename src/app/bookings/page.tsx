'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarClock, History, Plane, Ticket, XCircle } from 'lucide-react';
import { Alert, BookingBadge, EmptyState, PaymentBadge } from '@/components/ui';
import CancelBooking from '@/components/CancelBooking';
import { api } from '@/lib/client';
import { formatInr } from '@/lib/analytics';
import { fmtDate, fmtTime } from '@/lib/format';

type Tab = 'upcoming' | 'past' | 'cancelled';

export default function MyBookings() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>('upcoming');
  const load = useCallback(async () => {
    const r = await api<{ bookings: any[] }>('/api/bookings');
    if (r.ok) setRows(r.data.bookings); else { setErr(r.data.error ?? 'Could not load bookings'); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const all = rows ?? [];
    return {
      upcoming: all.filter((b) => b.booking_status === 'CONFIRMED').sort((a, b) => a.departure_time.localeCompare(b.departure_time)),
      past: all.filter((b) => b.booking_status === 'COMPLETED'),
      cancelled: all.filter((b) => b.booking_status === 'CANCELLED'),
    };
  }, [rows]);
  const list = groups[tab];
  const tabs: [Tab, string, typeof Plane][] = [['upcoming', 'Upcoming', CalendarClock], ['past', 'Completed', History], ['cancelled', 'Cancelled', XCircle]];

  return (
    <main className="page">
      <div className="container">
        <div className="page-head">
          <div><div className="eyebrow">My trips</div><h1>Your bookings</h1><p>Every booking, payment and refund on your account.</p></div>
          <Link href="/flights" className="btn btn-primary"><Plane size={16} />Book a new flight</Link>
        </div>
        {err && <Alert kind="danger">{err}</Alert>}
        <div className="tabs" role="tablist">
          {tabs.map(([k, label, Icon]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
              <Icon size={16} />{label}<span className="count">{groups[k].length}</span>
            </button>
          ))}
        </div>
        {rows === null && [0, 1].map((i) => <div key={i} className="skeleton" style={{ height: 150, marginBottom: 14 }} />)}
        {rows && list.length === 0 && (
          <div className="card"><EmptyState icon={<Ticket />} title={tab === 'upcoming' ? 'No upcoming trips' : tab === 'past' ? 'No completed trips yet' : 'No cancelled bookings'}
            action={tab === 'upcoming' ? <Link href="/flights" className="btn btn-primary">Find a flight</Link> : undefined}>
            {tab === 'upcoming' ? 'When you book a flight it will appear here.' : undefined}
          </EmptyState></div>
        )}
        {list.map((b) => (
          <article key={b.booking_id} className="card booking-card">
            <div>
              <div className="row row-wrap" style={{ gap: 10, marginBottom: 6 }}>
                <span className="mono small" style={{ fontWeight: 700, color: 'var(--navy-700)' }}>{b.booking_reference}</span>
                <BookingBadge status={b.booking_status} /><PaymentBadge status={b.payment_status} />
              </div>
              <div className="route">{b.origin_city} <ArrowRight size={18} color="var(--sky-600)" /> {b.destination_city}</div>
              <div className="booking-facts">
                <div className="kv"><div className="k">Date</div><div className="v">{fmtDate(b.departure_time)}</div></div>
                <div className="kv"><div className="k">Time</div><div className="v tnum">{fmtTime(b.departure_time)} – {fmtTime(b.arrival_time)}</div></div>
                <div className="kv"><div className="k">Flight</div><div className="v">{b.flight_number}</div></div>
                <div className="kv"><div className="k">Fare</div><div className="v">{b.class_name}</div></div>
                <div className="kv"><div className="k">Paid</div><div className="v tnum">{formatInr(b.paid_amount ?? b.total_amount)}</div></div>
                {b.booking_status === 'CANCELLED' && <div className="kv"><div className="k">Refunded</div><div className="v tnum">{formatInr(b.refund_amount)}</div></div>}
              </div>
              {b.booking_status === 'CANCELLED' && b.refund_policy && <p className="xs muted" style={{ margin: '10px 0 0' }}>{b.refund_policy}{b.cancellation_type === 'FLIGHT_CANCELLED' ? ' · flight cancelled by airline' : ''}</p>}
            </div>
            <div className="booking-side">
              {!!b.can_cancel && <span className="xs muted">Refund if cancelled now: <strong>{formatInr(b.refund_if_cancelled_now)}</strong></span>}
              <div className="row row-wrap" style={{ gap: 8, justifyContent: 'flex-end' }}>
                <Link className="btn btn-secondary btn-sm" href={`/bookings/${b.booking_reference}`}>View ticket</Link>
                {!!b.can_cancel && <CancelBooking small bookingId={b.booking_id} reference={b.booking_reference} onDone={load} />}
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
