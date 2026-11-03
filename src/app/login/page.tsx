'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogIn } from 'lucide-react';
import AuthArt from '@/components/AuthArt';
import PasswordInput from '@/components/PasswordInput';
import { Alert } from '@/components/ui';
import { useSession } from '@/components/Session';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/client';

function LoginInner() {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const { refresh } = useSession();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fe: typeof fieldErr = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) fe.email = 'Enter a valid email address';
    if (!password) fe.password = 'Password is required';
    setFieldErr(fe); setErr('');
    if (Object.keys(fe).length) return;
    setBusy(true);
    const r = await api<{ role: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setBusy(false);
    if (!r.ok) { setErr(r.data.error ?? 'Sign in failed'); return; }
    const me = await refresh();
    toast('success', `Welcome back, ${me?.name.split(' ')[0] ?? ''}`);
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
    router.push(safeNext ?? (r.data.role === 'ADMIN' ? '/admin' : '/flights'));
    router.refresh();
  }

  return (
    <main className="auth-wrap">
      <AuthArt title="Welcome back to AeroVista" text="Sign in to book flights, manage your trips or open the revenue dashboard." />
      <div className="auth-form-side">
        <form className="auth-card stack" onSubmit={submit} noValidate>
          <div>
            <h1>Sign in</h1>
            <p className="text-2">New to AeroVista? <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link></p>
          </div>
          {next && <Alert kind="info">Please sign in to continue.</Alert>}
          {err && <Alert kind="danger">{err}</Alert>}
          <label className="field">
            <span className="label">Email</span>
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!fieldErr.email} />
            {fieldErr.email && <span className="field-error">{fieldErr.email}</span>}
          </label>
          <label className="field">
            <span className="label">Password</span>
            <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!fieldErr.password} />
            {fieldErr.password && <span className="field-error">{fieldErr.password}</span>}
          </label>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? <span className="spinner" /> : <LogIn size={18} />}Sign in</button>
          <div className="demo-box">
            Demo passenger: <button type="button" onClick={() => { setEmail('demo.passenger@aerovista.local'); setPassword('demopass1234'); }}>demo.passenger@aerovista.local</button> / demopass1234
            <br />Admin: use ADMIN_EMAIL / ADMIN_PASSWORD from your .env.local
          </div>
        </form>
      </div>
    </main>
  );
}
export default function LoginPage() { return <Suspense><LoginInner /></Suspense>; }
