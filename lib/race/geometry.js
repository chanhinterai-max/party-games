// Animal Race board geometry: equal straight lanes from the corners to one goal in the centre.
import { RACE } from './config.js';

const CORNERS = ['bl', 'tr', 'br', 'tl']; // 2 racers sit opposite; 3-4 fill the other corners
export const cornersFor = (n) => CORNERS.slice(0, n);

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const len = (a) => Math.hypot(a.x, a.y);
export function distToSeg(p, a, b) {
  const ab = sub(b, a); const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / (ab.x ** 2 + ab.y ** 2 || 1)));
  return len(sub(p, add(a, mul(ab, t))));
}

export function layout(w, h, n, cfg = RACE) {
  const goal = { x: w / 2, y: h / 2 };
  const bR = cfg.buttonSize / 2, m = bR + 10;
  const pos = { bl: { x: m, y: h - m }, br: { x: w - m, y: h - m }, tl: { x: m, y: m }, tr: { x: w - m, y: m } };
  const corners = cornersFor(n);
  const raw = corners.map((c) => { const btn = pos[c]; const v = sub(goal, btn); const d = len(v); return { corner: c, btn, dir: mul(v, 1 / d), d }; });
  const L = Math.max(60, Math.min(...raw.map((r) => r.d)) - bR - 16 - cfg.goalRadius);
  const lanes = raw.map((r) => {
    const end = sub(goal, mul(r.dir, cfg.goalRadius));
    const start = sub(end, mul(r.dir, L));
    return { corner: r.corner, btn: r.btn, dir: r.dir, normal: { x: -r.dir.y, y: r.dir.x }, start, end, L, rot: r.corner[0] === 't' ? 180 : 0 };
  });
  const lay = { w, h, goal, lanes, L, bR };
  lanes.forEach((ln, i) => { ln.sides = { 1: clearRange(lay, i, 1, cfg), [-1]: clearRange(lay, i, -1, cfg) }; });
  return lay;
}

export const lanePoint = (ln, q, side = 0, off = 0) => ({
  x: ln.start.x + ln.dir.x * q * ln.L + ln.normal.x * side * off,
  y: ln.start.y + ln.dir.y * q * ln.L + ln.normal.y * side * off,
});

// Is a wild animal centred at p clear of every lane band, the goal, the buttons and the screen edge?
export function wildClear(lay, p, cfg = RACE, margin = 0) {
  const r = cfg.wildRadius + margin;
  if (p.x < r || p.y < r || p.x > lay.w - r || p.y > lay.h - r) return false;
  if (len(sub(p, lay.goal)) < cfg.goalRadius + r) return false;
  for (const ln of lay.lanes) {
    if (distToSeg(p, ln.start, ln.end) < cfg.laneHalfWidth + r) return false;
    if (len(sub(p, ln.btn)) < lay.bR + r) return false;
  }
  return true;
}

// Largest contiguous progress range [lo, hi] where the whole strip between contactOffset and spawnOffset on
// this side is clear. Wild animals only move inside that strip, so they never touch any lane.
function clearRange(lay, i, side, cfg) {
  const ln = lay.lanes[i];
  let best = null, cur = null;
  for (let k = 0; k <= 100; k++) {
    const q = k / 100;
    let ok = true;
    for (let off = cfg.contactOffset; off <= cfg.spawnOffset + 0.1 && ok; off += 4) ok = wildClear(lay, lanePoint(ln, q, side, off), cfg, 2);
    if (ok) { cur = cur ? { lo: cur.lo, hi: q } : { lo: q, hi: q }; if (!best || cur.hi - cur.lo > best.hi - best.lo) best = { ...cur }; }
    else cur = null;
  }
  return best; // null = no safe strip on this side
}
