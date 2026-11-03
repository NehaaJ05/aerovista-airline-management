'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import PasswordInput from '@/components/PasswordInput';
import { Alert } from '@/components/ui';
import { useSession } from '@/components/Session';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/client';
import AuthArt from '@/components/AuthArt';

type F = { name: string; email: string; phone: string; password: string; confirm: string };

function validate(f: F) {
  const e: Partial<Record<keyof F, string>> = {};
  if (f.name.trim().length < 2) e.name = 'Please enter your full name';
  if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Enter a valid email address';
  if (f.phone.trim() && !/^[+\d][\d\s-]{6,}$/.test(f.phone.trim())) e.phone = 'Enter a valid phone number';
  if (f.password.length < 8) e.password = 'At least 8 characters';
  else if (!/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) e.password = 'Use at least one letter and one number';
  if (f.confirm !== f.password) e.confirm = 'Passwords do not match';
  return e;
}

function RegisterInner() {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const { refresh } = useSession();
  const toast = useToast();
  const [f, setF] = useState<F>({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [errs, setErrs] = useState<Partial<Record<keyof F, string>>>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof F) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate(f); setErrs(v); setErr('');
    if (Object.keys(v).length) return;
    setBusy(true);
    const r = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: f.name, email: f.email, phone: f.phone, password: f.password }) });
    setBusy(false);
    if (!r.ok) { setErr(r.data.error ?? 'Registration failed'); return; }
    await refresh();
    toast('success', 'Account created — you are signed in');
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/flights';
    router.push(safeNext);
    router.refresh();
  }

  const field = (k: keyof F, label: string, input: React.ReactNode, hint?: string) => (
    <label className="field">
      <span className="label">{label}</span>
      {input}
      {errs[k] ? <span className="field-error">{errs[k]}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );

  return (
    <main className="auth-wrap">
      <AuthArt title="Create your AeroVista account" text="Book in seconds, keep all your trips in one place and earn loyalty points on every flight." />
      <div className="auth-form-side">
        <form className="auth-card stack" onSubmit={submit} noValidate>
          <div>
            <h1>Create account</h1>
            <p className="text-2">Already have one? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Sign in</Link></p>
          </div>
          {err && <Alert kind="danger">{err}</Alert>}
          {field('name', 'Full name (as on ID)', <input className="input" autoComplete="name" value={f.name} onChange={set('name')} aria-invalid={!!errs.name} />)}
          {field('email', 'Email', <input className="input" type="email" autoComplete="email" value={f.email} onChange={set('email')} aria-invalid={!!errs.email} />)}
          {field('phone', 'Mobile number (optional)', <input className="input" type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} aria-invalid={!!errs.phone} placeholder="+91 98450 12345" />)}
          <div className="grid grid-2" style={{ gap: 12 }}>
            {field('password', 'Password', <PasswordInput autoComplete="new-password" value={f.password} onChange={set('password')} aria-invalid={!!errs.password} />, '8+ chars, a letter and a number')}
            {field('confirm', 'Confirm password', <PasswordInput autoComplete="new-password" value={f.confirm} onChange={set('confirm')} aria-invalid={!!errs.confirm} />)}
          </div>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? <span className="spinner" /> : <UserPlus size={18} />}Create account</button>
          <p className="xs muted" style={{ margin: 0 }}>Passwords are hashed with bcrypt. New accounts are always passengers.</p>
        </form>
      </div>
    </main>
  );
}
export default function RegisterPage() { return <Suspense><RegisterInner /></Suspense>; }
