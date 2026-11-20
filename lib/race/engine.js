// ANIMAL RACE ENGINE — pure logic, no DOM. Runs on the phone inside requestAnimationFrame (and in node tests).
// Time `now` = ms since GO. All roles share the same timings (see config.js).
import { RACE, penaltyTotal } from './config.js';
import { lanePoint } from './geometry.js';

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const rr = (rng, [a, b]) => a + rng() * (b - a);

// Which wild animals bother a racer: wild predators bother prey, wild prey bother predators, both bother the Human.
export function wildTypesFor(role, count, rng) {
  if (role === 'prey') return Array(count).fill('predator');
  if (role === 'predator') return Array(count).fill('prey');
  // Human: split between both types (same total); an odd extra goes to a random type.
  const half = Math.floor(count / 2), extra = count % 2 ? (rng() < 0.5 ? 'predator' : 'prey') : null;
  const list = [...Array(half).fill('predator'), ...Array(half).fill('prey'), ...(extra ? [extra] : [])];
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}
export function penaltyKind(role, wildType) {
  if (role === 'prey') return 'eaten';
  if (role === 'predator') return 'feast';
  return wildType === 'predator' ? 'caught' : 'distracted';
}

// racers: [{ name, role, emoji }]; wild: { predator: [emoji], prey: [emoji] }
export function createRace({ racers, lay, cfg = RACE, rng = Math.random, wild }) {
  const times = [];
  let t = rr(rng, cfg.firstDisruptionMs);
  for (let k = 0; k < cfg.disruptions; k++) { times.push(Math.round(t)); t += rr(rng, cfg.disruptionGapMs); }
  const lanes = racers.map((r, i) => ({
    i, ...r, geo: lay.lanes[i], steps: 0, disp: 0, lastTap: -1e9, prevTap: -1e9, taps: 0,
    penalty: null, wild: null,
    plan: wildTypesFor(r.role, cfg.disruptions, rng).map((type, k) => ({
      type, jitter: Math.round(rng() * cfg.noticeJitterMs),
      emoji: (wild?.[type]?.length ? wild[type][Math.floor(rng() * wild[type].length)] : type === 'predator' ? '🐺' : '🐰'),
      k,
    })),
    stats: { spawned: 0, caught: 0, escaped: 0, kinds: [] },
  }));
  return { cfg, lay, rng, lanes, times, next: 0, phase: 'race', winner: null, events: [], now: 0 };
}

export const isMoving = (race, ln, now) => !ln.penalty && now - ln.lastTap < race.cfg.stopMs;

export function tap(race, i, now) {
  const ln = race.lanes[i];
  if (!ln || race.phase !== 'race' || ln.penalty) return false;
  if (now - ln.prevTap < 1000 / race.cfg.maxTapsPerSec) return false;
  ln.prevTap = now; ln.lastTap = now; ln.taps++;
  ln.steps = Math.min(race.cfg.stepsToGoal, ln.steps + 1);
  if (ln.steps >= race.cfg.stepsToGoal && !race.winner) {
    race.winner = i; race.phase = 'done'; race.endT = now;
    race.events.push({ type: 'finish', lane: i, t: now });
  }
  return true;
}

const ev = (race, type, lane, t, extra) => race.events.push({ type, lane, t, ...extra });

function sideFor(ln, q, rng) {
  const ok = [1, -1].filter((s) => ln.geo.sides[s]);
  const inside = ok.filter((s) => q >= ln.geo.sides[s].lo && q <= ln.geo.sides[s].hi);
  const pool = inside.length ? inside : ok;
  return pool.length ? pool[Math.floor(rng() * pool.length)] : 1;
}
const clampQ = (rng, q) => Math.max(rng.lo, Math.min(rng.hi, q));
const qOf = (race, ln) => ln.steps / race.cfg.stepsToGoal;

function target(race, ln, w) {
  return lanePoint(ln.geo, clampQ(ln.geo.sides[w.side] || { lo: 0, hi: 1 }, qOf(race, ln)), w.side, race.cfg.contactOffset);
}

function spawn(race, ln, k, now) {
  const p = ln.plan[k];
  const side = sideFor(ln, qOf(race, ln), race.rng);
  const range = ln.geo.sides[side] || { lo: 0, hi: 1 };
  const q = clampQ(range, qOf(race, ln) + 0.06);
  ln.wild = { k, type: p.type, emoji: p.emoji, side, phase: 'appear', since: now, until: now + p.jitter,
    pos: lanePoint(ln.geo, q, side, race.cfg.spawnOffset), from: null, alpha: 1 };
  ln.stats.spawned++;
  ev(race, 'spawn', ln.i, now, { wild: p.type });
}

function setPhase(race, ln, phase, now) {
  const w = ln.wild; w.phase = phase; w.since = now; w.from = { ...w.pos };
  ev(race, phase, ln.i, now, { wild: w.type });
}

