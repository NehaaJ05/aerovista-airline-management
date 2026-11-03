'use client';
import { useState } from 'react';
import { XCircle } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';
import { api } from '@/lib/client';
import { formatInr } from '@/lib/analytics';

type Quote = { cancellable: boolean; paidAmount: number; refundAmount: number; appliedPct: number; window: string; className: string };

/** Cancel button + dialog showing the refund quote from fn_refund_amount(). */
export default function CancelBooking({ bookingId, reference, onDone, small }: { bookingId: number; reference: string; onDone: () => void; small?: boolean }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');

  async function start() {
    setOpen(true); setQuote(null);
    const r = await api<{ quote: Quote }>(`/api/bookings/${bookingId}/refund-quote`);
    if (r.ok) setQuote(r.data.quote); else { setOpen(false); toast('error', r.data.error ?? 'Could not get refund quote'); }
  }
  async function confirm() {
    setBusy(true);
    const r = await api<{ refundAmount: number; refundPolicy: string }>(`/api/bookings/${bookingId}/cancel`, { method: 'POST', body: JSON.stringify({ reason: reason || undefined }) });
    setBusy(false);
    setOpen(false);
    if (!r.ok) { toast('error', r.data.error ?? 'Cancellation failed'); onDone(); return; }
    toast('success', r.data.refundAmount > 0 ? `Booking ${reference} cancelled. ${formatInr(r.data.refundAmount)} refunded.` : `Booking ${reference} cancelled. No refund on this fare.`);
    onDone();
  }

  return (
    <>
      <button className={`btn btn-danger-outline ${small ? 'btn-sm' : ''}`} onClick={start}><XCircle size={16} />Cancel booking</button>
      <ConfirmDialog open={open} title={`Cancel booking ${reference}?`} danger busy={busy}
        confirmLabel={quote ? (quote.refundAmount > 0 ? `Cancel & refund ${formatInr(quote.refundAmount)}` : 'Cancel without refund') : 'Cancel booking'}
        onConfirm={confirm} onClose={() => setOpen(false)}>
        {!quote ? <p><span className="spinner" /> Calculating your refund…</p> : (
          <>
            <div className="card card-pad" style={{ background: 'var(--surface-2)', margin: '6px 0 14px' }}>
              <div className="summary-row"><span>Amount paid</span><strong className="tnum">{formatInr(quote.paidAmount)}</strong></div>
              <div className="summary-row"><span>{quote.className} policy ({quote.window})</span><strong>{quote.appliedPct}%</strong></div>
              <div className="summary-row summary-total"><span>You get back</span><strong className="tnum">{formatInr(quote.refundAmount)}</strong></div>
            </div>
            <label className="field">
              <span className="label">Reason (optional)</span>
              <input className="input" maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. change of plans" />
            </label>
            <p className="xs muted" style={{ marginTop: 10 }}>This can’t be undone. Your seat is released immediately.</p>
          </>
        )}
      </ConfirmDialog>
    </>
  );
}
