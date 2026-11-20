'use client';
import { useEffect, useRef, useState } from 'react';
import { RACE } from '@/lib/race/config';
import { layout, lanePoint } from '@/lib/race/geometry';
import { createRace, step, tap, rank, isMoving } from '@/lib/race/engine';

// ANIMAL RACE BOARD: fullscreen, phone lying flat, one lane + one big tap button per corner, goal in the centre.
// One requestAnimationFrame loop writes transforms/attributes directly (no React renders during a race,
// no server calls). Up to 4 simultaneous touches via pointer events (touch-action: none).
const PEN_BADGE = { eaten: ['💥', '👻'], feast: ['😋', '💤'], caught: ['😱', '😵'], distracted: ['🥰', '💕'] };
const SAFE = { prey: '🌳', predator: '💤', human: '' };
const set = (el, k, v) => { if (el && el.dataset[k] !== v) el.dataset[k] = v; };
const txt = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };

export default function RaceBoard({ racers, wild, label, onDone, rng }) {
  const boardRef = useRef(null);
  const [lay, setLay] = useState(null);
  const [stage, setStage] = useState('ready'); // ready | countdown | race | finish
  const els = useRef({ racer: [], badge: [], body: [], wild: [], wildBadge: [], btn: [], cd: null, flash: null });
  const raceRef = useRef(null);

  useEffect(() => {
    const b = boardRef.current;
    setLay(layout(b.clientWidth, b.clientHeight, racers.length));
    const block = (e) => e.preventDefault();
    b.addEventListener('touchmove', block, { passive: false });
    b.addEventListener('contextmenu', block);
    b.addEventListener('gesturestart', block);
    document.documentElement.classList.add('race-lock');
    return () => { b.removeEventListener('touchmove', block); b.removeEventListener('contextmenu', block); b.removeEventListener('gesturestart', block); document.documentElement.classList.remove('race-lock'); };
  }, [racers.length]);

  // Countdown + race loop
  useEffect(() => {
    if (!lay || (stage !== 'countdown')) return undefined;
    const race = createRace({ racers, lay, rng: rng || Math.random, wild });
    raceRef.current = race;
    if (typeof window !== 'undefined') window.__race = race; // read-only test hook
    const E = els.current;
    const c = RACE;
    const t0 = performance.now() + c.countdownStepMs * 3; // GO time
    let raf = 0, finishedAt = 0, done = false;
    const onDown = (e) => {
      e.preventDefault();
      const i = Number(e.currentTarget.dataset.tap);
      const now = performance.now();
      if (now < t0) return;
      if (tap(race, i, now - t0)) { e.currentTarget.dataset.hit = '1'; e.currentTarget._hit = now; }
    };
    E.btn.forEach((b) => b?.addEventListener('pointerdown', onDown, { passive: false }));
    const frame = (nowAbs) => {
      raf = requestAnimationFrame(frame);
      const now = nowAbs - t0;
      if (now < 0) { txt(E.cd, String(Math.ceil(-now / c.countdownStepMs))); set(E.cd, 'show', '1'); return; }
      if (now < 500) { txt(E.cd, 'GO!'); set(E.cd, 'show', '1'); } else set(E.cd, 'show', '0');
      step(race, now);
      race.lanes.forEach((ln, i) => {
        const g = ln.geo; const p = lanePoint(g, ln.disp);
        const r = E.racer[i]; if (!r) return;
        r.style.transform = `translate3d(${p.x}px,${p.y}px,0)`;
        const moving = isMoving(race, ln, now);
        const st = ln.penalty ? `pen-${ln.penalty.stage}` : moving ? 'run' : 'safe';
        set(r, 'state', st);
        set(r, 'kind', ln.penalty ? ln.penalty.kind : '');
        const human = ln.role === 'human';
        txt(E.body[i], human ? (st === 'safe' ? '🧎' : '🏃') : ln.emoji);
        txt(E.badge[i], ln.penalty ? (ln.penalty.stage === 'action' ? PEN_BADGE[ln.penalty.kind][0] : ln.penalty.stage === 'rest' ? PEN_BADGE[ln.penalty.kind][1] : '') : st === 'safe' ? SAFE[ln.role] || '' : '');
        const w = ln.wild; const we = E.wild[i];
        if (w && we) {
          we.style.transform = `translate3d(${w.pos.x}px,${w.pos.y}px,0)`;
          we.style.opacity = String(w.phase === 'feast' && ln.penalty?.kind === 'feast' ? 0 : w.alpha);
          set(we, 'phase', w.phase); set(we, 'type', w.type);
          txt(we.firstChild, w.emoji);
          txt(E.wildBadge[i], w.phase === 'question' ? '❓' : w.phase === 'sprint' ? '‼️' : '');
        } else if (we) set(we, 'phase', 'none');
        const bt = E.btn[i]; if (bt?._hit && nowAbs - bt._hit > 90) { bt._hit = 0; bt.dataset.hit = '0'; }
      });
      if (race.phase === 'done' && !finishedAt) {
        finishedAt = nowAbs;
        const win = race.lanes[race.winner];
        txt(E.flash, `🏁 ${win.name}!`); set(E.flash, 'show', '1');
      }
      if (finishedAt && !done && nowAbs - finishedAt > 1400) {
        done = true; cancelAnimationFrame(raf);
        onDone(rank(race), race);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); E.btn.forEach((b) => b?.removeEventListener('pointerdown', onDown)); };
  }, [lay, stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const E = els.current;
  return (
    <div className="race-board" ref={boardRef} data-race-board data-stage={stage}>
      {lay && (
        <>
          {lay.lanes.map((g, i) => {
            const ang = Math.atan2(g.dir.y, g.dir.x) * 180 / Math.PI;
            return (
              <div key={`lane-${i}`} className="race-lane" data-lane={i}
                style={{ left: g.start.x, top: g.start.y, width: g.L + RACE.goalRadius, height: RACE.laneHalfWidth * 2, marginTop: -RACE.laneHalfWidth, transform: `rotate(${ang}deg)` }} />
            );
          })}
          <div className="race-goal" style={{ left: lay.goal.x, top: lay.goal.y, width: RACE.goalRadius * 2, height: RACE.goalRadius * 2 }}>🏁</div>
          {racers.map((r, i) => {
            const g = lay.lanes[i]; const p = lanePoint(g, 0);
            return (
              <div key={`w-${i}`}>
                <div className="race-wild" data-wild={i} data-phase="none" ref={(el) => { E.wild[i] = el; }}><span /><b ref={(el) => { E.wildBadge[i] = el; }} /></div>
                <div className={`race-racer role-${r.role}`} data-racer={i} data-state="safe" ref={(el) => { E.racer[i] = el; }}
                  style={{ transform: `translate3d(${p.x}px,${p.y}px,0)` }}>
                  <span className="body" ref={(el) => { E.body[i] = el; }} style={{ transform: `rotate(${g.rot}deg)` }}>{r.role === 'human' ? '🧎' : r.emoji}</span>
                  <b className="rbadge" ref={(el) => { E.badge[i] = el; }} />
                </div>
                <button type="button" className={`race-btn role-${r.role}`} data-tap={i} data-hit="0" ref={(el) => { E.btn[i] = el; }}
                  style={{ left: g.btn.x, top: g.btn.y, width: RACE.buttonSize, height: RACE.buttonSize, transform: `translate(-50%,-50%) rotate(${g.rot}deg)` }}>
                  <span className="e">{r.role === 'human' ? '🧍' : r.emoji}</span><span className="n">{r.name}</span>
                </button>
              </div>
            );
          })}
          <div className="race-center" style={{ left: lay.goal.x, top: lay.goal.y }}>
            {stage === 'ready' && (
              <>
                <div className="race-label">{label}</div>
                <button type="button" className="race-go" data-act="race-go" onClick={() => setStage('countdown')}>▶</button>
              </>
            )}
            <div className="race-cd" data-show="0" ref={(el) => { E.cd = el; }} />
            <div className="race-flash" data-show="0" data-race-finish ref={(el) => { E.flash = el; }} />
          </div>
        </>
      )}
    </div>
  );
}