export function step(race, now) {
  const c = race.cfg;
  const dtVis = Math.max(0, now - race.now); race.now = now;
  if (race.phase === 'race') {
    while (race.next < race.times.length && now >= race.times[race.next]) {
      const k = race.next++;
      for (const ln of race.lanes) {
        if (ln.wild && ln.wild.phase !== 'leave') ev(race, 'replaced', ln.i, now);
        spawn(race, ln, k, now); // every lane spawns at the same moment: equal counts by construction
      }
    }
  }
  for (const ln of race.lanes) {
    // penalty (same total for every kind)
    if (ln.penalty) {
      const e = now - ln.penalty.start;
      const { actionMs, restMs, returnMs } = c.penalty;
      ln.penalty.stage = e < actionMs ? 'action' : e < actionMs + restMs ? 'rest' : 'return';
      ln.disp = ln.penalty.stage === 'return' ? ln.penalty.fromQ * (1 - Math.min(1, (e - actionMs - restMs) / returnMs)) : ln.penalty.fromQ;
      if (e >= penaltyTotal(c)) {
        ev(race, 'penaltyEnd', ln.i, ln.penalty.start + penaltyTotal(c), { kind: ln.penalty.kind, ms: penaltyTotal(c) });
        ln.penalty = null; ln.disp = 0; ln.lastTap = -1e9;
      }
    } else {
      const tq = qOf(race, ln);
      ln.disp += (tq - ln.disp) * (1 - Math.exp(-dtVis / c.smoothingMs));
      if (Math.abs(tq - ln.disp) < 0.0005) ln.disp = tq;
    }
    const w = ln.wild;
    if (!w) continue;
    if (race.phase !== 'race' && w.phase !== 'leave' && w.phase !== 'feast') { setPhase(race, ln, 'leave', now); }
    const e = now - w.since;
    const moving = isMoving(race, ln, now);
    switch (w.phase) {
      case 'appear': if (now >= w.until) setPhase(race, ln, 'lurk', now); break;
      case 'lurk':
        if (ln.penalty) { if (e >= c.lurkMs) { setPhase(race, ln, 'leave', now); ln.stats.escaped++; } break; }
        if (moving) setPhase(race, ln, 'question', now);
        else if (e >= c.lurkMs) { setPhase(race, ln, 'leave', now); ln.stats.escaped++; }
        break;
      case 'question':
        if (!moving) { setPhase(race, ln, 'leave', now); ln.stats.escaped++; }
        else if (e >= c.questionMs) setPhase(race, ln, 'approach', now);
        break;
      case 'approach':
        if (!moving) { setPhase(race, ln, 'leave', now); ln.stats.escaped++; break; }
        w.pos = lerp(w.from, target(race, ln, w), c.approachFrac * easeOut(Math.min(1, e / c.approachMs)));
        if (e >= c.approachMs) setPhase(race, ln, 'sprint', now);
        break;
      case 'sprint':
        if (!moving) { setPhase(race, ln, 'leave', now); ln.stats.escaped++; break; }
        w.pos = lerp(w.from, target(race, ln, w), Math.min(1, e / c.sprintMs));
        if (e >= c.sprintMs) {
          const kind = penaltyKind(ln.role, w.type);
          ln.penalty = { start: now, kind, fromQ: ln.disp, stage: 'action' };
          ln.steps = 0; // logically back at the start (ranking uses this)
          ln.stats.caught++; ln.stats.kinds.push(kind);
          ev(race, 'caught', ln.i, now, { kind, wild: w.type });
          setPhase(race, ln, 'feast', now);
        }
        break;
      case 'feast': // wild stays for the action part of the penalty, then wanders off
        if (e >= c.penalty.actionMs) setPhase(race, ln, 'leave', now);
        break;
      case 'leave': {
        // fades and shrinks where it stands (it never moves outside its safe strip, so never onto a lane)
        w.alpha = Math.max(0, 1 - e / c.leaveMs);
        if (e >= c.leaveMs) { ln.wild = null; ev(race, 'gone', ln.i, now); }
        break;
      }
    }
  }
}

// Ranking: winner first, then by steps (distance to goal). Equal steps share a place. Last place (all tied) drinks.
export function rank(race) {
  const order = race.lanes.map((l) => ({ i: l.i, name: l.name, steps: l.i === race.winner ? Infinity : l.steps }))
    .sort((a, b) => b.steps - a.steps);
  let place = 0, prev = null;
  order.forEach((o, idx) => { if (o.steps !== prev) { place = idx + 1; prev = o.steps; } o.place = place; });
  const others = order.filter((o) => o.i !== race.winner);
  const min = Math.min(...others.map((o) => o.steps));
  const drinkers = others.filter((o) => o.steps === min).map((o) => o.name);
  return { order, winner: race.lanes[race.winner]?.name ?? null, drinkers };
}
