'use client';
import { useEffect, useRef, useState } from 'react';
import PlayerTag from '@/components/party/PlayerTag';

// Dare Chooser: everyone puts a finger on the pad; after 2 s still, one finger is picked at random.
// Fallback (no multi-touch): tap names to join, then Pick.
const HOLD_MS = 2000;
export default function Chooser({ players, animals, genders }) { // v13: names shown as animal emoji + name
  const [touches, setTouches] = useState({}); // pointerId -> {x, y}
  const [chosen, setChosen] = useState(null); // pointerId (string) or { name }
  const [joined, setJoined] = useState([]);
  const timer = useRef();
  const pad = useRef();
  const ids = Object.keys(touches);
  useEffect(() => {
    clearTimeout(timer.current);
    if (chosen || ids.length < 2) return undefined;
    timer.current = setTimeout(() => {
      const cur = Object.keys(touches);
      if (cur.length >= 2) {
        setChosen(cur[Math.floor(Math.random() * cur.length)]);
        try { navigator.vibrate?.(150); } catch {}
      }
    }, HOLD_MS);
    return () => clearTimeout(timer.current);
  }, [ids.length, chosen]); // eslint-disable-line react-hooks/exhaustive-deps
  const pos = (e) => {
    const r = pad.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e) => {
    if (chosen) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setTouches((t) => ({ ...t, [e.pointerId]: pos(e) }));
  };
  const move = (e) => { if (!chosen && touches[e.pointerId]) setTouches((t) => ({ ...t, [e.pointerId]: pos(e) })); };
  const up = (e) => { if (!chosen) setTouches((t) => { const n = { ...t }; delete n[e.pointerId]; return n; }); };
  const reset = () => { setTouches({}); setChosen(null); setJoined([]); };
  const pickJoined = () => joined.length >= 2 && setChosen({ name: joined[Math.floor(Math.random() * joined.length)] });
  return (
    <div className="chooser">
      <div ref={pad} className="chooser-pad" data-touch data-chooser-pad onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {ids.length === 0 && !chosen && <span className="count">Everyone: put one finger here ☝️</span>}
        {ids.length === 1 && !chosen && <span className="count">Waiting for more fingers…</span>}
        {ids.length >= 2 && !chosen && <span className="count">Hold still…</span>}
        {ids.map((id) => (
          <i key={id} className={`finger ${chosen === id ? 'win' : chosen ? 'lose' : ''}`} style={{ transform: `translate(${touches[id].x - 36}px, ${touches[id].y - 36}px)` }} />
        ))}
      </div>
      {chosen && <p className="chosen" data-chosen>{typeof chosen === 'object' ? <>👉 <PlayerTag name={chosen.name} animals={animals} genders={genders} /> is the chosen one!</> : '👉 The glowing finger is the chosen one!'}</p>}
      <div className="label" style={{ marginTop: 10 }}>No multi-touch? Tap to join</div>
      <div className="chips">
        {players.map((p) => (
          <button type="button" key={p} className="chip" aria-pressed={joined.includes(p)} data-join={p} disabled={!!chosen}
            onClick={() => setJoined((j) => (j.includes(p) ? j.filter((x) => x !== p) : [...j, p]))}>{joined.includes(p) ? '✓ ' : ''}<PlayerTag name={p} animals={animals} genders={genders} /></button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="small-btn good" data-act="chooser-pick" disabled={!!chosen || joined.length < 2} onClick={pickJoined}>Pick! 🎯</button>
        <button type="button" className="small-btn" data-act="chooser-reset" onClick={reset}>Reset</button>
      </div>
    </div>
  );
}
