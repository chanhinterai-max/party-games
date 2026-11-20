'use client';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { DRINK_CATEGORIES } from '@/lib/content';

// Admin-only: chicken-out odds and the hidden petted-animal rule. Never shown to players.
export default function OddsPanel() {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { api('/api/admin/chicken-odds').then(setD).catch((e) => setMsg(e.message)); }, []);
  if (!d) return <section className="panel"><h3>Chicken-out odds</h3><p className="count">{msg || 'Loading…'}</p></section>;
  const { odds } = d;
  // Legacy saved target (e.g. 'kitten' from v3-v5) stays selectable until changed.
  const targets = d.targets.some((t) => t.id === odds.rule.animal) ? d.targets : [...d.targets, { id: odds.rule.animal, label: `${odds.rule.animal} (legacy)` }];
  const set = (path, val) => {
    const o = structuredClone(odds);
    if (path[0] === 'normal') o.normal[path[1]] = val;
    else if (path[0] === 'rule') o.rule[path[1]] = val;
    else o.rule.odds[path[1]] = val;
    setD({ ...d, odds: o });
  };
  const sum = (t) => DRINK_CATEGORIES.reduce((a, c) => a + (Number(t[c.id]) || 0), 0);
  const table = (t, key) => (
    <div className="odds-grid">
      {DRINK_CATEGORIES.map((c) => (
        <label key={c.id}>{c.emoji} {c.name}
          <input className="input" type="number" min={0} max={100} name={`${key}-${c.id}`} value={t[c.id]} onChange={(e) => set([key, c.id], e.target.value === '' ? '' : Number(e.target.value))} />
        </label>
      ))}
      <span className={sum(t) === 100 ? 'ok' : 'error'}>Total {sum(t)}%</span>
    </div>
  );
  async function save() {
    setMsg('');
    try {
      const r = await api('/api/admin/chicken-odds', { method: 'PUT', body: { ...odds, petSeconds: d.petSeconds } });
      setD({ ...d, odds: r.odds, petSeconds: r.petSeconds });
      setMsg('Saved ✓');
    } catch (e) { setMsg(e.message); }
  }
  return (
    <section className="panel" data-section="odds">
      <h3>🐔 Chicken-out odds</h3>
      <div className="label">Normal odds</div>
      {table(odds.normal, 'normal')}
      <div className="label" style={{ marginTop: 14 }}>Hidden rule (secret, never shown to players)</div>
      <label className="toggle"><span>Rule enabled</span>
        <input type="checkbox" name="rule-enabled" checked={odds.rule.enabled} onChange={(e) => set(['rule', 'enabled'], e.target.checked)} />
      </label>
      <label className="field">When a running animal of this kind is being petted (the running animals are the players’ animals)
        <select className="input" name="rule-animal" value={odds.rule.animal} onChange={(e) => set(['rule', 'animal'], e.target.value)}>
          {targets.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </label>
      <label className="field">Petted duration (seconds, {d.petRange[0]}-{d.petRange[1]}): hearts show this long, and the rule only applies inside this window
        <input className="input" type="number" min={d.petRange[0]} max={d.petRange[1]} name="pet-seconds" value={d.petSeconds}
          onChange={(e) => setD({ ...d, petSeconds: e.target.value === '' ? '' : Number(e.target.value) })} />
      </label>
      <div className="label">…use these odds instead</div>
      {table(odds.rule.odds, 'ruleodds')}
      <button className="btn btn-primary" style={{ marginTop: 10 }} data-act="save-odds" onClick={save}>Save odds</button>
      {msg && <p className="count" data-odds-msg>{msg}</p>}
    </section>
  );
}
