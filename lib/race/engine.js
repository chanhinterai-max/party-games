// ANIMAL RACE ENGINE — pure logic, no DOM. Runs on the phone inside requestAnimationFrame (and in node tests).
// Time `now` = ms since GO. Everything that matters for fairness is the same for every racer (see config.js).
import { RACE, penaltyTotal, clampSpeed } from './config.js';
import { trackPoint, blockedAt, segClear } from './geometry.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rr = (rng, [a, b]) => a + rng() * (b - a);
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Who bothers whom: wild predators bother prey, wild prey bother predators, both bother the Human.
export const bothers = (wildType, role) => role === 'human' || (wildType === 'predator' ? role === 'prey' : role === 'predator');
export function penaltyKind(role, wildType) {
  if (role === 'prey') return 'eaten';
  if (role === 'predator') return 'feast';
  return wildType === 'predator' ? 'caught' : 'distracted';
}
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

// racers: [{ name, role, emoji, gender, speed }]; wild: { predator: [{emoji, speed}], prey: [...] }
export function createRace({ racers, lay, cfg = RACE, rng = Math.random, wild }) {
  const lanes = racers.map((r, i) => ({
    i, name: r.name, role: r.role, emoji: r.emoji, gender: r.gender, speed: clampSpeed(r.speed ?? 100, cfg),
    geo: lay.lanes[i], q: 0, disp: 0, lastTap: -1e9, prevTap: -1e9, taps: 0, fastRun: 0,
    penalty: null, pause: null, chasedBy: null, puddles: {},
    stats: { caught: 0, clashes: 0, loves: 0, trips: 0, zaps: 0, slides: 0, gusts: 0, kinds: [] },
  }));
  const race = { cfg, lay, rng, lanes, wilds: [], pairs: {}, babies: 0, events: [], fx: [], now: 0, phase: 'race', winner: null,
    weather: cfg.mode === 'adult' ? makeWeather(cfg, rng) : null, nextId: 1 };
  // one wild animal per cover; its type bothers the cover's owner (Human: alternating by band → both types)
  const pick = (type, used) => {
    const list = (wild?.[type] || []).filter((x) => x && x.emoji);
    const free = list.filter((x) => !used.has(x.emoji));
    const src = free.length ? free : list.length ? list : [{ emoji: type === 'predator' ? '🐺' : '🐰', speed: 100 }];
    const c = src[Math.floor(rng() * src.length)]; used.add(c.emoji); return c;
  };
  const used = new Set();
  const bandSeeds = (lay.covers || []).map(() => Math.floor(rng() * 2 ** 31));
  (lay.covers || []).forEach((cv, ci) => {
    const role = lanes[cv.owner]?.role;
    const type = role === 'prey' ? 'predator' : role === 'predator' ? 'prey' : cv.band % 2 ? 'prey' : 'predator';
    const a = pick(type, used);
    // all covers of a band share one seed → mirrored animals follow the same schedule (until a chase)
    addWild(race, { type, emoji: a.emoji, speed: clampSpeed(a.speed ?? 100, cfg), cover: ci, baby: false, seed: bandSeeds[cv.band] });
  });
  return race;
}

function addWild(race, o) {
  const cv = race.lay.covers[o.cover];
  const w = { id: race.nextId++, type: o.type, emoji: o.emoji, speed: o.speed, baby: o.baby, cover: o.cover, rng: mulberry32(o.seed),
    pos: o.pos ? { ...o.pos } : { x: cv.x, y: cv.y }, heading: -Math.PI / 2, state: o.pos ? 'return' : 'home', since: 0,
    until: 0, target: null, roamIdx: -1, outUntil: 0, pauseUntil: 0, interest: null, cooldownUntil: 0, stuck: 0, alpha: o.pos ? 1 : 0 };
  if (!o.pos) w.until = Math.round(rr(w.rng, race.cfg.restMs));
  race.wilds.push(w);
  return w;
}

const ev = (race, type, lane, t, extra) => { race.events.push({ type, lane, t, ...extra }); };
export const racerPos = (ln) => trackPoint(ln.geo, ln.q);
export const isMoving = (race, ln, now) => !ln.penalty && !ln.pause && now - ln.lastTap < race.cfg.stopMs;
const coneRange = (race, now) => (race.weather && weatherAt(race, now).tod === 'night' ? race.cfg.coneRangeNight : race.cfg.coneRange);
export function inCone(race, w, p, now, keep = 1) {
  const d = dist(w.pos, p); const range = coneRange(race, now) * keep;
  const ang = Math.abs(angDiff(Math.atan2(p.y - w.pos.y, p.x - w.pos.x), w.heading));
  return { ok: d <= range && ang <= (race.cfg.coneHalfDeg * Math.PI / 180) * keep, d, ang, range };
}

