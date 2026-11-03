'use client';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Ban, Check, Clock, RefreshCw } from 'lucide-react';
import AdminTabs from '@/components/AdminTabs';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Alert, EmptyState, FlightBadge } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/client';
import { formatInr } from '@/lib/analytics';
import { fmtDate, fmtTime, isoDay } from '@/lib/format';

function FareRow({ fare, editable, onSaved }: { fare: any; editable: boolean; onSaved: () => void }) {
  const toast = useToast();
  const [price, setPrice] = useState(String(fare.price));
  const [alloc, setAlloc] = useState(String(fare.allocated_seats));
  const [busy, setBusy] = useState(false);
  const dirty = Number(price) !== fare.price || Number(alloc) !== fare.allocated_seats;
  async function save() {
    setBusy(true);
    const r = await api(`/api/admin/fares/${fare.flight_fare_id}`, { method: 'PATCH', body: JSON.stringify({ currentFare: Number(price), allocatedSeats: Number(alloc) }) });
    setBusy(false);
    if (r.ok) { toast('success', `${fare.class_name} fare updated`); onSaved(); } else toast('error', r.data.error ?? 'Update failed');
  }
  const sold = fare.allocated_seats - fare.seats_left;
  return (
    <tr>
      <td style={{ paddingLeft: 34 }}>{fare.class_name}</td>
      <td className="num">{editable ? <input className="inline-input" type="number" min={500} value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Fare" /> : formatInr(fare.price)}</td>
      <td className="num">{sold}</td>
      <td className="num">{editable ? <input className="inline-input" style={{ width: 80 }} type="number" min={sold} value={alloc} onChange={(e) => setAlloc(e.target.value)} aria-label="Allocated seats" /> : fare.allocated_seats}</td>
      <td className="num">{fare.sold_out ? <span className="badge badge-danger">Sold out</span> : fare.seats_left}</td>
      <td className="num">{editable && <button className="btn btn-secondary btn-sm" disabled={!dirty || busy} onClick={save}>{busy ? <span className="spinner" /> : <Check size={14} />}Save</button>}</td>
    </tr>
  );
}

export default function AdminFlights() {
  const toast = useToast();
  const [date, setDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return isoDay(d); });
  const [flights, setFlights] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFlights(null);
    const r = await api<{ flights: any[] }>(`/api/admin/flights?date=${date}`);
    if (r.ok) { setFlights(r.data.flights); setErr(''); } else { setErr(r.data.error ?? 'Could not load flights'); setFlights([]); }
  }, [date]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(f: any, status: 'SCHEDULED' | 'DELAYED') {
    const r = await api(`/api/admin/flights/${f.flight_id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    if (r.ok) { toast('success', `${f.flight_number} marked ${status.toLowerCase()}`); load(); } else toast('error', r.data.error ?? 'Update failed');
  }
  async function cancelFlight() {
    setBusy(true);
    const r = await api<{ bookingsCancelled: number; totalRefund: number }>(`/api/admin/flights/${cancelTarget.flight_id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'Operational reasons' }) });
    setBusy(false); setCancelTarget(null);
    if (r.ok) { toast('success', `Flight cancelled: ${r.data.bookingsCancelled} bookings refunded ${formatInr(r.data.totalRefund)}`); load(); } else toast('error', r.data.error ?? 'Cancellation failed');
  }
  const departed = (f: any) => f.departure_time <= `${isoDay(new Date())} ${new Date().toTimeString().slice(0, 8)}`;

  return (
    <main className="page">
      <div className="container">
        <div className="page-head">
          <div><div className="eyebrow">Operations</div><h1>Flights & fares</h1><p>Update prices and seat allocation, delay or cancel a departure. Rules are enforced by MySQL.</p></div>
          <div className="row" style={{ gap: 10 }}>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} aria-label="Departure date" />
            <button className="btn btn-secondary" onClick={load}><RefreshCw size={16} />Refresh</button>
          </div>
        </div>
        <AdminTabs />
        {err && <Alert kind="danger">{err}</Alert>}
        <section className="card">
          <div className="card-head"><div><h2>{fmtDate(date)}</h2><p>{flights?.length ?? 0} departures</p></div></div>
          {flights === null ? <div className="card-body"><div className="skeleton" style={{ height: 240 }} /></div> : flights.length === 0 ? (
            <EmptyState icon={<Clock />} title="No departures on this date" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Flight / fare</th><th className="num">Price (₹)</th><th className="num">Sold</th><th className="num">Allocated</th><th className="num">Seats left</th><th className="num">Actions</th></tr></thead>
                <tbody>
                  {flights.map((f) => {
                    const editable = (f.status === 'SCHEDULED' || f.status === 'DELAYED') && !departed(f);
                    return (
                      <Fragment key={f.flight_id}>
                        <tr style={{ background: 'var(--surface-2)' }}>
                          <td colSpan={4}>
                            <strong>{f.flight_number}</strong> · {f.origin.code} → {f.destination.code} · {fmtTime(f.departure_time)}–{fmtTime(f.arrival_time)} · {f.aircraft_model}
                            <span className="xs muted"> · fuel {formatInr(f.fuel_cost)}</span>
                          </td>
                          <td className="num"><FlightBadge status={f.status} /></td>
                          <td className="num">
                            {editable && (
                              <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                                {f.status === 'SCHEDULED'
                                  ? <button className="btn btn-secondary btn-sm" onClick={() => setStatus(f, 'DELAYED')}><Clock size={14} />Delay</button>
                                  : <button className="btn btn-secondary btn-sm" onClick={() => setStatus(f, 'SCHEDULED')}><Check size={14} />On time</button>}
                                <button className="btn btn-danger-outline btn-sm" onClick={() => setCancelTarget(f)}><Ban size={14} />Cancel flight</button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {f.fares.map((fare: any) => <FareRow key={fare.flight_fare_id + ':' + fare.price + ':' + fare.allocated_seats} fare={fare} editable={editable} onSaved={load} />)}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <ConfirmDialog open={!!cancelTarget} danger busy={busy} title={`Cancel flight ${cancelTarget?.flight_number}?`} confirmLabel="Cancel flight & refund all"
          onConfirm={cancelFlight} onClose={() => setCancelTarget(null)}>
          <p>Runs <span className="code-pill">sp_cancel_flight</span>: every confirmed booking on this departure is cancelled with a <strong>100% refund</strong>, all seats are released and the flight is marked CANCELLED. This can’t be undone.</p>
        </ConfirmDialog>
      </div>
    </main>
  );
}
