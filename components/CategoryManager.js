'use client';
import { LEVELS } from '@/lib/content';
import { useState } from 'react';
import { api } from './api';

const empty = { id: null, name: '', who: { mode: 'female' }, what: [], where: [] };
const short = (t) => t.replaceAll('{who}', 'WHO').replaceAll('{where}', 'WHERE');

// Per-user saved filters for the dare palette (stored in user_categories).
export default function CategoryManager({ cats, reload, palette, level }) {
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');
  const generic = palette.who.filter((w) => w.kind === 'generic');
  const players = palette.who.filter((w) => w.kind === 'player');

  const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const hasWho = (kind, value) => (form.who.values || []).some((v) => v.kind === kind && v.value === value);
  const toggleWho = (kind, value) => {
    const vals = form.who.values || [];
    setForm({ ...form, who: { mode: 'custom', values: hasWho(kind, value) ? vals.filter((v) => !(v.kind === kind && v.value === value)) : [...vals, { kind, value }] } });
  };

  async function save() {
    setMsg('');
    try {
      const body = { name: form.name, who: form.who, what: form.what, where: form.where };
      if (form.id) await api(`/api/me/categories/${form.id}`, { method: 'PATCH', body });
      else await api('/api/me/categories', { method: 'POST', body });
      setForm(null);
      setMsg('Saved ✓');
      reload();
    } catch (e) { setMsg(e.message); }
  }
  async function remove(c) {
    if (!confirm(`Delete category "${c.name}"?`)) return;
    try { await api(`/api/me/categories/${c.id}`, { method: 'DELETE' }); reload(); } catch (e) { setMsg(e.message); }
  }

  return (
    <details className="panel" data-section="categories">
      <summary style={{ fontWeight: 800 }}>⚡ Manage my quick categories ({cats.length})</summary>
      {msg && <p className="count">{msg}</p>}
      {!form && (
        <>
          <ul className="history" style={{ marginTop: 10 }}>
            {cats.map((c) => (
              <li key={c.id} data-cat={c.name}>
                <strong>{c.name}</strong>
                <div className="meta">WHO: {c.who.mode === 'custom' ? `${(c.who.values || []).length} picked` : `all ${c.who.mode === 'all' ? '' : c.who.mode + ' '}players`} · WHAT: {c.what.length} · WHERE: {c.where.join(', ') || 'none'}</div>
                <div className="row" style={{ marginTop: 6 }}>
                  <button className="small-btn" onClick={() => setForm({ ...c })}>Edit</button>
                  <button className="small-btn danger" onClick={() => remove(c)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
          <button className="btn btn-ghost" style={{ marginTop: 10 }} data-act="new-cat" onClick={() => setForm({ ...empty })}>＋ New category</button>
        </>
      )}
      {form && (
        <div style={{ marginTop: 10 }}>
          <input className="input" style={{ width: '100%' }} placeholder="Category name" value={form.name} maxLength={40} name="cat-name" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="label" style={{ marginTop: 10 }}>WHO</div>
          <select className="input" style={{ width: '100%' }} value={form.who.mode} name="cat-who-mode"
            onChange={(e) => setForm({ ...form, who: e.target.value === 'custom' ? { mode: 'custom', values: [] } : { mode: e.target.value } })}>
            <option value="female">All female players (dynamic)</option>
            <option value="male">All male players (dynamic)</option>
            <option value="all">All players + targets</option>
            <option value="custom">Pick specific…</option>
          </select>
          {form.who.mode === 'custom' && (
            <div className="checks">
              <label><input type="checkbox" checked={hasWho('gender', 'female')} onChange={() => toggleWho('gender', 'female')} />All female players</label>
              <label><input type="checkbox" checked={hasWho('gender', 'male')} onChange={() => toggleWho('gender', 'male')} />All male players</label>
              {players.map((w) => <label key={w.value}><input type="checkbox" checked={hasWho('player', w.value)} onChange={() => toggleWho('player', w.value)} />{w.label}</label>)}
              {generic.map((w) => <label key={w.value}><input type="checkbox" checked={hasWho('generic', w.value)} onChange={() => toggleWho('generic', w.value)} />{w.label}</label>)}
            </div>
          )}
          <div className="label" style={{ marginTop: 10 }}>WHAT (dares at {LEVELS.find((l) => l.id === level)?.name || level} level)</div>
          <div className="checks">
            {palette.what.dare.map((w) => <label key={w.id}><input type="checkbox" checked={form.what.includes(w.id)} onChange={() => setForm({ ...form, what: toggle(form.what, w.id) })} />{short(w.text)}</label>)}
          </div>
          <div className="label" style={{ marginTop: 10 }}>WHERE</div>
          <div className="checks">
            {palette.where.map((w) => <label key={w}><input type="checkbox" checked={form.where.includes(w)} onChange={() => setForm({ ...form, where: toggle(form.where, w) })} />{w}</label>)}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn btn-primary" data-act="save-cat" onClick={save}>Save category</button>
            <button className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      )}
    </details>
  );
}
