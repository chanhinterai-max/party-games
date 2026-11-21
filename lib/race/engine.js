// ANIMAL RACE ENGINE — pure logic, no DOM. Runs on the phone inside requestAnimationFrame (and in node tests).
// Time `now` = ms since GO. Everything that matters for fairness is the same for every racer (see config.js).
// v9: hunters (🤠) instead of wild animals. Each track has its OWN hunters (mirrored spawn points + roam paths,
// same arrival times), and a hunter only ever hunts its own track's racer → every racer faces the same threat.
import { RACE, penaltyTotal, clampSpeed } from './config.js';
import { trackPoint, blockedAt, segClear } from './geometry.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rr = (rng, [a, b]) => a + rng() * (b - a);
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Racer meets racer: predator+prey = clash (both home), same role + opposite gender = love (baby), else pass.
export function crashOutcome(a, b) {
  if (a.role === 'human' || b.role === 'human') return 'pass';
  if (a.role !== b.role) return 'clash';
  if (a.gender && b.gender && a.gender !== b.gender) return 'love';
  return 'pass';
}

// ---- weather (Adult): one shared timeline for everybody
function makeWeather(cfg, rng) {
  const a = cfg.adult; const spells = []; let t = 0, tod = 'day', wx = 'clear';
  spells.push({ start: 0, tod, wx });
  // the first changes are guaranteed to show night, rain and wind; afterwards random
  const must = ['night', 'rain', 'wind'].sort(() => rng() - 0.5);
  for (let k = 0; k < 40; k++) {
    t += Math.round(rr(rng, k === 0 && a.firstSpellMs ? a.firstSpellMs : a.spellMs));
    const m = must[k];
    if (m === 'night') tod = 'night'; else if (m === 'rain') wx = 'rain'; else if (m === 'wind') wx = 'wind';
    else if (rng() < 0.5) tod = tod === 'day' ? 'night' : 'day'; else { const o = ['clear', 'rain', 'wind'].filter((x) => x !== wx); wx = o[Math.floor(rng() * o.length)]; }
    spells.push({ start: t, tod, wx });
  }
  const bolts = [], gusts = [];
  spells.forEach((s, i) => {
    const end = spells[i + 1]?.start ?? s.start + a.spellMs[1];
    if (s.wx === 'rain') for (let x = s.start + rr(rng, a.lightningEveryMs); x + a.freezeMs < end; x += Math.max(rr(rng, a.lightningEveryMs), a.lightningWarnMs + a.freezeMs + 500)) bolts.push({ t: Math.round(x), warn: Math.round(x - a.lightningWarnMs), end: Math.round(x + a.freezeMs) });
    if (s.wx === 'wind') for (let x = s.start + rr(rng, a.gustEveryMs); x < end; x += rr(rng, a.gustEveryMs)) gusts.push({ t: Math.round(x), cue: Math.round(x - a.gustCueMs), done: false });
  });
  return { spells, bolts, gusts };
}
export function weatherAt(race, now) {
  const W = race.weather; if (!W) return { tod: 'day', wx: 'clear', idx: 0 };
  let i = 0; while (i + 1 < W.spells.length && W.spells[i + 1].start <= now) i++;
  const s = W.spells[i]; const nx = W.spells[i + 1];
  const cue = nx && nx.start - now <= race.cfg.adult.cueMs ? (nx.tod !== s.tod ? (nx.tod === 'night' ? '🌙' : '☀️') : nx.wx === 'rain' ? '🌧️' : nx.wx === 'wind' ? '💨' : '🌤️') : null;
  const bolt = s.wx === 'rain' ? W.bolts.find((b) => now >= b.warn && now < b.end) : null;
  return { tod: s.tod, wx: s.wx, idx: i, cue, bolt: bolt ? (now < bolt.t ? 'warn' : 'freeze') : null, boltT: bolt?.t };
}

