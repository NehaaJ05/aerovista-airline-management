'use client';
import { ShieldCheck, Plane, BarChart3 } from 'lucide-react';

export default function AuthArt({ title, text }: { title: string; text: string }) {
  return (
    <div className="auth-art">
      <div className="eyebrow" style={{ color: 'var(--sky-300)' }}>AeroVista</div>
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      <ul className="benefits" style={{ color: '#c3d3e8' }}>
        <li style={{ color: '#c3d3e8' }}><Plane />22 daily departures across 6 cities</li>
        <li style={{ color: '#c3d3e8' }}><ShieldCheck />Refund rules shown before you cancel</li>
        <li style={{ color: '#c3d3e8' }}><BarChart3 />Live revenue analytics for airline staff</li>
      </ul>
    </div>
  );
}

