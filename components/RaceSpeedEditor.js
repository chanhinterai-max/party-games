'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from './api';

// v10: Animal Race speed per animal as a range slider (80–120 %). Saves GLOBALLY (PATCH /api/surprises/:id,
// clamped server-side to 80–120). Used on /room (advanced users' landing page), inside the pool editor and in the
// admin "Game settings" Race card. Pass `pool` to reuse an already-loaded pool; otherwise it loads on first open.
const MIN = 80, MAX = 120, STEP = 1;

function SpeedRow({ a, onSaved }) {
  const [v, setV] = useState(a.speed ?? 100);
  const [state, setState] = useState('');
  const timer = useRef(0);
  useEffect(() => setV(a.speed ?? 100), [a.speed]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const save = (val) => {
    clearTimeout(timer.current);
    setState('…');
    timer.current = setTimeout(async () => {
      try { const r = await api(`/api/surprises/${a.id}`, { method: 'PATCH', body: { speed: val } }); setState('✓'); onSaved?.(r?.animal); }
      catch (e) { setState('✕'); setV(a.speed ?? 100); }
    }, 350);
  };
  return (
    <li className="speed-row" data-speed-animal={a.id}>
      <span className="speed-name">{a.emoji} {a.name}</span>
      <input type="range" min={MIN} max={MAX} step={STEP} value={v} name="race-speed" aria-label={`${a.name} race speed`}
        onChange={(e) => { const n = Number(e.target.value); setV(n); save(n); }} />
      <output className={`speed-val ${v !== 100 ? 'off' : ''}`} data-speed-val>{v}%</output>
      <span className="speed-state" aria-live="polite">{state}</span>
    </li>
  );
}

export default function RaceSpeedEditor({ pool: given, open = false }) {
  const [pool, setPool] = useState(given || null);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (given) setPool(given); }, [given]);
  const load = () => api('/api/surprises').then((d) => setPool(d.pool)).catch((e) => setMsg(e.message));
  useEffect(() => { if (open && !given && !pool) load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const onSaved = (an) => { if (an) setPool((p) => p.map((x) => (x.id === an.id ? { ...x, speed: an.speed } : x))); };
  return (
    <details className="panel race-speeds" data-section="race-speeds" open={open} onToggle={(e) => { if (e.currentTarget.open && !pool && !given) load(); }}>
      <summary style={{ fontWeight: 800 }}>⚡ Animal Race speeds (global)</summary>
      <p className="count">Drag to set how fast each animal runs as a racer: 80–120 % (100 % = normal). Saves for every game automatically. The hunters are not animals and are the same for everyone.</p>
      {!pool ? <p className="count">{msg || 'Loading…'}</p> : ['predator', 'prey'].map((role) => (
        <div key={role}>
          <div className="label" style={{ marginTop: 10 }}>{role === 'predator' ? '🦷 Predators' : '🌿 Prey'}</div>
          <ul className="speed-list">{pool.filter((a) => a.role === role).map((a) => <SpeedRow key={a.id} a={a} onSaved={onSaved} />)}</ul>
        </div>
      ))}
    </details>
  );
}
