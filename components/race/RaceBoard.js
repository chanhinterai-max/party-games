'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { RACE, modeCfg } from '@/lib/race/config';
import { applyTunables } from '@/lib/race/tunables';
import { trackPoint } from '@/lib/race/geometry';
import { createRace, step, tap, rank, isMoving, weatherAt, babyPos } from '@/lib/race/engine';
import { requestLayout, boardSize, syncViewport } from '@/lib/race/layoutClient';

// ANIMAL RACE BOARD — ONE canvas for everything that moves (racers, hunters + spotlights, lasers, tracers, health
// bars, babies, trees, hearts, rain, night, lightning) on top of a static background canvas drawn once. One
// requestAnimationFrame loop, no React renders and no server calls during a race. DOM is used only for the 1-4 tap
// buttons (native pointerdown, multi-touch) and a few labels (countdown, FREEZE!, hunter banner, finish).
// The map is built in a Web Worker ahead of time (see layoutClient.js) → the next heat appears instantly.
const PEN_BADGE = { shot: ['💥', '😵'], touched: ['🤠', '😵'], clash: ['💥', '😵'] };
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
// v10 PARTY POOL goal — drawn ONCE into the static background canvas (no per-frame cost): party glow, tiled deck,
// water with a highlight, lane ropes, floats + a drink on the deck. Per frame there is only one faint ripple ring.
function drawPool(g, x, y, R) {
  const glow = g.createRadialGradient(x, y, R * 0.6, x, y, R + 22);
  glow.addColorStop(0, '#ff4fd866'); glow.addColorStop(1, '#ff4fd800');
  g.fillStyle = glow; g.beginPath(); g.arc(x, y, R + 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f3e7cc'; g.beginPath(); g.arc(x, y, R + 7, 0, Math.PI * 2); g.fill(); // deck
  g.strokeStyle = '#d9c9a4'; g.lineWidth = 1; for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; g.beginPath(); g.moveTo(x + Math.cos(a) * R, y + Math.sin(a) * R); g.lineTo(x + Math.cos(a) * (R + 7), y + Math.sin(a) * (R + 7)); g.stroke(); }
  const wg = g.createRadialGradient(x - R * 0.3, y - R * 0.3, 2, x, y, R);
  wg.addColorStop(0, '#9ff3ff'); wg.addColorStop(0.55, '#33c4ef'); wg.addColorStop(1, '#127fc0');
  g.fillStyle = wg; g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill();
  g.save(); g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.clip();
  g.strokeStyle = '#ffffff55'; g.lineWidth = 2;
  for (let k = -1; k <= 1; k++) { g.beginPath(); for (let i = 0; i <= 12; i++) { const px = x - R + (i / 12) * 2 * R; const py = y + k * R * 0.45 + Math.sin(i * 1.3 + k) * 2.5; if (i) g.lineTo(px, py); else g.moveTo(px, py); } g.stroke(); }
  g.restore();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `17px ${EMOJI_FONT}`; g.fillText('🛟', x - R * 0.5, y + R * 0.45); g.fillText('🦩', x + R * 0.48, y - R * 0.42);
  g.font = `13px ${EMOJI_FONT}`; g.fillText('🍹', x + R + 6, y + R * 0.55); g.fillText('🎉', x - R - 5, y - R * 0.55);
  g.font = `22px ${EMOJI_FONT}`; g.fillText('🏊', x, y + 2);
}
// haptics: navigator.vibrate where it exists (Android); iOS Safari has none → silently nothing
function vibrate(p) { try { if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(p); } catch { /* ignore */ } }

