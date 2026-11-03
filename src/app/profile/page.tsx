'use client';
import { useEffect, useState } from 'react';
import { Award, Save } from 'lucide-react';
import { Alert } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useSession } from '@/components/Session';
import { api } from '@/lib/client';
import { formatInr } from '@/lib/analytics';
import { fmtDate } from '@/lib/format';

export default function Profile() {
  const toast = useToast();
  const { refresh } = useSession();
  const [p, setP] = useState<any>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ profile: any }>('/api/profile').then((r) => {
      if (r.ok) { setP(r.data.profile); setName(r.data.profile.name); setPhone(r.data.profile.phone ?? ''); } else setErr(r.data.error ?? 'Could not load profile');
    });
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await api<{ profile: any }>('/api/profile', { method: 'PATCH', body: JSON.stringify({ name, phone }) });
    setBusy(false);
    if (!r.ok) { setErr(r.data.error ?? 'Could not save'); return; }
    setP(r.data.profile); await refresh(); toast('success', 'Profile updated');
  }
  if (!p) return <main className="page"><div className="container">{err ? <Alert kind="danger">{err}</Alert> : <div className="skeleton" style={{ height: 300 }} />}</div></main>;
  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 900 }}>
        <div className="page-head"><div><div className="eyebrow">Account</div><h1>{p.name}</h1><p>Member since {fmtDate(p.created_at, false)} · {p.role === 'ADMIN' ? 'Administrator' : 'Passenger'}</p></div></div>
        {p.role === 'PASSENGER' && (
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <div className="card kpi"><span className="kpi-label"><span className="kpi-icon"><Award /></span>Loyalty tier</span><span className="kpi-value">{p.loyalty_tier ?? 'STANDARD'}</span><span className="kpi-sub">{p.loyalty_points ?? 0} points (1 per ₹100)</span></div>
            <div className="card kpi"><span className="kpi-label">Upcoming trips</span><span className="kpi-value">{p.trips_upcoming}</span></div>
            <div className="card kpi"><span className="kpi-label">Completed trips</span><span className="kpi-value">{p.trips_completed}</span></div>
            <div className="card kpi"><span className="kpi-label">Total spent</span><span className="kpi-value">{formatInr(p.total_spent, { compact: true })}</span></div>
          </div>
        )}
        <form className="card card-pad stack" onSubmit={save} style={{ maxWidth: 560 }}>
          <h2>Personal details</h2>
          {err && <Alert kind="danger">{err}</Alert>}
          <label className="field"><span className="label">Full name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span className="label">Mobile number</span><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98450 12345" /></label>
          <label className="field"><span className="label">Email</span><input className="input" value={p.email} disabled /><span className="field-hint">Email is your login and can’t be changed.</span></label>
          <div><button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : <Save size={16} />}Save changes</button></div>
        </form>
      </div>
    </main>
  );
}
