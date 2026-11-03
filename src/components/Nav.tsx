'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { BarChart3, LogOut, Menu, Plane, Ticket, X } from 'lucide-react';
import { useSession } from './Session';
import { Logo } from './ui';
import { api } from '@/lib/client';

export default function Nav() {
  const { me, loaded, refresh } = useSession();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    await refresh();
    router.push('/');
    router.refresh();
  }
  const link = (href: string, label: string, Icon: typeof Plane) => (
    <Link href={href} className={`nav-link ${path === href || (href !== '/' && path.startsWith(href)) ? 'active' : ''}`}>
      <Icon aria-hidden />{label}
    </Link>
  );
  const initials = (me?.name ?? '').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <nav className={`nav ${open ? 'open' : ''}`} aria-label="Main">
      <div className="container nav-inner">
        <Link href="/" className="brand" aria-label="AeroVista home">
          <span className="brand-mark"><Logo size={19} /></span>
          <span>AeroVista<small>Airlines</small></span>
        </Link>
        <button className="menu-btn" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <X /> : <Menu />}
        </button>
        <div className="nav-collapse">
          <div className="nav-links">
            {link('/flights', 'Book a flight', Plane)}
            {me && me.role === 'PASSENGER' && link('/bookings', 'My trips', Ticket)}
            {me?.role === 'ADMIN' && link('/admin', 'Revenue dashboard', BarChart3)}
          </div>
          <div className="nav-right">
            {!loaded ? null : me ? (
              <>
                <Link href="/profile" className="user-chip" title={me.email}>
                  <span className="avatar">{initials || 'U'}</span>
                  <span>{me.name.split(' ')[0]}</span>
                  {me.role === 'ADMIN' && <span className="role-tag">ADMIN</span>}
                </Link>
                <button className="btn btn-secondary btn-sm" onClick={logout}><LogOut size={15} />Sign out</button>
              </>
            ) : (
              <>
                <Link href="/login" className="btn btn-secondary btn-sm">Sign in</Link>
                <Link href="/register" className="btn btn-accent btn-sm">Create account</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
