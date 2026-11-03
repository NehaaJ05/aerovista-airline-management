'use client';
import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Clock, Info, XCircle, CalendarCheck } from 'lucide-react';

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="row" style={{ gap: 8 }} role="status">
      <span className="spinner" aria-hidden />
      {label && <span>{label}</span>}
    </span>
  );
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'danger' | 'success' | 'warning'; children: ReactNode }) {
  const Icon = kind === 'danger' ? AlertCircle : kind === 'success' ? CheckCircle2 : Info;
  return (
    <div className={`alert alert-${kind}`} role={kind === 'danger' ? 'alert' : 'status'}>
      <Icon aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {children && <p className="small">{children}</p>}
      {action}
    </div>
  );
}

const BOOKING: Record<string, [string, string, typeof CheckCircle2]> = {
  CONFIRMED: ['badge-success', 'Confirmed', CheckCircle2],
  COMPLETED: ['badge-info', 'Completed', CalendarCheck],
  CANCELLED: ['badge-danger', 'Cancelled', XCircle],
  PENDING: ['badge-warning', 'Pending', Clock],
};
const PAYMENT: Record<string, [string, string]> = {
  SUCCESS: ['badge-success', 'Paid'],
  REFUNDED: ['badge-info', 'Refunded'],
  PARTIALLY_REFUNDED: ['badge-info', 'Partly refunded'],
  PENDING: ['badge-warning', 'Payment pending'],
  FAILED: ['badge-danger', 'Payment failed'],
};
const FLIGHT: Record<string, [string, string]> = {
  SCHEDULED: ['badge-success', 'On schedule'],
  DELAYED: ['badge-warning', 'Delayed'],
  CANCELLED: ['badge-danger', 'Cancelled'],
  COMPLETED: ['badge-info', 'Landed'],
};

export function BookingBadge({ status }: { status: string }) {
  const [cls, label, Icon] = BOOKING[status] ?? ['', status, Info];
  return <span className={`badge ${cls}`}><Icon aria-hidden />{label}</span>;
}
export function PaymentBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="badge">No payment</span>;
  const [cls, label] = PAYMENT[status] ?? ['', status];
  return <span className={`badge ${cls}`}>{label}</span>;
}
export function FlightBadge({ status }: { status: string }) {
  const [cls, label] = FLIGHT[status] ?? ['', status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2.5 13.5 21 6.2c.6-.2 1.1.4.8 1L17 16.4c-.2.4-.7.6-1.1.4l-3.4-1.5-2.6 3.3c-.3.4-1 .2-1-.3v-3.7l7.4-7-9 5.6-4.5-1.5c-.6-.2-.6-1 0-1.2Z" fill="currentColor" />
    </svg>
  );
}