// racers: [{ name, role, emoji, gender, speed, star? }]. v11: cfg.star = { tapMult, gentle (0-0.5), luck (0-1) } applies
// ONLY to the racer with star: true (the VISIBLE Party Star; every lucky moment is shown as a ⭐ fx + 'star-luck' event).
export function createRace({ racers, lay, cfg = RACE, rng = Math.random }) {
  const lanes = racers.map((r, i) => ({
    i, name: r.name, role: r.role, emoji: r.emoji, gender: r.gender, speed: clampSpeed(r.speed ?? 100, cfg), star: !!r.star && !!cfg.star,
    mult: r.star && cfg.star ? cfg.star.tapMult || 1 : 1, gentle: r.star && cfg.star ? cfg.star.gentle || 0 : 0,
    geo: lay.lanes[i], q: 0, disp: 0, lastTap: -1e9, prevTap: -1e9, taps: 0, fastRun: 0,
    penalty: null, pause: null, puddles: {}, health: cfg.health, lastHit: -1e9, babies: [],
    stats: { shot: 0, hits: 0, touched: 0, clashes: 0, loves: 0, trips: 0, zaps: 0, slides: 0, gusts: 0, babyShields: 0, kinds: [] },
  }));
  const race = { cfg, lay, rng, lanes, hunters: [], pairs: {}, babies: 0, events: [], fx: [], now: 0, phase: 'race', winner: null,
    weather: cfg.mode === 'adult' ? makeWeather(cfg, rng) : null, nextId: 1, waves: [] };
  // hunter waves: identical times for every track; one shared seed per wave → mirrored hunters walk mirrored paths
  const bands = cfg.coverBands.length;
  for (let k = 0; k < cfg.hunterMaxPerTrack && (k + 1) * lanes.length <= cfg.maxHunters; k++) {
    race.waves.push({ k, t: cfg.hunterFirstMs + k * cfg.hunterEveryMs, band: k % bands, seed: Math.floor(rng() * 2 ** 31), done: false, cued: false });
  }
  return race;
}

const ev = (race, type, lane, t, extra) => { race.events.push({ type, lane, t, ...extra }); };
export const racerPos = (ln) => trackPoint(ln.geo, ln.q);
// moving = tapped within stopMs and not paused / penalised. NOT moving = hidden in a bush (every role) = safe.
export const isMoving = (race, ln, now) => !ln.penalty && !ln.pause && now - ln.lastTap < race.cfg.stopMs;
export const isHidden = (race, ln, now) => !ln.penalty && !isMoving(race, ln, now);
export const coneRange = (race, now) => (race.weather && weatherAt(race, now).tod === 'night' ? race.cfg.coneRangeNight : race.cfg.coneRange);
export function inCone(race, h, p, now, keep = 1) {
  const d = dist(h.pos, p); const range = coneRange(race, now) * keep;
  const ang = Math.abs(angDiff(Math.atan2(p.y - h.pos.y, p.x - h.pos.x), h.heading));
  return { ok: d <= range && ang <= (race.cfg.coneHalfDeg * Math.PI / 180) * keep, d, ang, range };
}
// damage falls off linearly with distance: dmgClose at ≤ dmgCloseDist → dmgFar at the edge of the spotlight
export function shotDamage(cfg, d, range) {
  if (d <= cfg.dmgCloseDist) return cfg.dmgClose;
  const f = Math.min(1, (d - cfg.dmgCloseDist) / Math.max(1, range - cfg.dmgCloseDist));
  return Math.round((cfg.dmgClose + (cfg.dmgFar - cfg.dmgClose) * f) * 10) / 10;
}

function setPause(race, ln, now, kind, ms) { ln.pause = { kind, start: now, until: now + ms }; ln.fastRun = 0; }
function slideBack(ln, dq) { ln.q = Math.max(0, ln.q - dq * (ln.gentle ? 1 - ln.gentle : 1)); } // v11: ⭐ star lane: weather gentler
// death (shot to 0 / touched by a hunter / clash): back to start, same penalty for everyone, health reset to full
function sendHome(race, ln, now, kind, extra = {}) {
  ln.penalty = { start: now, kind, fromQ: ln.disp, stage: 'action' };
  ln.q = 0; ln.pause = null; ln.fastRun = 0; ln.health = race.cfg.health; ln.lastHit = -1e9;
  ln.stats.kinds.push(kind);
  for (const h of race.hunters) if (h.target === ln.i) dropTarget(race, h, now, 'dead');
  ev(race, 'caught', ln.i, now, { kind, ...extra });
}