function setPause(race, ln, now, kind, ms) { ln.pause = { kind, start: now, until: now + ms }; ln.fastRun = 0; }
function slideBack(ln, dq) { ln.q = Math.max(0, ln.q - dq); }
function sendHome(race, ln, now, kind, extra = {}) {
  ln.penalty = { start: now, kind, fromQ: ln.disp, stage: 'action' };
  ln.q = 0; ln.pause = null; ln.fastRun = 0;
  ln.stats.kinds.push(kind);
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
  ln.q = Math.min(1, ln.q + ln.speed / 100 / c.stepsToGoal);
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

// ---- wild animal movement: never steps into a blocked cell (tracks, goal, buttons, edge)
function moveToward(race, w, target, pxPerSec, dt) {
  const d = dist(w.pos, target); if (d < 0.5) return true;
  const stepLen = Math.min(d, pxPerSec * dt / 1000);
  const ux = (target.x - w.pos.x) / d, uy = (target.y - w.pos.y) / d;
  w.heading = w.heading + angDiff(Math.atan2(uy, ux), w.heading) * Math.min(1, dt / 120);
  const L = race.lay;
  const tryPos = (x, y) => (!blockedAt(L, x, y) ? (w.pos = { x, y }, true) : false);
  if (tryPos(w.pos.x + ux * stepLen, w.pos.y + uy * stepLen) || tryPos(w.pos.x + Math.sign(ux) * stepLen, w.pos.y) || tryPos(w.pos.x, w.pos.y + Math.sign(uy) * stepLen)) { w.stuck = 0; }
  else w.stuck += dt;
  return dist(w.pos, target) < 1.5;
}
function nextRoam(race, w) {
  const cv = race.lay.covers[w.cover]; const R = cv.roam.length;
  if (w.roamIdx < 0) return Math.floor(w.rng() * R);
  const opts = []; for (let j = 0; j < R; j++) if (cv.adj[w.roamIdx][j]) opts.push(j);
  return opts.length ? opts[Math.floor(w.rng() * opts.length)] : -1; // -1 = go home first
}
function wildSet(race, w, state, now, extra) { w.state = state; w.since = now; if (extra) Object.assign(w, extra); }
function loseInterest(race, w, now, why) {
  const ln = w.interest != null ? race.lanes[w.interest] : null;
  if (ln && ln.chasedBy === w.id) ln.chasedBy = null;
  ev(race, 'lost', w.interest, now, { wild: w.id, why });
  w.interest = null; w.cooldownUntil = now + race.cfg.wildCooldownMs; w.roamIdx = -1;
  wildSet(race, w, 'return', now);
}

function stepWild(race, w, now, dt) {
  const c = race.cfg; const cv = race.lay.covers[w.cover]; const sp = w.speed / 100;
  switch (w.state) {
    case 'home':
      w.alpha = 0;
      if (now >= w.until) { w.roamIdx = -1; wildSet(race, w, 'out', now, { outUntil: now + rr(w.rng, c.outMs), target: null, alpha: 1 }); ev(race, 'out', null, now, { wild: w.id }); }
      break;
    case 'out': {
      w.alpha = Math.min(1, w.alpha + dt / 250);
      if (now >= w.outUntil) { wildSet(race, w, 'return', now); break; }
      if (now < w.pauseUntil) { w.heading += Math.sin(now / 260 + w.id) * dt / 900; break; } // looking around
      if (!w.target) {
        const j = nextRoam(race, w);
        if (j < 0) { wildSet(race, w, 'return', now); break; }
        w.roamIdx = j; w.target = cv.roam[j];
      }
      if (moveToward(race, w, w.target, c.wanderSpeed * sp, dt)) { w.target = null; w.pauseUntil = now + 500 + w.rng() * 900; }
      break;
    }
    case 'return': {
      const home = { x: cv.x, y: cv.y };
      if (!w.target || w.target === 'home') {
        if (segClear(race.lay, w.pos, home)) w.target = 'home';
        else { // walk to a roam point that has a clear line home
          let best = null, bd = 1e9; for (const p of cv.roam) { const d = dist(p, w.pos); if (d < bd && segClear(race.lay, w.pos, p)) { bd = d; best = p; } }
          w.target = best || 'home';
        }
      }
      const tgt = w.target === 'home' ? home : w.target;
      if (moveToward(race, w, tgt, c.wanderSpeed * sp * 1.3, dt) || w.stuck > 1500) {
        if (w.target === 'home' || w.stuck > 1500) {
          w.pos = home; w.target = null; w.stuck = 0; w.roamIdx = -1;
          wildSet(race, w, 'home', now, { until: now + rr(w.rng, c.restMs) }); ev(race, 'home', null, now, { wild: w.id });
        } else w.target = 'home';
      }
      break;
    }
    case 'question': case 'approach': case 'sprint': {
      const ln = race.lanes[w.interest]; const p = racerPos(ln);
      w.heading = w.heading + angDiff(Math.atan2(p.y - w.pos.y, p.x - w.pos.x), w.heading) * Math.min(1, dt / 90);
      const cone = inCone(race, w, p, now, c.interestKeep);
      if (!isMoving(race, ln, now) || !cone.ok || race.phase !== 'race') { loseInterest(race, w, now, !isMoving(race, ln, now) ? 'stopped' : 'left-cone'); break; }
      const e = now - w.since;
      if (w.state === 'question') { if (e >= c.questionMs) { wildSet(race, w, 'approach', now); ev(race, 'approach', ln.i, now, { wild: w.id }); } }
      else if (w.state === 'approach') { moveToward(race, w, p, c.approachSpeed * sp, dt); if (e >= c.approachMs) { wildSet(race, w, 'sprint', now); ev(race, 'sprint', ln.i, now, { wild: w.id }); } }
      else {
        moveToward(race, w, p, c.sprintSpeed * sp, dt);
        if (e >= c.sprintMs) {
          if (dist(w.pos, p) <= c.contactRange) {
            ln.chasedBy = null; ln.stats.caught++;
            sendHome(race, ln, now, penaltyKind(ln.role, w.type), { wild: w.type, wid: w.id, cause: 'wild' });
            w.interest = null; wildSet(race, w, 'feast', now);
          } else loseInterest(race, w, now, 'too-far');
        }
      }
      break;
    }
    case 'feast':
      if (now - w.since >= c.penalty.actionMs) { w.cooldownUntil = now + c.wildCooldownMs; w.roamIdx = -1; wildSet(race, w, 'return', now, { target: null }); }
      break;
    default: break;
  }
  // notice: only wandering animals, only a MOVING racer they bother, only inside the vision cone
  if ((w.state === 'out' || w.state === 'return') && w.alpha > 0.5 && now >= w.cooldownUntil && race.phase === 'race') {
    for (const ln of race.lanes) {
      if (ln.chasedBy || !bothers(w.type, ln.role) || !isMoving(race, ln, now)) continue;
      const p = racerPos(ln); const cone = inCone(race, w, p, now);
      if (cone.ok) {
        w.interest = ln.i; ln.chasedBy = w.id; w.target = null; wildSet(race, w, 'question', now);
        ev(race, 'question', ln.i, now, { wild: w.id, wtype: w.type, d: Math.round(cone.d), ang: +cone.ang.toFixed(3), range: cone.range, half: +(c.coneHalfDeg * Math.PI / 180).toFixed(3) });
        break;
      }
    }
  }
}

function spawnBaby(race, a, b, at, now) {
  const c = race.cfg;
  if (race.babies >= c.maxBabies || race.wilds.length >= c.maxWild) { ev(race, 'baby-capped', a.i, now, { with: b.i }); return null; }
  const parent = race.rng() < 0.5 ? a : b;
  // pop out at the nearest clear spot beside the crossing (never on a track)
  let spot = null;
  for (let r = 8; r <= 90 && !spot; r += 6) for (let k = 0; k < 16; k++) { const t = (k / 16) * Math.PI * 2; const p = { x: at.x + Math.cos(t) * r, y: at.y + Math.sin(t) * r }; if (!blockedAt(race.lay, p.x, p.y)) { spot = p; break; } }
  if (!spot) return null;
  let ci = 0, bd = 1e9; race.lay.covers.forEach((cv, i) => { const d = dist(cv, spot); if (d < bd) { bd = d; ci = i; } });
  race.babies++;
  const w = addWild(race, { type: parent.role, emoji: parent.emoji, speed: parent.speed, cover: ci, baby: true, seed: Math.floor(race.rng() * 2 ** 31), pos: spot });
  w.cooldownUntil = now + 1500; // a newborn takes a moment before it hunts
  ev(race, 'baby', a.i, now, { with: b.i, wild: w.id, wtype: w.type, emoji: w.emoji });
  return w;
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
        for (const ln of [a, b]) { if (ln.chasedBy) { const w = race.wilds.find((x) => x.id === ln.chasedBy); if (w) loseInterest(race, w, now, 'clash'); } sendHome(race, ln, now, 'clash', { cause: 'racer', with: ln === a ? j : i }); }
        race.fx.push({ kind: 'boom', x: at.x, y: at.y, t: now });
      } else if (out === 'love') {
        if (now - pr.lastLove >= c.loveCooldownMs) {
          pr.lastLove = now; a.stats.loves++; b.stats.loves++;
          ev(race, 'love', i, now, { with: j, x: at.x, y: at.y });
          race.fx.push({ kind: 'hearts', x: at.x, y: at.y, t: now });
          spawnBaby(race, a, b, at, now);
        } else ev(race, 'love-cooldown', i, now, { with: j, left: c.loveCooldownMs - (now - pr.lastLove) });
      } else ev(race, 'pass', i, now, { with: j });
    }
  }
  for (const w of race.wilds) stepWild(race, w, now, dt);
  if (race.fx.length) race.fx = race.fx.filter((f) => now - f.t < c.heartsMs);
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
