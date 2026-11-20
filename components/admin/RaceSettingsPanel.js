'use client';
import { useEffect, useState } from 'react';
import { api } from '../api';

// v10 Admin-only: Animal Race tunables. Blank/default = the built-in value (identical to lib/race/config.js).
// Validated on the server; new values apply to the NEXT game started (sent with /api/race/start).
export default function RaceSettingsPanel() {
  const [d, setD] = useState(null); // { fields, tune }
  const [vals, setVals] = useState({});
  const [msg, setMsg] = useState('');
  const fill = (r) => { setD(r); setVals(Object.fromEntries(r.fields.map((f) => [f.key, r.tune[f.key] ?? f.def]))); };
  useEffect(() => { api('/api/admin/race-settings').then(fill).catch((e) => setMsg(e.message)); }, []);
  if (!d) return <section className="panel"><h3>🏁 Race tunables</h3><p className="count">{msg || 'Loading…'}</p></section>;
  const save = async (body, ok) => {
    setMsg('');
    try { fill(await api('/api/admin/race-settings', { method: 'PUT', body: { tune: body } })); setMsg(ok); } catch (e) { setMsg(e.message); }
  };
  const changed = d.fields.filter((f) => Number(vals[f.key]) !== f.def).length;
  return (
    <section className="panel" data-section="race-settings">
      <h3>🏁 Race tunables</h3>
      <p className="count">Same for every racer and role. Applies to the next game started. {changed ? `${changed} changed from default.` : 'All defaults.'}</p>
      <div className="tune-grid">
        {d.fields.map((f) => (
          <label key={f.key} className="tune-field" data-tune={f.key}>
            <span>{f.label} <small className="count">({f.min}–{f.max} {f.unit}; default {f.def})</small></span>
            <input className="input" type="number" inputMode="numeric" min={f.min} max={f.max} step={f.step} name={`race-${f.key}`} value={vals[f.key]}
              onChange={(e) => setVals({ ...vals, [f.key]: e.target.value === '' ? '' : Number(e.target.value) })} />
          </label>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn btn-primary" data-act="save-race-settings" onClick={() => save(vals, 'Saved ✓')}>Save race settings</button>
        <button className="btn btn-ghost" data-act="reset-race-settings" onClick={() => save({}, 'Reset to defaults ✓')}>Reset to defaults</button>
      </div>
      {msg && <p className="count" data-race-msg>{msg}</p>}
    </section>
  );
}