export function tap(race, i, now) {
  const ln = race.lanes[i]; const c = race.cfg;
  if (!ln || race.phase !== 'race' || ln.penalty || ln.pause) return false;
  if (now - ln.prevTap < 1000 / c.maxTapsPerSec) return false;
  const interval = now - ln.prevTap;
  ln.prevTap = now; ln.lastTap = now; ln.taps++;
  if (race.weather) {
    const W = weatherAt(race, now); const a = c.adult;
    if (W.bolt === 'freeze') { // tapping during the lightning freeze: zapped (same for everyone)
      slideBack(ln, a.zapSlide); setPause(race, ln, now, 'zap', a.zapMs); ln.stats.zaps++; ev(race, 'zap', i, now); return true;
    }
    if (W.tod === 'night' || W.wx === 'rain') { // tapping too fast in the dark or rain: trip
      ln.fastRun = interval < 1000 / a.tripTapsPerSec ? ln.fastRun + 1 : 0;
      if (ln.fastRun >= a.tripRun) { setPause(race, ln, now, 'trip', a.tripMs); ln.stats.trips++; ev(race, 'trip', i, now); return true; }
    } else ln.fastRun = 0;
  }
  const before = ln.q;
  ln.q = Math.min(1, ln.q + (ln.speed / 100) * ln.mult / c.stepsToGoal);
  if (race.weather && weatherAt(race, now).wx === 'rain') { // puddles at the SAME progress on every track
    const sp = weatherAt(race, now).idx;
    for (const [k, pq] of c.adult.puddleQs.entries()) {
      if (before < pq && ln.q >= pq && ln.puddles[`${sp}:${k}`] !== true) {
        ln.puddles[`${sp}:${k}`] = true; slideBack(ln, c.adult.puddleSlide); setPause(race, ln, now, 'slide', c.adult.puddleSlideMs);
        ln.stats.slides++; ev(race, 'puddle', i, now, { k }); return true;
      }
    }
  }
  if (ln.q >= 1 - 1e-9 && race.winner === null) {
    ln.q = 1; race.winner = i; race.phase = 'done'; race.endT = now; ev(race, 'finish', i, now);
  }
  return true;
}

