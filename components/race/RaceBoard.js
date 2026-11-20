'use client';
import { useEffect, useRef, useState } from 'react';
import { RACE, modeCfg } from '@/lib/race/config';
import { layout, trackPoint } from '@/lib/race/geometry';
import { createRace, step, tap, rank, isMoving, weatherAt } from '@/lib/race/engine';

// ANIMAL RACE BOARD — ONE canvas for everything that moves (racers, wild animals + vision cones, trees, hearts,
// rain, night, lightning) on top of a static background canvas drawn once. One requestAnimationFrame loop, no React
// renders and no server calls during a race. DOM is used only for the 1-4 tap buttons (native pointerdown,
// multi-touch) and the countdown/finish labels.
const PEN_BADGE = { eaten: ['💥', '👻'], feast: ['😋', '💤'], caught: ['😱', '😵'], distracted: ['🥰', '💕'], clash: ['💥', '😵'] };
const PAUSE_BADGE = { trip: '💫', zap: '⚡', slide: '💦' };
const ROLE_COLOR = { predator: '#ff6a5b', prey: '#4fd18b', human: '#ffc24d' };
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

function spriteCache(dpr) {
  const m = new Map();
  return (emoji, px) => {
    const k = `${emoji}|${px}`; let c = m.get(k);
    if (!c) {
      const s = Math.ceil(px * 1.3 * dpr); c = document.createElement('canvas'); c.width = s; c.height = s;
      const g = c.getContext('2d'); g.font = `${Math.round(px * dpr)}px ${EMOJI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(emoji, s / 2, s / 2 + px * dpr * 0.06); c._px = s / dpr; m.set(k, c);
    }
    return c;
  };
}

export default function RaceBoard({ racers, wild, label, onDone, mode = 'normal', rng }) {
  const boardRef = useRef(null), bgRef = useRef(null), fgRef = useRef(null), cdRef = useRef(null), flashRef = useRef(null), nightRef = useRef(null), skyRef = useRef(null), iconRef = useRef(null);
  const btnRefs = useRef([]);
  const [lay, setLay] = useState(null);
  const [stage, setStage] = useState('ready'); // ready | countdown(race) | finish
  const cfgRef = useRef(modeCfg(mode));

  // 1) measure, build the random map (off the first paint), lock the page
  useEffect(() => {
    const b = boardRef.current;
    const block = (e) => e.preventDefault();
    b.addEventListener('touchmove', block, { passive: false });
    b.addEventListener('contextmenu', block);
    b.addEventListener('gesturestart', block);
    document.documentElement.classList.add('race-lock');
    const id = setTimeout(() => {
      const t0 = performance.now();
      const l = layout(b.clientWidth, b.clientHeight, racers.length, cfgRef.current, rng || Math.random);
      window.__layoutMs = Math.round(performance.now() - t0);
      setLay(l);
    }, 30);
    return () => { clearTimeout(id); b.removeEventListener('touchmove', block); b.removeEventListener('contextmenu', block); b.removeEventListener('gesturestart', block); document.documentElement.classList.remove('race-lock'); };
  }, [racers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2) static background (ground, tracks, goal, start pads, puddle dips) — drawn once
  useEffect(() => {
    if (!lay) return;
    const cv = bgRef.current; const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(lay.w * dpr); cv.height = Math.round(lay.h * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const adult = cfgRef.current.mode === 'adult';
    const grd = g.createRadialGradient(lay.w / 2, lay.h / 2, 30, lay.w / 2, lay.h / 2, Math.max(lay.w, lay.h) * 0.75);
    grd.addColorStop(0, adult ? '#1d2a22' : '#173a2a'); grd.addColorStop(1, adult ? '#0c120f' : '#0b1d15');
    g.fillStyle = grd; g.fillRect(0, 0, lay.w, lay.h);
    // grass speckles (deterministic)
    g.fillStyle = '#ffffff0a'; for (let i = 0; i < 160; i++) { const x = (i * 97.3) % lay.w, y = (i * 211.7) % lay.h; g.fillRect(x, y, 2, 2); }
    lay.lanes.forEach((t, i) => {
      const col = ROLE_COLOR[racers[i]?.role] || '#9b5cff';
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); t.dense.forEach((p, k) => (k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.strokeStyle = '#00000055'; g.lineWidth = RACE.trackHalf * 2 + 6; g.stroke();
      g.strokeStyle = '#5a4630'; g.lineWidth = RACE.trackHalf * 2; g.stroke();
      g.strokeStyle = `${col}aa`; g.lineWidth = 2; g.setLineDash([7, 9]); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.arc(t.start.x, t.start.y, RACE.trackHalf + 3, 0, Math.PI * 2); g.fillStyle = `${col}66`; g.fill();
      if (adult) for (const pq of cfgRef.current.adult.puddleQs) { const p = trackPoint(t, pq); g.beginPath(); g.ellipse(p.x, p.y, RACE.trackHalf - 2, RACE.trackHalf * 0.6, Math.atan2(p.ty, p.tx), 0, Math.PI * 2); g.fillStyle = '#2b3a4a'; g.fill(); }
    });
    for (const c of lay.covers) { g.beginPath(); g.ellipse(c.x + 3, c.y + 8, RACE.coverRadius + 4, RACE.coverRadius * 0.55, 0, 0, Math.PI * 2); g.fillStyle = '#00000044'; g.fill(); }
    const gg = g.createRadialGradient(lay.goal.x, lay.goal.y, 4, lay.goal.x, lay.goal.y, RACE.goalRadius + 10);
    gg.addColorStop(0, '#ffb340cc'); gg.addColorStop(1, '#ff2fb300'); g.fillStyle = gg;
    g.beginPath(); g.arc(lay.goal.x, lay.goal.y, RACE.goalRadius + 10, 0, Math.PI * 2); g.fill();
    g.font = `32px ${EMOJI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🏁', lay.goal.x, lay.goal.y);
  }, [lay]); // eslint-disable-line react-hooks/exhaustive-deps

  // 3) the race: countdown + loop (draws trees/hidden animals during the countdown too)
  useEffect(() => {
    if (!lay || stage !== 'countdown') return undefined;
    const cfg = cfgRef.current;
    const race = createRace({ racers, lay, cfg, rng: rng || Math.random, wild });
    if (typeof window !== 'undefined') window.__race = race; // read-only test hook
    const board = boardRef.current; const cv = fgRef.current; const dpr = Math.min(cfg.fgDprMax, window.devicePixelRatio || 1); // moving layer: fewer pixels to upload per frame
    cv.width = Math.round(lay.w * dpr); cv.height = Math.round(lay.h * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); const fg = g;
    const sp = spriteCache(dpr);
    // night = its own LOW-RES canvas layer (1/2 px), scaled up by the compositor: no full-screen blend in the main canvas
    const night = nightRef.current; const NS = 2; night.width = Math.ceil(lay.w / NS); night.height = Math.ceil(lay.h / NS); const ng = night.getContext('2d'); ng.setTransform(1 / NS, 0, 0, 1 / NS, 0, 0);
    const sky = skyRef.current, icon = iconRef.current; let skyA = -1, iconTxt = null, nightOn = false;
    const setSky = (a, col) => { const v = Math.round(a * 100) / 100; if (v !== skyA) { skyA = v; sky.style.opacity = String(v); if (col) sky.style.background = col; } };
    const setIcon = (t) => { if (t !== iconTxt) { iconTxt = t; icon.textContent = t || ''; icon.dataset.show = t ? '1' : '0'; } };
    const drops = Array.from({ length: cfg.adult.maxDrops }, (_, i) => ({ x: (i * 53.7) % lay.w, y: (i * 131.3) % lay.h, v: 380 + (i % 7) * 40 }));
    const t0 = performance.now() + cfg.countdownStepMs * 3;
    const btns = btnRefs.current; let raf = 0, finishedAt = 0, done = false, lastAbs = performance.now();
    const dset = (k, v) => { if (board.dataset[k] !== v) board.dataset[k] = v; };
    const onDown = (e) => {
      e.preventDefault();
      const i = Number(e.currentTarget.dataset.tap); const now = performance.now();
      if (now < t0) return;
      if (tap(race, i, now - t0)) { e.currentTarget.dataset.hit = '1'; e.currentTarget._hit = now; }
    };
    btns.forEach((b) => b?.addEventListener('pointerdown', onDown, { passive: false }));
    const draw = (img, x, y, a = 1, rot = 0) => {
      const s = img._px; if (a <= 0) return;
      if (a !== 1) g.globalAlpha = a;
      if (rot) { g.save(); g.translate(x, y); g.rotate(rot); g.drawImage(img, -s / 2, -s / 2, s, s); g.restore(); } else g.drawImage(img, x - s / 2, y - s / 2, s, s);
      if (a !== 1) g.globalAlpha = 1;
    };
    const half = cfg.coneHalfDeg * Math.PI / 180;
    const cones = (now, W, bright, g = fg) => {
      const range = W.tod === 'night' ? cfg.coneRangeNight : cfg.coneRange;
      for (const w of race.wilds) {
        if (w.state === 'home' || w.alpha < 0.05) continue;
        const hot = w.state === 'question' || w.state === 'approach' || w.state === 'sprint';
        g.beginPath(); g.moveTo(w.pos.x, w.pos.y); g.arc(w.pos.x, w.pos.y, range * (w.baby ? 0.9 : 1), w.heading - half, w.heading + half); g.closePath();
        g.fillStyle = hot ? `rgba(255,70,70,${bright ? 0.24 : 0.2})` : `rgba(255,236,140,${(bright ? 0.08 : 0.1) * w.alpha})`; g.fill();
      }
    };
    const frame = (nowAbs) => {
      raf = requestAnimationFrame(frame);
      const now = nowAbs - t0; const dtv = Math.min(50, nowAbs - lastAbs); lastAbs = nowAbs;
      if (now < 0) { if (cdRef.current) { cdRef.current.textContent = String(Math.ceil(-now / cfg.countdownStepMs)); cdRef.current.dataset.show = '1'; } }
      else if (now < 500) { cdRef.current.textContent = 'GO!'; cdRef.current.dataset.show = '1'; } else if (cdRef.current.dataset.show !== '0') cdRef.current.dataset.show = '0';
      if (now >= 0) step(race, now);
      const W = race.weather ? weatherAt(race, Math.max(0, now)) : { tod: 'day', wx: 'clear' };
      dset('tod', W.tod); dset('wx', W.wx); dset('bolt', W.bolt || '');
      g.clearRect(0, 0, lay.w, lay.h);
      // rain makes the puddles shine
      if (W.wx === 'rain') { g.fillStyle = '#5ab0ff88'; for (const t of lay.lanes) for (const pq of cfg.adult.puddleQs) { const p = trackPoint(t, pq); g.beginPath(); g.ellipse(p.x, p.y, RACE.trackHalf, RACE.trackHalf * 0.65, Math.atan2(p.ty, p.tx), 0, Math.PI * 2); g.fill(); } }
      if (W.tod !== 'night') cones(now, W, false);
      // wild animals (under the tree tops when they are home)
      for (const w of race.wilds) {
        if (w.state === 'home' || w.alpha <= 0) continue;
        const size = w.baby ? 26 * cfg.babyScale : 26;
        const bob = w.state === 'sprint' ? Math.sin(nowAbs / 30) * 2 : 0;
        draw(sp(w.emoji, size), w.pos.x, w.pos.y + bob, w.alpha);
        draw(sp('🔭', 14), w.pos.x + Math.cos(w.heading) * (size * 0.55), w.pos.y + Math.sin(w.heading) * (size * 0.55), w.alpha, w.heading);
        const badge = w.state === 'question' ? '❓' : w.state === 'sprint' ? '‼️' : w.state === 'feast' ? '😋' : null;
        if (badge) draw(sp(badge, 18), w.pos.x + 8, w.pos.y - size * 0.75);
      }
      for (const c of lay.covers) draw(sp(c.kind === 'tree' ? '🌳' : '🌿', c.kind === 'tree' ? 40 : 34), c.x, c.y);
      // racers
      race.lanes.forEach((ln, i) => {
        const p = trackPoint(ln.geo, ln.disp); const rot = ln.geo.rot ? Math.PI : 0;
        const moving = now >= 0 && isMoving(race, ln, now);
        const pen = ln.penalty; const safe = !pen && !moving;
        g.beginPath(); g.arc(p.x, p.y, 17, 0, Math.PI * 2); g.fillStyle = `${ROLE_COLOR[ln.role] || '#9b5cff'}55`; g.fill();
        const body = ln.role === 'human' ? (safe ? '🧎' : '🏃') : ln.emoji;
        const bob = moving ? Math.sin(nowAbs / 45 + i) * 2 : 0;
        draw(sp(body, 30), p.x, p.y + bob, pen ? (pen.stage === 'return' ? 0.4 : 0.6) : safe && ln.role === 'predator' ? 0.75 : 1, rot);
        let badge = null;
        if (pen) badge = pen.stage === 'action' ? PEN_BADGE[pen.kind]?.[0] : pen.stage === 'rest' ? PEN_BADGE[pen.kind]?.[1] : null;
        else if (ln.pause) badge = PAUSE_BADGE[ln.pause.kind];
        else if (safe && ln.role === 'predator') badge = '💤';
        if (safe && ln.role === 'prey') draw(sp('🌳', 42), p.x, p.y - 4); // hiding in a bush
        if (badge) draw(sp(badge, 20), p.x + (rot ? -10 : 10), p.y + (rot ? 20 : -20), 1, rot);
        const bt = btns[i]; if (bt?._hit && nowAbs - bt._hit > 90) { bt._hit = 0; bt.dataset.hit = '0'; }
      });
      for (const f of race.fx) {
        const e = (now - f.t) / cfg.heartsMs;
        if (f.kind === 'hearts') for (let k = 0; k < 3; k++) draw(sp('💕', 20), f.x + (k - 1) * 14, f.y - 10 - e * 40 - k * 6, 1 - e);
        else draw(sp('💥', 26 + e * 18), f.x, f.y, 1 - e);
      }
      // weather (night = separate low-res layer; flashes + icons = DOM layers changed only when needed)
      if (W.tod === 'night') {
        if (!nightOn) { nightOn = true; night.dataset.show = '1'; }
        ng.globalCompositeOperation = 'source-over'; ng.clearRect(0, 0, lay.w, lay.h);
        ng.fillStyle = `rgba(4,6,24,${cfg.adult.nightDarkness})`; ng.fillRect(0, 0, lay.w, lay.h);
        ng.globalCompositeOperation = 'destination-out';
        const hole = (x, y, r) => { const rg = ng.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); ng.fillStyle = rg; ng.beginPath(); ng.arc(x, y, r, 0, Math.PI * 2); ng.fill(); };
        race.lanes.forEach((ln) => { const p = trackPoint(ln.geo, ln.disp); hole(p.x, p.y, cfg.adult.lightRadius); });
        hole(lay.goal.x, lay.goal.y, 70);
        ng.globalCompositeOperation = 'source-over';
        cones(now, W, true, ng); // glowing night vision cones above the dark
      } else if (nightOn) { nightOn = false; night.dataset.show = '0'; }
      if (W.wx === 'rain') {
        g.strokeStyle = '#9fd0ff66'; g.lineWidth = 1.2; g.beginPath();
        for (const d of drops) { d.y += d.v * dtv / 1000; d.x -= d.v * 0.15 * dtv / 1000; if (d.y > lay.h) { d.y -= lay.h; d.x = (d.x + 97) % lay.w; } if (d.x < 0) d.x += lay.w; g.moveTo(d.x, d.y); g.lineTo(d.x + 3, d.y - 12); }
        g.stroke();
      }
      let ic = null;
      if (W.wx === 'wind') {
        g.strokeStyle = '#ffffff30'; g.lineWidth = 2; g.beginPath();
        for (let k = 0; k < 10; k++) { const y = (k * 89.7) % lay.h; const x = ((nowAbs * 0.4 + k * 151) % (lay.w + 80)) - 40; g.moveTo(x, y); g.lineTo(x + 40, y); }
        g.stroke();
        if (race.weather.gusts.some((x) => now >= x.cue && now < x.t + cfg.adult.gustMs)) ic = '💨';
      }
      if (W.bolt === 'warn') { setSky(Math.floor(nowAbs / 90) % 2 ? 0.14 : 0, '#fff'); ic = '⚡'; }
      else if (W.bolt === 'freeze') { setSky(Math.max(0.08, 0.85 - (now - W.boltT) / 400), '#fffff0'); ic = '✋'; }
      else setSky(0);
      if (!ic && W.cue) ic = Math.floor(nowAbs / 220) % 2 ? W.cue : null;
      setIcon(ic);
      if (race.phase === 'done' && !finishedAt) {
        finishedAt = nowAbs; const win = race.lanes[race.winner];
        flashRef.current.textContent = `🏁 ${win.name}!`; flashRef.current.dataset.show = '1';
      }
      if (finishedAt && !done && nowAbs - finishedAt > 1400) { done = true; cancelAnimationFrame(raf); onDone(rank(race), race); }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); btns.forEach((b) => b?.removeEventListener('pointerdown', onDown)); };
  }, [lay, stage]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="race-board" ref={boardRef} data-race-board data-stage={stage} data-mode={mode}>
      <canvas className="race-canvas" ref={bgRef} aria-hidden="true" />
      <canvas className="race-canvas" ref={fgRef} aria-hidden="true" />
      <canvas className="race-canvas race-night" ref={nightRef} data-show="0" aria-hidden="true" />
      <div className="race-sky" ref={skyRef} aria-hidden="true" />
      {!lay && <div className="race-center" style={{ left: '50%', top: '50%' }}><div className="race-label">🌳🌿🌳</div></div>}
      {lay && (
        <>
          {racers.map((r, i) => {
            const g = lay.lanes[i];
            return (
              <button key={`b-${i}`} type="button" className={`race-btn role-${r.role}`} data-tap={i} data-hit="0" ref={(el) => { btnRefs.current[i] = el; }}
                style={{ left: g.btn.x, top: g.btn.y, width: RACE.buttonSize, height: RACE.buttonSize, transform: `translate(-50%,-50%) rotate(${g.rot}deg)` }}>
                <span className="e">{r.role === 'human' ? '🧍' : r.emoji}</span><span className="n">{r.name}</span>
              </button>
            );
          })}
          <div className="race-center" style={{ left: lay.goal.x, top: lay.goal.y }}>
            {stage === 'ready' && (
              <>
                <div className="race-label">{label}{mode === 'adult' ? ' · 🌙⛈️' : ''}</div>
                <button type="button" className="race-go" data-act="race-go" onClick={() => setStage('countdown')}>▶</button>
              </>
            )}
            <div className="race-cd" data-show="0" ref={cdRef} />
            <div className="race-flash" data-show="0" data-race-finish ref={flashRef} />
            <div className="race-sky-icon" data-show="0" ref={iconRef} aria-hidden="true" />
          </div>
        </>
      )}
    </div>
  );
}
