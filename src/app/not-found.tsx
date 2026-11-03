import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="page"><div className="container" style={{ maxWidth: 560, textAlign: 'center', paddingTop: 40 }}>
      <div className="eyebrow">Error 404</div><h1>This page has flown away</h1>
      <p className="text-2">The page you’re looking for doesn’t exist.</p>
      <Link href="/" className="btn btn-primary">Back to home</Link>
    </div></main>
  );
}
