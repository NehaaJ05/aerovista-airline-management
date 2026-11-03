import type { Metadata } from 'next';
import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';
import './globals.css';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { SessionProvider } from '@/components/Session';
import { ToastProvider } from '@/components/Toast';
import { Logo } from '@/components/ui';

export const metadata: Metadata = {
  title: 'AeroVista — Book flights across India',
  description: 'AeroVista airline booking and revenue intelligence system',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <ToastProvider>
            <Nav />
            {children}
            <footer className="footer">
              <div className="container footer-inner">
                <Link href="/" className="brand"><span className="brand-mark"><Logo size={16} /></span>AeroVista</Link>
                <span>Payments are simulated — no real money is charged. DBMS mini-project, PES University.</span>
                <span className="row" style={{ gap: 16 }}><Link href="/flights">Flights</Link><Link href="/api/health">System status</Link></span>
              </div>
            </footer>
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