// ---- hunters: walk only on free cells (never on a track, the goal, a button or the screen edge)
function moveToward(race, h, target, pxPerSec, dt) {
  const d = dist(h.pos, target); if (d < 0.5) return true;
  const stepLen = Math.min(d, pxPerSec * dt / 1000);
  const ux = (target.x - h.pos.x) / d, uy = (target.y - h.pos.y) / d;
  h.heading = h.heading + angDiff(Math.atan2(uy, ux), h.heading) * Math.min(1, dt / 120);
  const L = race.lay;
  const tryPos = (x, y) => (!blockedAt(L, x, y) ? (h.pos = { x, y }, true) : false);
  if (tryPos(h.pos.x + ux * stepLen, h.pos.y + uy * stepLen) || tryPos(h.pos.x + Math.sign(ux) * stepLen, h.pos.y) || tryPos(h.pos.x, h.pos.y + Math.sign(uy) * stepLen)) h.stuck = 0;
  else h.stuck += dt;
  return dist(h.pos, target) < 1.5;
}
function nextRoam(h, cv) {
  const R = cv.roam.length;
  if (h.roamIdx < 0) return Math.floor(h.rng() * R);
  const opts = []; for (let j = 0; j < R; j++) if (cv.adj[h.roamIdx][j]) opts.push(j);
  return opts.length ? opts[Math.floor(h.rng() * opts.length)] : -1; // -1 = back to the cover first
}
function setState(h, state, now, extra) { h.state = state; h.since = now; if (extra) Object.assign(h, extra); }
function dropTarget(race, h, now, why) {
  if (h.target == null) return;
  ev(race, 'lost', h.target, now, { hunter: h.id, why });
  h.target = null; h.cooldownUntil = now + race.cfg.hunterCooldownMs; h.roamIdx = -1; h.wp = null;
  setState(h, 'wander', now);
}
function spawnWave(race, wv, now) {
  for (const ln of race.lanes) {
    const cvi = race.lay.covers.findIndex((c) => c.owner === ln.i && c.band === wv.band); if (cvi < 0) continue;
    const cv = race.lay.covers[cvi];
    // a mirror image flips the turning direction (left↔right): look-around sweeps are mirrored too
    const flip = ln.geo.corner === 'br' || ln.geo.corner === 'tl' ? -1 : 1;
    const toTrack = Math.atan2(racerPos({ geo: ln.geo, q: cv.q }).y - cv.y, racerPos({ geo: ln.geo, q: cv.q }).x - cv.x);
    race.hunters.push({ id: race.nextId++, lane: ln.i, cover: cvi, wave: wv.k, rng: mulberry32(wv.seed), flip,
      pos: { x: cv.x, y: cv.y }, heading: toTrack, state: 'emerge', since: now, alpha: 0, roamIdx: -1, wp: null, pauseUntil: 0,
      target: null, aimStart: 0, nextAimAt: 0, cooldownUntil: now + 600, stuck: 0, shots: 0, lastShot: -1e9 });
  }
  ev(race, 'hunters', null, now, { wave: wv.k, n: race.lanes.length });
}
function babyAbsorbs(race, ln, now, h) {
  const b = ln.babies.pop(); if (!b) return false;
  race.babies--; ln.stats.babyShields++;
  const p = babyPos(race, ln, ln.babies.length);
  race.fx.push({ kind: 'poof', x: p.x, y: p.y, t: now });
  ev(race, 'baby-shot', ln.i, now, { hunter: h.id, baby: b.id });
  return true;
}
function shoot(race, h, ln, now) {
  const c = race.cfg; const p = racerPos(ln); const cone = inCone(race, h, p, now, c.interestKeep);
  const dmg = Math.round(shotDamage(c, cone.d, coneRange(race, now)) * (1 - ln.gentle) * 10) / 10;
  h.shots++; h.lastShot = now;
  race.fx.push({ kind: 'tracer', x0: h.pos.x, y0: h.pos.y, x: p.x, y: p.y, t: now, ms: c.tracerMs });
  if (babyAbsorbs(race, ln, now, h)) return;
  ln.health = Math.max(0, ln.health - dmg); ln.lastHit = now; ln.stats.hits++;
  ev(race, 'shot', ln.i, now, { hunter: h.id, dmg, d: Math.round(cone.d), health: ln.health });
  if (ln.health <= 0) { ln.stats.shot++; sendHome(race, ln, now, 'shot', { hunter: h.id, cause: 'hunter' }); }
}
function stepHunter(race, h, now, dt) {
  const c = race.cfg; const cv = race.lay.covers[h.cover]; const ln = race.lanes[h.lane];
  switch (h.state) {
    case 'emerge': // steps out of its tree / bush
      h.alpha = Math.min(1, (now - h.since) / 500);
      if (h.alpha >= 1) setState(h, 'wander', now);
      return;
    case 'wander': {
      if (now < h.pauseUntil) { h.heading += h.flip * Math.sin((now - h.since) / 260 + h.wave) * dt / 900; break; } // looking around
      if (!h.wp) {
        const j = nextRoam(h, cv);
        if (j < 0) { h.wp = { x: cv.x, y: cv.y }; h.roamIdx = -1; } else { h.roamIdx = j; h.wp = cv.roam[j]; }
      }
      if (moveToward(race, h, h.wp, c.wanderSpeed, dt) || h.stuck > 1500) { h.wp = null; h.stuck = 0; h.pauseUntil = now + rr(h.rng, c.pauseMs); }
      break;
    }
    case 'aim': { // laser on the target; shoot when the aim time is up; keep stalking closer meanwhile
      const p = racerPos(ln);
      h.heading = h.heading + angDiff(Math.atan2(p.y - h.pos.y, p.x - h.pos.x), h.heading) * Math.min(1, dt / 80);
      const cone = inCone(race, h, p, now, c.interestKeep);
      if (!isMoving(race, ln, now) || !cone.ok || race.phase !== 'race') { dropTarget(race, h, now, !isMoving(race, ln, now) ? 'hid' : 'left-cone'); break; }
      if (cone.d <= c.touchRange) { ln.stats.touched++; sendHome(race, ln, now, 'touched', { hunter: h.id, cause: 'hunter' }); break; }
      moveToward(race, h, p, c.stalkSpeed, dt);
      if (now >= h.nextAimAt && now - h.aimStart >= c.aimMs * (1 + ln.gentle)) {
        shoot(race, h, ln, now);
        if (h.target != null) { h.aimStart = now + c.shotGapMs; h.nextAimAt = now + c.shotGapMs; }
      }
      break;
    }
    default: break;
  }
  // spot: a wandering hunter sees its OWN racer only while that racer MOVES inside the spotlight cone
  if (h.state === 'wander' && h.target == null && now >= h.cooldownUntil && race.phase === 'race' && isMoving(race, ln, now)) {
    const p = racerPos(ln); const cone = inCone(race, h, p, now);
    if (cone.ok && ln.star && c.star?.luck > 0 && race.rng() < c.star.luck) { // v11 ⭐ luckier roll: this hunter looks away
      h.cooldownUntil = now + c.hunterCooldownMs; race.fx.push({ kind: 'star', x: p.x, y: p.y, t: now }); ev(race, 'star-luck', ln.i, now, { hunter: h.id });
    } else if (cone.ok) {
      h.target = ln.i; h.aimStart = now; h.nextAimAt = now; h.wp = null; setState(h, 'aim', now);
      ev(race, 'aim', ln.i, now, { hunter: h.id, d: Math.round(cone.d), ang: +cone.ang.toFixed(3), range: cone.range, half: +(c.coneHalfDeg * Math.PI / 180).toFixed(3) });
    }
  }
}