// v11 Party Star: put the star and their chosen partner (pair = [star, partner]) on two tracks that CROSS
// (any in-zone crossing of the map); everyone else keeps their order. Returns { list, crossed }.
function arrange(racers, lay, pair) {
  if (!lay || !pair) return { list: racers, crossed: false };
  const si = racers.findIndex((r) => r.name === pair[0]), pi = racers.findIndex((r) => r.name === pair[1]);
  const c = lay.crossings.find((x) => x.inZone);
  if (si < 0 || pi < 0 || !c) return { list: racers, crossed: false };
  const out = new Array(racers.length); out[c.a] = racers[si]; out[c.b] = racers[pi];
  const rest = racers.filter((_, i) => i !== si && i !== pi); let k = 0;
  for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = rest[k++];
  return { list: out, crossed: true };
}

export default function RaceBoard({ racers: given, label, onDone, mode = 'normal', rng, slot = 'x', tune, star = null, pair = null }) {
  const boardRef = useRef(null), bgRef = useRef(null), fgRef = useRef(null), cdRef = useRef(null), flashRef = useRef(null), nightRef = useRef(null), skyRef = useRef(null), iconRef = useRef(null), freezeRef = useRef(null), bannerRef = useRef(null);
  const btnRefs = useRef([]);
  const [lay, setLay] = useState(null);
  const { list: racers, crossed } = useMemo(() => arrange(given, lay, pair), [lay]); // eslint-disable-line react-hooks/exhaustive-deps
  const [stage, setStage] = useState('ready');
  const [remap, setRemap] = useState(false); // v10: a new map for a new visible size is being built (▶ waits) // ready | countdown(race) | finish
  const cfgRef = useRef(null);
  if (!cfgRef.current) { // v10: admin overrides; v11: ⭐ Party Star perks (only for the racer with star: true)
    const base = modeCfg(mode, applyTunables(RACE, tune)); const P = star?.perks;
    cfgRef.current = P ? { ...base, star: { tapMult: P.raceTapOn ? P.raceTapMult : 1, gentle: P.raceGentleOn ? P.raceGentlePct / 100 : 0, luck: P.luckOn ? P.luckPct / 100 : 0 } } : base;
  }

  // 1) lock the page, get the (usually already built) map for this heat
  useEffect(() => {
    const b = boardRef.current; let live = true;
    const block = (e) => e.preventDefault();
    b.addEventListener('touchmove', block, { passive: false });
    b.addEventListener('contextmenu', block);
    b.addEventListener('gesturestart', block);
    document.documentElement.classList.add('race-lock');
    const t0 = performance.now(); const { w, h } = boardSize();
    requestLayout(slot, w, h, racers.length, cfgRef.current.mode).then((l) => {
      if (!live) return;
      window.__layoutMs = Math.round(performance.now() - t0); // wait for the map (≈0 when precomputed)
      setLay(l);
    });
    return () => { live = false; b.removeEventListener('touchmove', block); b.removeEventListener('contextmenu', block); b.removeEventListener('gesturestart', block); document.documentElement.classList.remove('race-lock'); };
  }, [racers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 1b) v10: the visible viewport changed (browser bars shown/hidden, rotation) BEFORE the race starts → new map for
  // the new size (worker; usually a few ms… up to ~1 s in Adult, the old board stays up meanwhile). During a race the
  // map is kept (re-laying out mid-race is impossible); --vvh still follows the viewport.
  const layRef = useRef(null); layRef.current = lay; const stageRef = useRef(stage); stageRef.current = stage;
  useEffect(() => {
    const vv = window.visualViewport; let tm = 0; let live = true;
    const onResize = () => {
      syncViewport(); clearTimeout(tm);
      tm = setTimeout(() => {
        const l = layRef.current; if (!l || stageRef.current !== 'ready') return;
        const { w, h } = boardSize(); if (Math.abs(w - l.w) < 4 && Math.abs(h - l.h) < 4) return;
        setRemap(true);
        requestLayout(`${slot}|vv`, w, h, racers.length, cfgRef.current.mode).then((nl) => { if (live && stageRef.current === 'ready') setLay(nl); }).finally(() => { if (live) setRemap(false); });
      }, 150);
    };
    vv?.addEventListener('resize', onResize); window.addEventListener('resize', onResize); window.addEventListener('orientationchange', onResize);
    return () => { live = false; clearTimeout(tm); vv?.removeEventListener('resize', onResize); window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize); };
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
    drawPool(g, lay.goal.x, lay.goal.y, RACE.goalRadius);
    // first painted frame of this heat (instant-next-heat measurement: press → this)
    requestAnimationFrame(() => { window.__heatFrameAt = performance.now(); });
  }, [lay]); // eslint-disable-line react-hooks/exhaustive-deps

  // 3) the race: countdown + loop (draws trees during the countdown too)
  useEffect(() => {
    if (!lay || stage !== 'countdown') return undefined;
    const cfg = cfgRef.current; const H = cfg.haptics;
    const race = createRace({ racers, lay, cfg, rng: rng || Math.random });
    if (typeof window !== 'undefined') window.__race = race; // read-only test hook
    const board = boardRef.current; const cv = fgRef.current; const dpr = Math.min(cfg.fgDprMax, window.devicePixelRatio || 1); // moving layer: fewer pixels to upload per frame
    cv.width = Math.round(lay.w * dpr); cv.height = Math.round(lay.h * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); const fg = g;
    const sp = spriteCache(dpr);
    // night = its own LOW-RES canvas layer (1/2 px), scaled up by the compositor: no full-screen blend in the main canvas
    const night = nightRef.current; const NS = 2; night.width = Math.ceil(lay.w / NS); night.height = Math.ceil(lay.h / NS); const ng = night.getContext('2d'); ng.setTransform(1 / NS, 0, 0, 1 / NS, 0, 0);
    const sky = skyRef.current, icon = iconRef.current, frz = freezeRef.current, ban = bannerRef.current; let skyA = -1, iconTxt = null, nightOn = false, frzTxt = null, banTxt = null;
    const setSky = (a, col) => { const v = Math.round(a * 100) / 100; if (v !== skyA) { skyA = v; sky.style.opacity = String(v); } if (col && sky._c !== col) { sky._c = col; sky.style.background = col; } };
    const setIcon = (t) => { if (t !== iconTxt) { iconTxt = t; icon.textContent = t || ''; icon.dataset.show = t ? '1' : '0'; } };
    const setFreeze = (t, kind) => { if (t !== frzTxt) { frzTxt = t; frz.textContent = t || ''; frz.dataset.show = t ? kind : '0'; } };
    const setBanner = (t) => { if (t !== banTxt) { banTxt = t; ban.textContent = t || ''; ban.dataset.show = t ? '1' : '0'; } };
    const drops = Array.from({ length: cfg.adult.maxDrops }, (_, i) => ({ x: (i * 53.7) % lay.w, y: (i * 131.3) % lay.h, v: 380 + (i % 7) * 40 }));
    const t0 = performance.now() + cfg.countdownStepMs * 3;
    const btns = btnRefs.current; let raf = 0, finishedAt = 0, done = false, lastAbs = performance.now(), lastVib = -1e9, evIdx = 0, cdShown = null, warnedBolt = null, banUntil = 0, banWave = -1, cueBand = -1, cueUntil = 0;
    const dset = (k, v) => { if (board.dataset[k] !== v) board.dataset[k] = v; };
    const onDown = (e) => {
      e.preventDefault();
      const i = Number(e.currentTarget.dataset.tap); const now = performance.now();
      if (now < t0) { e.currentTarget.dataset.early = '1'; e.currentTarget._hit = now; return; } // before GO: ignored
      if (tap(race, i, now - t0)) {
        e.currentTarget.dataset.hit = '1'; e.currentTarget._hit = now;
        if (now - lastVib >= H.tapEveryMs) { lastVib = now; vibrate(H.tapMs); } // tiny throttled tick
      }
    };
    btns.forEach((b) => b?.addEventListener('pointerdown', onDown, { passive: false }));
    const draw = (img, x, y, a = 1, rot = 0) => {
      const s = img._px; if (a <= 0) return;
      if (a !== 1) g.globalAlpha = a;
      if (rot) { g.save(); g.translate(x, y); g.rotate(rot); g.drawImage(img, -s / 2, -s / 2, s, s); g.restore(); } else g.drawImage(img, x - s / 2, y - s / 2, s, s);
      if (a !== 1) g.globalAlpha = 1;
    };
    const half = cfg.coneHalfDeg * Math.PI / 180;
    const conePath = (gx, h, range) => { gx.beginPath(); gx.moveTo(h.pos.x, h.pos.y); gx.arc(h.pos.x, h.pos.y, range, h.heading - half, h.heading + half); gx.closePath(); };
    const cones = (now, nightMode) => {
      const range = nightMode ? cfg.coneRangeNight : cfg.coneRange;
      for (const h of race.hunters) {
        if (h.alpha < 0.05) continue;
        const hot = h.state === 'aim';
        if (nightMode) { // long glowing spotlight: cut the darkness, then a warm glow
          ng.globalCompositeOperation = 'destination-out'; conePath(ng, h, range); ng.fillStyle = `rgba(0,0,0,${0.75 * h.alpha})`; ng.fill();
          ng.globalCompositeOperation = 'source-over'; conePath(ng, h, range); ng.fillStyle = hot ? 'rgba(255,80,80,0.22)' : `rgba(255,236,150,${0.16 * h.alpha})`; ng.fill();
        } else { conePath(g, h, range); g.fillStyle = hot ? 'rgba(255,70,70,0.22)' : `rgba(255,236,140,${0.12 * h.alpha})`; g.fill(); }
      }
    };
    const drawGun = (h, size) => { // 🔫 held in front, pointing along the heading (emoji points left → flip)
      const img = sp('🔫', 15); const s = img._px; const c = Math.cos(h.heading);
      g.save(); g.translate(h.pos.x + c * size * 0.5, h.pos.y + Math.sin(h.heading) * size * 0.5); g.rotate(h.heading); g.scale(-1, c < 0 ? -1 : 1);
      if (h.alpha !== 1) g.globalAlpha = h.alpha; g.drawImage(img, -s / 2, -s / 2, s, s); g.restore();
    };
    const healthBar = (x, y, hp, rot) => {
      const w = 30, hh = 5; const f = Math.max(0, hp / cfg.health); const yy = rot ? y + 22 : y - 26;
      g.fillStyle = '#000a'; g.fillRect(x - w / 2 - 1, yy - 1, w + 2, hh + 2);
      g.fillStyle = f > 0.6 ? '#4fd18b' : f > 0.3 ? '#ffc24d' : '#ff4d4d'; g.fillRect(x - w / 2, yy, w * f, hh);
    };
    const handleEvents = (nowAbs) => {
      for (; evIdx < race.events.length; evIdx++) {
        const e = race.events[evIdx];
        if (e.type === 'shot' || e.type === 'baby-shot') vibrate(H.hitMs);
        else if (e.type === 'caught') vibrate(H.death);
        else if (e.type === 'finish') vibrate(H.finish);
        else if (e.type === 'hunter-cue') { banWave = e.wave; banUntil = nowAbs + cfg.hunterArriveCueMs + 700; cueBand = e.wave % cfg.coverBands.length; cueUntil = nowAbs + cfg.hunterArriveCueMs; vibrate(H.go); }
      }
    };
    const frame = (nowAbs) => {
      raf = requestAnimationFrame(frame);
      const now = nowAbs - t0; const dtv = Math.min(50, nowAbs - lastAbs); lastAbs = nowAbs;
      // big animal countdown: 🐢 3 · 🐇 2 · 🐆 1 · GO!
      const cdKey = now < 0 ? Math.ceil(-now / cfg.countdownStepMs) : now < 600 ? 0 : -1;
      if (cdKey !== cdShown) {
        cdShown = cdKey; const el = cdRef.current;
        if (cdKey > 0) { el.innerHTML = `<span class="a">${cfg.countdownAnimals[3 - cdKey] || ''}</span><span class="d">${cdKey}</span>`; el.dataset.show = String(cdKey); }
        else if (cdKey === 0) { el.innerHTML = '<span class="d go">GO!</span>'; el.dataset.show = 'go'; vibrate(H.go); }
        else el.dataset.show = '0';
      }
      if (now >= 0) step(race, now);
      handleEvents(nowAbs);
      const W = race.weather ? weatherAt(race, Math.max(0, now)) : { tod: 'day', wx: 'clear' };
      dset('tod', W.tod); dset('wx', W.wx); dset('bolt', W.bolt || '');
      g.clearRect(0, 0, lay.w, lay.h);
      // rain makes the puddles shine
      if (W.wx === 'rain') { g.fillStyle = '#5ab0ff88'; for (const t of lay.lanes) for (const pq of cfg.adult.puddleQs) { const p = trackPoint(t, pq); g.beginPath(); g.ellipse(p.x, p.y, RACE.trackHalf, RACE.trackHalf * 0.65, Math.atan2(p.ty, p.tx), 0, Math.PI * 2); g.fill(); } }
      if (W.tod !== 'night') cones(now, false);
      // trees + bushes (the ones a hunter is about to come out of shake)
      const shake = nowAbs < cueUntil ? Math.sin(nowAbs / 35) * 2.5 : 0;
      for (const c of lay.covers) draw(sp(c.kind === 'tree' ? '🌳' : '🌿', c.kind === 'tree' ? 40 : 34), c.x + (c.band === cueBand ? shake : 0), c.y);
      // hunters 🤠 + 🔫, red laser while aiming
      for (const h of race.hunters) {
        if (h.alpha <= 0) continue;
        draw(sp('🤠', 26), h.pos.x, h.pos.y, h.alpha); drawGun(h, 26);
      }
      // racers (+ their babies, health bars). Not moving = hidden in a bush (every role).
      race.lanes.forEach((ln, i) => {
        if (finishedAt && i === race.winner) return; // the winner is in the pool (drawn below)
        const p = trackPoint(ln.geo, ln.disp); const rot = ln.geo.rot ? Math.PI : 0;
        const moving = now >= 0 && isMoving(race, ln, now);
        const pen = ln.penalty; const hidden = !pen && !moving;
        for (let k = ln.babies.length - 1; k >= 0; k--) { const bp = babyPos(race, ln, k); draw(sp(ln.role === 'human' ? '👶' : ln.emoji, Math.round(30 * cfg.babyScale)), bp.x, bp.y, hidden ? 0.55 : 1, rot); }
        g.beginPath(); g.arc(p.x, p.y, 17, 0, Math.PI * 2); g.fillStyle = `${ROLE_COLOR[ln.role] || '#9b5cff'}55`; g.fill();
        const body = ln.role === 'human' ? (hidden ? '🧍' : '🏃') : ln.emoji;
        const bob = moving ? Math.sin(nowAbs / 45 + i) * 2 : 0;
        draw(sp(body, 30), p.x, p.y + bob, pen ? (pen.stage === 'return' ? 0.4 : 0.6) : 1, rot);
        if (hidden) draw(sp('🌿', 42), p.x, p.y - 2); // hiding in a bush
        let badge = null;
        if (pen) badge = pen.stage === 'action' ? PEN_BADGE[pen.kind]?.[0] : pen.stage === 'rest' ? PEN_BADGE[pen.kind]?.[1] : null;
        else if (ln.pause) badge = PAUSE_BADGE[ln.pause.kind];
        if (badge) draw(sp(badge, 20), p.x + (rot ? -10 : 10), p.y + (rot ? 20 : -20), 1, rot);
        else if (!pen && ln.health < cfg.health - 0.5) healthBar(p.x, p.y, ln.health, rot);
        const bt = btns[i]; if (bt?._hit && nowAbs - bt._hit > 90) { bt._hit = 0; bt.dataset.hit = '0'; bt.dataset.early = '0'; }
      });
      // red laser sight while a hunter aims (drawn on top of the racers; blinks fast just before the shot)
      for (const h of race.hunters) {
        if (h.state !== 'aim' || h.target == null || now < h.aimStart) continue;
        const p = trackPoint(race.lanes[h.target].geo, race.lanes[h.target].disp);
        const blink = (now - h.aimStart) > cfg.aimMs * 0.6 ? Math.floor(nowAbs / 60) % 2 : 1;
        g.strokeStyle = `rgba(255,40,40,${blink ? 0.35 : 0.15})`; g.lineWidth = 6; g.beginPath(); g.moveTo(h.pos.x, h.pos.y); g.lineTo(p.x, p.y); g.stroke();
        g.strokeStyle = `rgba(255,30,30,${blink ? 0.95 : 0.4})`; g.lineWidth = 2; g.stroke();
        g.fillStyle = '#ff1e1e'; g.beginPath(); g.arc(p.x, p.y, 4.5, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#ff1e1e'; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, 10, 0, Math.PI * 2); g.stroke();
      }
      for (const f of race.fx) {
        if (f.kind === 'tracer') { // bullet streak + muzzle flash
          const e = (now - f.t) / f.ms;
          g.strokeStyle = `rgba(255,230,120,${1 - e})`; g.lineWidth = 2.5; g.beginPath(); g.moveTo(f.x0, f.y0); g.lineTo(f.x0 + (f.x - f.x0) * Math.min(1, e * 2.5), f.y0 + (f.y - f.y0) * Math.min(1, e * 2.5)); g.stroke();
          g.fillStyle = `rgba(255,200,60,${1 - e})`; g.beginPath(); g.arc(f.x0, f.y0, 10 * (1 - e) + 3, 0, Math.PI * 2); g.fill();
          draw(sp('💥', 22), f.x, f.y, 1 - e); // impact
          continue;
        }
        if (f.kind === 'star') { const e = (now - f.t) / cfg.heartsMs; draw(sp('⭐', 18 + e * 8), f.x, f.y - 16 - e * 30, 1 - e); continue; } // v11 lucky moment
        if (f.kind === 'poof') { const e = (now - f.t) / cfg.poofMs; draw(sp('💨', 18 + e * 16), f.x, f.y - e * 10, 1 - e); draw(sp('✨', 14), f.x + 8, f.y - 6 - e * 20, 1 - e); continue; }
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
        cones(now, true); // long glowing spotlights
        ng.globalCompositeOperation = 'source-over';
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
      // lightning: a BIG ⚡ FREEZE! warning (+ yellow tint + vibration) well before the freeze, then ✋ during it
      if (W.bolt === 'warn') {
        if (warnedBolt !== W.boltT) { warnedBolt = W.boltT; vibrate(H.freeze); }
        setSky(0.16 + (Math.floor(nowAbs / 150) % 2) * 0.1, '#ffe14d'); setFreeze('⚡ FREEZE!', 'warn');
      } else if (W.bolt === 'freeze') { setSky(Math.max(0.08, 0.85 - (now - W.boltT) / 400), '#fffff0'); setFreeze('✋ FREEZE', 'freeze'); ic = '✋'; }
      else { setSky(0); setFreeze(null); }
      if (!ic && W.cue) ic = Math.floor(nowAbs / 220) % 2 ? W.cue : null;
      setIcon(ic);
      setBanner(nowAbs < banUntil && race.phase === 'race' ? (banWave === 0 ? '🤠 A hunter is coming!' : '🤠 Another hunter!') : null);
      // pool ripple (one cheap ring) + the winner's jump & splash
      { const rp = (nowAbs % 2400) / 2400; g.strokeStyle = `rgba(255,255,255,${0.35 * (1 - rp)})`; g.lineWidth = 1.5; g.beginPath(); g.arc(lay.goal.x, lay.goal.y, 8 + rp * (RACE.goalRadius - 10), 0, Math.PI * 2); g.stroke(); }
      if (finishedAt) {
        const e = Math.min(1, (nowAbs - finishedAt) / 420); const ln = race.lanes[race.winner]; const p0 = trackPoint(ln.geo, 1);
        if (e < 1) { // hop in an arc from the pool edge to the middle
          const x = p0.x + (lay.goal.x - p0.x) * e, y = p0.y + (lay.goal.y - p0.y) * e - Math.sin(e * Math.PI) * 26;
          draw(sp(ln.role === 'human' ? '🏃' : ln.emoji, 30), x, y, 1, e * Math.PI * 2);
        }
        const s = (nowAbs - finishedAt - 380) / 900;
        if (s > 0 && s < 1) {
          g.strokeStyle = `rgba(255,255,255,${0.9 * (1 - s)})`; g.lineWidth = 3;
          for (let k = 0; k < 2; k++) { g.beginPath(); g.ellipse(lay.goal.x, lay.goal.y, 6 + (s * 46) / (k + 1), (4 + (s * 30)) / (k + 1), 0, 0, Math.PI * 2); g.stroke(); }
          for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + (k - 2.5) * 0.45; const r = 10 + s * 38; draw(sp('💦', 16), lay.goal.x + Math.cos(a) * r, lay.goal.y + Math.sin(a) * r * 0.8 + s * s * 30, 1 - s); }
        }
        if (s > 0) draw(sp(ln.role === 'human' ? '🏊' : ln.emoji, 26), lay.goal.x, lay.goal.y + 4 + Math.sin(nowAbs / 160) * 2, Math.min(1, s * 3)); // bobbing in the pool
      }
      if (race.phase === 'done' && !finishedAt) {
        finishedAt = nowAbs; const win = race.lanes[race.winner];
        flashRef.current.textContent = `🏊 ${win.name}!`; flashRef.current.dataset.show = '1';
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
      <div className="race-freeze" ref={freezeRef} data-show="0" role="status" />
      <div className="race-banner" ref={bannerRef} data-show="0" role="status" />
      {!lay && <div className="race-center" style={{ left: '50%', top: '50%' }}><div className="race-label">🌳🌿🌳</div></div>}
      {lay && (
        <>
          {racers.map((r, i) => {
            const g = lay.lanes[i];
            return (
              <button key={`b-${i}`} type="button" className={`race-btn role-${r.role}`} data-tap={i} data-hit="0" ref={(el) => { btnRefs.current[i] = el; }}
                style={{ left: g.btn.x, top: g.btn.y, width: lay.bR ? lay.bR * 2 : RACE.buttonSize, height: lay.bR ? lay.bR * 2 : RACE.buttonSize, transform: `translate(-50%,-50%) rotate(${g.rot}deg)` }}>
                <span className="e">{r.role === 'human' ? '🧍' : r.emoji}</span><span className="n">{r.name}{r.star ? ' ⭐' : ''}</span>
              </button>
            );
          })}
          <div className="race-center" style={{ left: lay.goal.x, top: lay.goal.y }}>
            {stage === 'ready' && (
              <>
                <div className="race-label">{label}{mode === 'adult' ? ' · 🌙⛈️' : ''}</div>
                {crossed && star && <div className="race-star-pick" data-star-tag>⭐ {star.label}’s pick 💕 {pair[1]} crosses {pair[0]}</div>}
                <button type="button" className="race-go" data-act="race-go" disabled={remap} aria-busy={remap} onClick={() => setStage('countdown')}>{remap ? '…' : '▶'}</button>
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
