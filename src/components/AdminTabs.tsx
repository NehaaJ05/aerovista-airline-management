'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, BookOpen, PlaneTakeoff, Ticket } from 'lucide-react';

export default function AdminTabs() {
  const path = usePathname();
  const tabs = [
    ['/admin', 'Revenue & occupancy', BarChart3],
    ['/admin/flights', 'Flights & fares', PlaneTakeoff],
    ['/admin/bookings', 'Bookings', Ticket],
    ['/admin/guides', 'Destination guides (MongoDB)', BookOpen],
  ] as const;
  return (
    <nav className="admin-tabs" aria-label="Admin sections" style={{ marginBottom: 22 }}>
      {tabs.map(([href, label, Icon]) => (
        <Link key={href} href={href} className={`admin-tab ${path === href ? 'active' : ''}`}><Icon />{label}</Link>
      ))}
    </nav>
  );
}
