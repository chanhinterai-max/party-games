'use client';
import { useEffect, useState } from 'react';
import { api } from '../api';

// Admin-only: how often a surprise card appears after a finished turn (server-enforced).
export default function SurpriseRatePanel() {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { api('/api/admin/surprise-rate').then(setD).catch((e) => setMsg(e.message)); }, []);
  if (!d) return <section className="panel"><h3>✨ Surprise rate</h3><p className="count">{msg || 'Loading…'}</p></section>;
  async function save() {
    setMsg('');
    try { const r = await api('/api/admin/surprise-rate', { method: 'PUT', body: { rate: d.rate } }); setD({ ...d, rate: r.rate }); setMsg('Saved ✓'); }
    catch (e) { setMsg(e.message); }
  }
  return (
    <section className="panel" data-section="surprise-rate">
      <h3>✨ Surprise cards</h3>
      <label className="field">Chance of a surprise card after each turn (%, {d.range[0]}-{d.range[1]}; default 10)
        <input className="input" type="number" min={d.range[0]} max={d.range[1]} name="surprise-rate" value={d.rate}
          onChange={(e) => setD({ ...d, rate: e.target.value === '' ? '' : Number(e.target.value) })} />
      </label>
      <button className="btn btn-primary" style={{ marginTop: 10 }} data-act="save-surprise-rate" onClick={save}>Save rate</button>
      {msg && <p className="count" data-rate-msg>{msg}</p>}
    </section>
  );
}
