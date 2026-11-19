'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { LEVELS } from '@/lib/content';

// Admin: manage the default WHO / WHAT / WHERE question bank (DB tables).
export default function BankPanel() {
  const [bank, setBank] = useState(null);
  const [tab, setTab] = useState('what');
  const [level, setLevel] = useState('adult');
  const [type, setType] = useState('dare');
  const [edit, setEdit] = useState(null); // { key, ...fields }
  const [add, setAdd] = useState({});
  const [msg, setMsg] = useState('');
  const load = useCallback(() => api('/api/admin/bank').then(setBank).catch((e) => setMsg(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function run(fn, ok) {
    setMsg('');
    try { await fn(); setMsg(ok); setEdit(null); await load(); } catch (e) { setMsg(e.message); }
  }
  const url = (kind, key) => `/api/admin/bank/${kind}/${encodeURIComponent(key)}`;
  const del = (kind, key, label) => confirm(`Delete "${label}"?`) && run(() => api(url(kind, key), { method: 'DELETE' }), 'Deleted ✓');
  const save = (kind, key, body) => run(() => api(url(kind, key), { method: 'PATCH', body }), 'Saved ✓');
  const create = (body) => run(async () => { await api('/api/admin/bank', { method: 'POST', body }); setAdd({}); }, 'Added ✓');

  if (!bank) return <section className="panel"><h3>Question bank</h3><p className="count">{msg || 'Loading…'}</p></section>;
  const whats = bank.what[level][type];
  return (
    <section className="panel" data-section="bank">
      <h3>Question bank (default WHO / WHAT / WHERE)</h3>
      <p className="count">New rooms use this bank. WHAT uses <code>{'{who}'}</code> and (Adult dares only) <code>{'{where}'}</code>.</p>
      <div className="tabs">
        {['who', 'what', 'where'].map((k) => <button key={k} aria-pressed={tab === k} data-bank-tab={k} onClick={() => { setTab(k); setEdit(null); }}>{k.toUpperCase()}</button>)}
      </div>
      {msg && <p className="count" data-bank-msg>{msg}</p>}

      {tab === 'who' && (
        <>
          <ul className="history">
            {bank.who.map((w) => (
              <li key={w.id} data-bank-item={w.id}>
                {edit?.key === w.id ? (
                  <div className="row">
                    <input className="input" value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} />
                    <input className="input" value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
                    <button className="small-btn good" onClick={() => save('who', w.id, { label: edit.label, text: edit.text })}>Save</button>
                  </div>
                ) : (
                  <div className="row" style={{ alignItems: 'center' }}>
                    <span><strong>{w.label}</strong> <span className="count">→ “{w.text}”</span></span>
                    <span style={{ whiteSpace: 'nowrap' }}>
                      <button className="small-btn" onClick={() => setEdit({ key: w.id, label: w.label, text: w.text })}>Edit</button>{' '}
                      <button className="small-btn danger" onClick={() => del('who', w.id, w.label)}>✕</button>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="row" style={{ marginTop: 8 }}>
            <input className="input" placeholder="Label (e.g. Tallest)" name="who-label" value={add.label || ''} onChange={(e) => setAdd({ ...add, label: e.target.value })} />
            <input className="input" placeholder="In text (e.g. the tallest player)" name="who-text" value={add.text || ''} onChange={(e) => setAdd({ ...add, text: e.target.value })} />
            <button className="small-btn good" data-act="add-who" onClick={() => create({ kind: 'who', label: add.label, text: add.text })}>Add</button>
          </div>
        </>
      )}

      {tab === 'what' && (
        <>
          <div className="row">
            <select className="input" value={level} onChange={(e) => setLevel(e.target.value)} name="bank-level">
              {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.emoji} {l.name}</option>)}
            </select>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)} name="bank-type">
              <option value="truth">Truth</option><option value="dare">Dare</option>
            </select>
          </div>
          <p className="count">{whats.length} entries</p>
          <ul className="history" style={{ maxHeight: 420, overflow: 'auto' }}>
            {whats.map((w) => (
              <li key={w.id} data-bank-item={w.id}>
                {edit?.key === w.id ? (
                  <>
                    <textarea className="input" style={{ width: '100%' }} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
                    <button className="small-btn good" onClick={() => save('what', w.id, { text: edit.text })}>Save</button>{' '}
                    <button className="small-btn" onClick={() => setEdit(null)}>Cancel</button>
                  </>
                ) : (
                  <div className="row" style={{ alignItems: 'center' }}>
                    <span>{w.text}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>
                      <button className="small-btn" onClick={() => setEdit({ key: w.id, text: w.text })}>Edit</button>{' '}
                      <button className="small-btn danger" onClick={() => del('what', w.id, w.text)}>✕</button>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <textarea className="input" style={{ width: '100%', marginTop: 8 }} name="what-text" placeholder={type === 'dare' ? 'e.g. Give {who} a high-five' : 'e.g. What would {who} never guess about you?'}
            value={add.text || ''} onChange={(e) => setAdd({ ...add, text: e.target.value })} />
          <button className="small-btn good" data-act="add-what" onClick={() => create({ kind: 'what', level, type, text: add.text })}>Add {type}</button>
        </>
      )}

      {tab === 'where' && (
        <>
          <div className="chips">
            {bank.where.map((w) => (
              <span key={w} className="chip where" data-bank-item={w}>
                {edit?.key === w ? (
                  <>
                    <input className="input" style={{ minHeight: 30, width: 110 }} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                    <button className="small-btn good" onClick={() => save('where', w, { name: edit.name })}>✓</button>
                  </>
                ) : (
                  <>
                    <span onClick={() => setEdit({ key: w, name: w })}>{w}</span>
                    <button className="x" aria-label={`Delete ${w}`} onClick={() => del('where', w, w)}>✕</button>
                  </>
                )}
              </span>
            ))}
          </div>
          <p className="count">Tap a body part to rename it. Private/intimate parts are rejected.</p>
          <div className="row">
            <input className="input" placeholder="e.g. wrist" name="where-name" value={add.name || ''} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
            <button className="small-btn good" data-act="add-where" onClick={() => create({ kind: 'where', name: add.name })}>Add</button>
          </div>
        </>
      )}
    </section>
  );
}
