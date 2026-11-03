'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import AdminTabs from '@/components/AdminTabs';
import CancelBooking from '@/components/CancelBooking';
import { Alert, BookingBadge, PaymentBadge } from '@/components/ui';
import { api } from '@/lib/client';
import { formatInr } from '@/lib/analytics';
import { fmtDateTime } from '@/lib/format';

export default function AdminBookings() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setRows(null);
    const r = await api<{ bookings: any[] }>(`/api/admin/bookings?q=${encodeURIComponent(query)}`);
    if (r.ok) { setRows(r.data.bookings); setErr(''); } else { setErr(r.data.error ?? 'Could not load bookings'); setRows([]); }
  }, [query]);
  useEffect(() => { load(); }, [load]);

  return (
    <main className="page">
      <div className="container">
        <div className="page-head"><div><div className="eyebrow">Customer service</div><h1>Bookings</h1><p>Look up any booking by reference, passenger email or flight number.</p></div></div>
        <AdminTabs />
        <form className="card card-pad row row-wrap" style={{ gap: 10, marginBottom: 18 }} onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
          <input className="input" style={{ flex: 1, minWidth: 220 }} placeholder="AV7K2M9QXD · demo.passenger@aerovista.local · AV101" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search bookings" />
          <button className="btn btn-primary"><Search size={16} />Search</button>
          {query && <button type="button" className="btn btn-ghost" onClick={() => { setQ(''); setQuery(''); }}>Clear</button>}
        </form>
        {err && <Alert kind="danger">{err}</Alert>}
        <section className="card">
          <div className="card-head"><div><h2>{query ? `Results for “${query}”` : 'Latest bookings'}</h2><p>Up to 50 rows from v_booking_details</p></div></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Reference</th><th>Passenger</th><th>Flight</th><th>Departure</th><th>Fare</th><th className="num">Amount</th><th>Status</th><th>Payment</th><th className="num">Refund</th><th></th></tr></thead>
              <tbody>
                {rows === null && <tr><td colSpan={10}><div className="skeleton" style={{ height: 120 }} /></td></tr>}
                {rows?.length === 0 && <tr><td colSpan={10} className="muted" style={{ textAlign: 'center', padding: 30 }}>No bookings found.</td></tr>}
                {rows?.map((b) => (
                  <tr key={b.booking_id}>
                    <td className="mono"><Link href={`/bookings/${b.booking_reference}`}>{b.booking_reference}</Link></td>
                    <td>{b.passenger_name}<div className="xs muted">{b.passenger_email}</div></td>
                    <td>{b.flight_number}<div className="xs muted">{b.origin_code} → {b.destination_code}</div></td>
                    <td className="tnum">{fmtDateTime(b.departure_time)}</td>
                    <td>{b.class_name}</td>
                    <td className="num">{formatInr(b.total_amount)}</td>
                    <td><BookingBadge status={b.booking_status} /></td>
                    <td><PaymentBadge status={b.payment_status} /></td>
                    <td className="num">{b.booking_status === 'CANCELLED' ? formatInr(b.refund_amount) : b.can_cancel ? <span className="muted">{formatInr(b.refund_if_cancelled_now)} if now</span> : '—'}</td>
                    <td>{!!b.can_cancel && <CancelBooking small bookingId={b.booking_id} reference={b.booking_reference} onDone={load} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
