'use client';
import { useCallback, useEffect, useState } from 'react';
import { Database, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import AdminTabs from '@/components/AdminTabs';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Alert, EmptyState } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/client';
import { fmtDateTime } from '@/lib/format';

type G = { id?: string; airport_code: string; city: string; title: string; summary: string; highlights: string[]; best_time: string; tags: string[]; updated_at?: string; embedding_dims?: number; score?: number };
const blank: G = { airport_code: '', city: '', title: '', summary: '', highlights: [], best_time: '', tags: [] };

export default function AdminGuides() {
  const toast = useToast();
  const [guides, setGuides] = useState<G[] | null>(null);
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState<G | null>(null);
  const [hl, setHl] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<G | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ engine: string; guides: G[] } | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ guides: G[] }>('/api/admin/guides');
    if (r.ok) { setGuides(r.data.guides); setErr(''); } else { setGuides([]); setErr(r.data.error ?? 'MongoDB unavailable'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function open(g: G) { setEdit({ ...g }); setHl(g.highlights.join('\n')); setTags(g.tags.join(', ')); }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!edit) return; setBusy(true);
    const body = { ...edit, airport_code: edit.airport_code.toUpperCase(), highlights: hl.split('\n').map((s) => s.trim()).filter(Boolean), tags: tags.split(',').map((s) => s.trim()).filter(Boolean) };
    delete (body as any).id; delete (body as any).updated_at; delete (body as any).embedding_dims; delete (body as any).created_at; delete (body as any).updated_by;
    const r = await api(edit.id ? `/api/admin/guides/${edit.id}` : '/api/admin/guides', { method: edit.id ? 'PUT' : 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) { toast('success', edit.id ? 'Guide updated (embedding recomputed)' : 'Guide created'); setEdit(null); load(); } else toast('error', r.data.error ?? 'Save failed');
  }
  async function remove() {
    if (!del?.id) return; setBusy(true);
    const r = await api(`/api/admin/guides/${del.id}`, { method: 'DELETE' });
    setBusy(false); setDel(null);
    if (r.ok) { toast('success', 'Guide deleted'); load(); } else toast('error', r.data.error ?? 'Delete failed');
  }
  async function search(e: React.FormEvent) {
    e.preventDefault();
    const r = await api<{ engine: string; guides: G[] }>(`/api/guides?q=${encodeURIComponent(q)}`);
    if (r.ok) setHits(r.data); else toast('error', r.data.error ?? 'Search failed');
  }

  return (
    <main className="page">
      <div className="container">
        <div className="page-head">
          <div><div className="eyebrow">NoSQL · MongoDB</div><h1>Destination guides</h1><p>Collection <span className="code-pill">destination_guides</span> with a $jsonSchema validator and 128-dim embeddings for vector search.</p></div>
          <button className="btn btn-primary" onClick={() => open(blank)} disabled={!!err}><Plus size={16} />New guide</button>
        </div>
        <AdminTabs />
        {err && <Alert kind="warning">{err}</Alert>}

        {!err && (
          <form className="card card-pad" style={{ marginBottom: 18 }} onSubmit={search}>
            <div className="row row-wrap" style={{ gap: 10 }}>
              <input className="input" style={{ flex: 1, minWidth: 220 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Vector search test: e.g. heritage and street food" aria-label="Vector search" />
              <button className="btn btn-secondary" disabled={q.trim().length < 2}><Sparkles size={16} />Run vector search</button>
            </div>
            {hits && (
              <div style={{ marginTop: 12 }} className="small">
                <span className="muted">Engine: <span className="code-pill">{hits.engine}</span> · </span>
                {hits.guides.length === 0 ? 'no match' : hits.guides.map((g) => <span key={g.id} className="badge badge-sky" style={{ marginRight: 6 }}>{g.city} · {Math.round((g.score ?? 0) * 100)}%</span>)}
              </div>
            )}
          </form>
        )}

        <section className="card">
          <div className="card-head"><div><h2>Documents</h2><p>{guides?.length ?? 0} guides</p></div></div>
          {guides === null ? <div className="card-body"><div className="skeleton" style={{ height: 160 }} /></div> : guides.length === 0 ? (
            <EmptyState icon={<Database />} title="No guides yet">Run <span className="code-pill">npm run mongo:seed</span> or create one.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Airport</th><th>Title</th><th>Tags</th><th className="num">Embedding</th><th>Updated</th><th></th></tr></thead>
                <tbody>{guides.map((g) => (
                  <tr key={g.id}>
                    <td><strong>{g.airport_code}</strong><div className="xs muted">{g.city}</div></td>
                    <td style={{ whiteSpace: 'normal', minWidth: 240 }}>{g.title}</td>
                    <td><div className="row row-wrap" style={{ gap: 4 }}>{g.tags.map((t) => <span key={t} className="badge">{t}</span>)}</div></td>
                    <td className="num">{g.embedding_dims} dims</td>
                    <td className="tnum">{g.updated_at ? fmtDateTime(String(g.updated_at).replace('T', ' ').slice(0, 19)) : '—'}</td>
                    <td><div className="row" style={{ gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => open(g)}><Pencil size={14} />Edit</button>
                      <button className="btn btn-danger-outline btn-sm" onClick={() => setDel(g)}><Trash2 size={14} />Delete</button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        {edit && (
          <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setEdit(null); }}>
            <form className="dialog stack" style={{ maxWidth: 620 }} onSubmit={save}>
              <h2>{edit.id ? `Edit ${edit.city} guide` : 'New destination guide'}</h2>
              <div className="grid grid-2" style={{ gap: 12 }}>
                <label className="field"><span className="label">Airport code</span><input className="input" maxLength={3} required value={edit.airport_code} onChange={(e) => setEdit({ ...edit, airport_code: e.target.value.toUpperCase() })} /></label>
                <label className="field"><span className="label">City</span><input className="input" required value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></label>
              </div>
              <label className="field"><span className="label">Title</span><input className="input" required value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
              <label className="field"><span className="label">Summary</span><textarea className="textarea" required minLength={20} value={edit.summary} onChange={(e) => setEdit({ ...edit, summary: e.target.value })} /></label>
              <label className="field"><span className="label">Highlights (one per line)</span><textarea className="textarea" value={hl} onChange={(e) => setHl(e.target.value)} /></label>
              <div className="grid grid-2" style={{ gap: 12 }}>
                <label className="field"><span className="label">Tags (comma separated)</span><input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="food, history" /></label>
                <label className="field"><span className="label">Best time to visit</span><input className="input" value={edit.best_time} onChange={(e) => setEdit({ ...edit, best_time: e.target.value })} /></label>
              </div>
              <p className="xs muted" style={{ margin: 0 }}>The embedding is recomputed on the server from the title, summary, highlights and tags.</p>
              <div className="dialog-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEdit(null)} disabled={busy}>Cancel</button>
                <button className="btn btn-primary" disabled={busy}>{busy && <span className="spinner" />}{edit.id ? 'Save changes' : 'Create guide'}</button>
              </div>
            </form>
          </div>
        )}
        <ConfirmDialog open={!!del} danger busy={busy} title={`Delete the ${del?.city} guide?`} confirmLabel="Delete" cancelLabel="Keep"
          onConfirm={remove} onClose={() => setDel(null)}>
          <p>This removes the document from MongoDB. Flight data in MySQL is not affected.</p>
        </ConfirmDialog>
      </div>
    </main>
  );
}
