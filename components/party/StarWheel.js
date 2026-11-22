'use client';
import { useEffect, useRef, useState } from 'react';
import { Face } from './pics'; // v14: the host's picture next to their slice

// v12 🎡 next-Party-Star wheel. The SERVER already picked the winner (crypto, weighted); this only animates:
// one CSS transform transition on a single SVG (GPU-composited, no per-frame JS) landing inside the winner's slice.
const COLORS = ['#ff5fcf', '#9b5cff', '#3ad1ff', '#ffb340', '#7ee081', '#ff6b6b', '#ffd166', '#4dd4ac', '#c77dff', '#f78c6b'];
const TAG = { dare1: '🔥', dare2: '🔥', dare3: '🔥', chicken: '🐔', place1: '🥇', place2: '🥈', place3: '🥉' };
export default function StarWheel({ wheel, label = 'Party Star', onDone }) {
  const [spun, setSpun] = useState(false);
  const [done, setDone] = useState(false);
  const ref = useRef(null);
  const slices = wheel?.slices || [];
  const total = slices.reduce((a, s) => a + s.pct, 0) || 1;
  let acc = 0;
  const arcs = slices.map((s, i) => { const a0 = (acc / total) * 360; acc += s.pct; return { ...s, a0, a1: (acc / total) * 360, color: COLORS[i % COLORS.length] }; });
  const win = arcs.find((a) => a.player === wheel?.winner) || arcs[0];
  // land at a random point inside the winner's slice (pointer at the top): rotate so that angle ends at 0°
  const target = useRef(null);
  if (win && target.current === null) { const inside = win.a0 + (win.a1 - win.a0) * (0.2 + Math.random() * 0.6); target.current = 360 * 6 - inside; }
  useEffect(() => {
    if (!win) return undefined;
    const t = setTimeout(() => setSpun(true), 400);
    return () => clearTimeout(t);
  }, [win]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!win) return null;
  const R = 100;
  const pt = (a, r = R) => [R + r * Math.sin((a * Math.PI) / 180), R - r * Math.cos((a * Math.PI) / 180)];
  return (
    <section className="star-wheel" data-star-wheel data-winner={wheel.winner} data-done={done ? '1' : '0'}>
      <h3>🎡 Who’s the next ⭐ {label}?</h3>
      <div className="wheel-box">
        <div className="wheel-pointer" aria-hidden="true">▼</div>
        <svg ref={ref} viewBox="0 0 200 200" className="wheel-svg" style={{ transform: `rotate(${spun ? target.current : 0}deg)` }}
          onTransitionEnd={() => { setDone(true); onDone?.(wheel.winner); }} aria-hidden="true">
          {arcs.map((a) => {
            const [x0, y0] = pt(a.a0), [x1, y1] = pt(a.a1); const large = a.a1 - a.a0 > 180 ? 1 : 0;
            const mid = (a.a0 + a.a1) / 2; const [tx, ty] = pt(mid, 62);
            const path = arcs.length === 1 ? `M ${R} 0 A ${R} ${R} 0 1 1 ${R - 0.01} 0 Z` : `M ${R} ${R} L ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`;
            return (
              <g key={a.player}>
                <path d={path} fill={a.color} stroke="#0b0614" strokeWidth="1.5" />
                <text x={tx} y={ty} transform={`rotate(${mid} ${tx} ${ty})`} textAnchor="middle" dominantBaseline="middle" className="wheel-name">{a.player.slice(0, 9)}</text>
              </g>
            );
          })}
          <circle cx={R} cy={R} r="14" fill="#0b0614" stroke="#ffffff55" strokeWidth="2" />
        </svg>
      </div>
      <ul className="wheel-legend">
        {arcs.map((a) => <li key={a.player} data-slice={a.player} data-pct={a.pct}><i style={{ background: a.color }} /><Face name={a.player} emoji={null} size={18} className="wf" />{a.player} <small>{Math.round(a.pct)}%{a.tags.map((t) => TAG[t]).join('')}</small></li>)}
      </ul>
      <p className={`wheel-result ${done ? 'show' : ''}`} data-wheel-result role="status">{done ? <>⭐ Next {label}: <b><Face name={wheel.winner} emoji={null} size={22} className="wf" />{wheel.winner}</b></> : 'Spinning…'}</p>
      <p className="count">🔥 most dares done = bigger slice · 🐔 most chicken-outs = smallest · 🥇🥈🥉 podium = bigger slice</p>
    </section>
  );
}