// ---- babies: follow their parent along its track (babyGap px apart); each one absorbs one shot
export function babyPos(race, ln, k) {
  const back = (race.cfg.babyGap * (k + 1)) / ln.geo.L;
  return trackPoint(ln.geo, Math.max(0, ln.disp - back));
}
function spawnBabies(race, a, b, at, now) {
  const c = race.cfg;
  // fair: BOTH lovers get a baby, or (cap reached) neither does
  if (race.babies + 2 > c.maxBabies) { ev(race, 'baby-capped', a.i, now, { with: b.i }); return; }
  for (const ln of [a, b]) { ln.babies.push({ id: race.nextId++, born: now }); race.babies++; }
  ev(race, 'baby', a.i, now, { with: b.i, x: at.x, y: at.y });
}

export function step(race, now) {
  const c = race.cfg;
  const dt = Math.min(64, Math.max(0, now - race.now)); race.now = now;
  // Adult: wind gusts push everybody back the same amount
  if (race.weather && race.phase === 'race') {
    for (const g of race.weather.gusts) if (!g.done && now >= g.t) {
      g.done = true; ev(race, 'gust', null, now);
      for (const ln of race.lanes) if (!ln.penalty) { slideBack(ln, c.adult.gustPush); ln.stats.gusts++; }
    }
  }
  // hunter waves (same moment for every track)
  if (race.phase === 'race') for (const wv of race.waves) {
    if (!wv.cued && now >= wv.t - c.hunterArriveCueMs) { wv.cued = true; ev(race, 'hunter-cue', null, now, { wave: wv.k, at: wv.t }); }
    if (!wv.done && now >= wv.t) { wv.done = true; spawnWave(race, wv, now); }
  }
  for (const ln of race.lanes) {
    if (ln.pause && now >= ln.pause.until) { ev(race, 'pauseEnd', ln.i, ln.pause.until, { kind: ln.pause.kind, ms: ln.pause.until - ln.pause.start }); ln.pause = null; }
    if (ln.penalty) {
      const e = now - ln.penalty.start; const { actionMs, restMs, returnMs } = c.penalty;
      ln.penalty.stage = e < actionMs ? 'action' : e < actionMs + restMs ? 'rest' : 'return';
      ln.disp = ln.penalty.stage === 'return' ? ln.penalty.fromQ * (1 - Math.min(1, (e - actionMs - restMs) / returnMs)) : ln.penalty.fromQ;
      if (e >= penaltyTotal(c)) {
        ev(race, 'penaltyEnd', ln.i, ln.penalty.start + penaltyTotal(c), { kind: ln.penalty.kind, ms: penaltyTotal(c) });
        ln.penalty = null; ln.disp = 0; ln.lastTap = -1e9;
      }
    } else {
      ln.disp += (ln.q - ln.disp) * (1 - Math.exp(-dt / c.smoothingMs));
      if (Math.abs(ln.q - ln.disp) < 0.0005) ln.disp = ln.q;
      // slow regeneration when not hit for a while
      if (ln.health < c.health && now - ln.lastHit >= c.regenDelayMs) ln.health = Math.min(c.health, ln.health + c.regenPerSec * dt / 1000);
    }
  }
  // racer meets racer at a crossing (both must be moving)
  if (race.phase === 'race') {
    const L = race.lanes;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j]; const key = `${i}-${j}`; const pr = race.pairs[key] || (race.pairs[key] = { touching: false, lastLove: -1e9 });
      const pa = racerPos(a), pb = racerPos(b); const d = dist(pa, pb);
      if (pr.touching) { if (d > c.crashDist * 1.6 || a.penalty || b.penalty) pr.touching = false; continue; }
      if (d > c.crashDist || a.penalty || b.penalty) continue;
      if (a.q < c.crashMinQ || b.q < c.crashMinQ || a.q > c.crashMaxQ || b.q > c.crashMaxQ) continue;
      if (!isMoving(race, a, now) || !isMoving(race, b, now)) continue;
      pr.touching = true;
      const at = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
      const out = crashOutcome(a, b);
      if (out === 'clash') {
        a.stats.clashes++; b.stats.clashes++;
        ev(race, 'clash', i, now, { with: j, x: at.x, y: at.y });
        for (const ln of [a, b]) sendHome(race, ln, now, 'clash', { cause: 'racer', with: ln === a ? j : i });
        race.fx.push({ kind: 'boom', x: at.x, y: at.y, t: now });
      } else if (out === 'love') {
        if (now - pr.lastLove >= c.loveCooldownMs) {
          pr.lastLove = now; a.stats.loves++; b.stats.loves++;
          ev(race, 'love', i, now, { with: j, x: at.x, y: at.y });
          race.fx.push({ kind: 'hearts', x: at.x, y: at.y, t: now });
          spawnBabies(race, a, b, at, now);
        } else ev(race, 'love-cooldown', i, now, { with: j, left: c.loveCooldownMs - (now - pr.lastLove) });
      } else ev(race, 'pass', i, now, { with: j });
    }
  }
  for (const h of race.hunters) stepHunter(race, h, now, dt);
  if (race.fx.length) race.fx = race.fx.filter((f) => now - f.t < (f.kind === 'tracer' ? f.ms : f.kind === 'poof' ? c.poofMs : c.heartsMs));
}

// Ranking: winner first, then by distance travelled. Equal distance shares a place. Last place (all tied) drinks.
export function rank(race) {
  const key = (l) => (l.i === race.winner ? Infinity : Math.round(l.q * 1e6));
  const order = race.lanes.map((l) => ({ i: l.i, name: l.name, steps: key(l), pct: l.i === race.winner ? 100 : Math.round(l.q * 100) }))
    .sort((a, b) => b.steps - a.steps);
  let place = 0, prev = null;
  order.forEach((o, idx) => { if (o.steps !== prev) { place = idx + 1; prev = o.steps; } o.place = place; });
  const others = order.filter((o) => o.i !== race.winner);
  const min = Math.min(...others.map((o) => o.steps));
  const drinkers = others.filter((o) => o.steps === min).map((o) => o.name);
  return { order, winner: race.lanes[race.winner]?.name ?? null, drinkers };
}
