// ANIMAL RACE MAP: random curvy tracks (one per racer, all EXACTLY the same arc length, each crossing another),
// a keep-off grid (wild animals can never stand on a track, the goal or a button), and trees/bushes placed
// fairly: every track gets the same number of covers at the same progress bands and distance range.
import { RACE } from './config.js';

// Corner seats. Tracks are MIRROR IMAGES of one random curve (bl), so every racer gets exactly the same length,
// curvature and crossing distances: br = mirror left↔right, tl = mirror top↔bottom, tr = both.
const CORNERS = ['bl', 'br', 'tl', 'tr'];
export const cornersFor = (n) => CORNERS.slice(0, n);
const MIRROR = { bl: (p) => p, br: (p, w) => ({ x: w - p.x, y: p.y }), tl: (p, w, h) => ({ x: p.x, y: h - p.y }), tr: (p, w, h) => ({ x: w - p.x, y: h - p.y }) };
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const len = (a) => Math.hypot(a.x, a.y);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function distToSeg(p, a, b) {
  const ab = sub(b, a); const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / (ab.x ** 2 + ab.y ** 2 || 1)));
  return len(sub(p, add(a, mul(ab, t))));
}

const polyLen = (d) => { let s = 0; for (let i = 1; i < d.length; i++) s += dist(d[i - 1], d[i]); return s; };
// Resample a dense polyline to N+1 points at EXACTLY equal arc steps (length L = polyLen(dense)).
function resample(d, N) {
  const cum = [0]; for (let i = 1; i < d.length; i++) cum.push(cum[i - 1] + dist(d[i - 1], d[i]));
  const L = cum[cum.length - 1]; const out = []; let j = 1;
  for (let k = 0; k <= N; k++) {
    const s = (k / N) * L;
    while (j < cum.length - 1 && cum[j] < s) j++;
    const t = (s - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1);
    out.push({ x: d[j - 1].x + (d[j].x - d[j - 1].x) * t, y: d[j - 1].y + (d[j].y - d[j - 1].y) * t });
  }
  return { pts: out, L };
}
// Point + tangent at progress q (0..1) along a track
export function trackPoint(tr, q) {
  const N = tr.pts.length - 1; const f = Math.max(0, Math.min(1, q)) * N; const i = Math.min(N - 1, Math.floor(f)); const t = f - i;
  const a = tr.pts[i], b = tr.pts[i + 1];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, tx: (b.x - a.x), ty: (b.y - a.y) };
}
function segX(a, b, c, d) { // segment intersection → [t,u] or null
  const r = sub(b, a), s = sub(d, c); const den = r.x * s.y - r.y * s.x; if (Math.abs(den) < 1e-9) return null;
  const ca = sub(c, a); const t = (ca.x * s.y - ca.y * s.x) / den, u = (ca.x * r.y - ca.y * r.x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
}
export function crossingsOf(A, B, cfg = RACE) {
  const out = []; const N = A.pts.length - 1, M = B.pts.length - 1;
  for (let i = 0; i < N; i++) {
    const a = A.pts[i], b = A.pts[i + 1];
    const minx = Math.min(a.x, b.x), maxx = Math.max(a.x, b.x), miny = Math.min(a.y, b.y), maxy = Math.max(a.y, b.y);
    for (let j = 0; j < M; j++) {
      const c = B.pts[j], d = B.pts[j + 1];
      if (Math.max(c.x, d.x) < minx || Math.min(c.x, d.x) > maxx || Math.max(c.y, d.y) < miny || Math.min(c.y, d.y) > maxy) continue;
      const x = segX(a, b, c, d); if (!x) continue;
      const qa = (i + x[0]) / N, qb = (j + x[1]) / M;
      const r = sub(b, a), s = sub(d, c);
      const ang = Math.abs(Math.asin(Math.max(-1, Math.min(1, (r.x * s.y - r.y * s.x) / (len(r) * len(s) || 1))))) * 180 / Math.PI;
      out.push({ qa, qb, x: a.x + r.x * x[0], y: a.y + r.y * x[0], ang, inZone: qa >= cfg.crossZone[0] && qa <= cfg.crossZone[1] && qb >= cfg.crossZone[0] && qb <= cfg.crossZone[1] });
    }
  }
  return out;
}

// One track = the straight chord S→E bent sideways by smooth sine terms (zero at both ends). The first terms are
// solved so the track passes EXACTLY through its crossing points ("vias", shared with another racer's track);
// extra wiggle terms vanish at the vias and are scaled by A. Length grows with A → bisection hits Lt exactly.
function solve(M, y) { // tiny Gaussian elimination (m <= 3)
  const n = y.length; const A = M.map((r, i) => [...r, y[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; if (Math.abs(A[c][c]) < 1e-9) return null;
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
  }
  return A.map((r, i) => r[n] / r[i]);
}
function trackFamily(S, E, vias, rng, samples = 360) {
  // p(t) = S + (E-S)·t + Σ a_k·sin(kπt) (+ A·free wiggles that vanish at the vias); p(t_k) = via_k exactly.
  const m = vias.length; const sn = (k, t) => Math.sin(k * Math.PI * t);
  const ts = m === 1 ? [0.4 + rng() * 0.3] : m === 2 ? [0.28 + rng() * 0.14, 0.58 + rng() * 0.16] : [];
  const lin = (t) => ({ x: S.x + (E.x - S.x) * t, y: S.y + (E.y - S.y) * t });
  const M = ts.map((t) => Array.from({ length: m }, (_, k) => sn(k + 1, t)));
  let ax = [], ay = [];
  if (m) { ax = solve(M, vias.map((X, i) => X.x - lin(ts[i]).x)); ay = solve(M, vias.map((X, i) => X.y - lin(ts[i]).y)); if (!ax || !ay) return null; }
  const bases = [0, 1, 2].map((j) => { const k = m + 1 + j; const b = m ? solve(M, ts.map((t) => sn(k, t))) : []; return b && { k, b }; });
  if (bases.some((f) => !f)) return null;
  let fr = [];
  const v = sub(E, S); const cl = len(v); const nr = { x: -v.y / cl, y: v.x / cl };
  const build = (A) => {
    const out = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples; const p = lin(t);
      for (let k = 0; k < m; k++) { const sk = sn(k + 1, t); p.x += ax[k] * sk; p.y += ay[k] * sk; }
      for (const f of fr) { let h = sn(f.k, t); for (let k = 0; k < m; k++) h -= f.b[k] * sn(k + 1, t); p.x += A * f.c * h * nr.x; p.y += A * f.c * h * nr.y; }
      out.push(p);
    }
    return out;
  };
  const L0 = polyLen(build(0));
  const fit = (free, Lt) => {
    fr = free.map((c, j) => ({ c, ...bases[j] }));
    if (L0 > Lt) return null;
    let lo = 0, hi = 30; while (polyLen(build(hi)) < Lt && hi < 5000) hi *= 2; if (polyLen(build(hi)) < Lt) return null;
    for (let k = 0; k < 48; k++) { const mid = (lo + hi) / 2; if (polyLen(build(mid)) < Lt) lo = mid; else hi = mid; }
    return build((lo + hi) / 2);
  };
  return { L0, fit };
}
// Public entry: never returns null. Portrait is generated directly; landscape is generated in portrait and
// rotated. Each pass relaxes a little (shorter tracks, wider cover band) if the screen is tight.
export function layout(w, h, n, cfg = RACE, rng = Math.random) {
  if (w > h) { const p = layout(h, w, n, cfg, rng); return rotateLayout(p, w, h, cfg); }
  const passes = [cfg,
    { ...cfg, coverOffset: [cfg.coverOffset[0] - 4, cfg.coverOffset[1] + 14], trackTries: 300 },
    { ...cfg, coverOffset: [cfg.coverOffset[0] - 6, cfg.coverOffset[1] + 30], coverOtherMin: 0, crossZone: [0.06, 0.92], trackTries: 600 }];
  for (const [i, c] of passes.entries()) { const l = layoutPass(w, h, n, c, rng); if (l) { l.pass = i; return l; } }
  throw new Error('race layout failed');
}
function rotateLayout(p, W, H, cfg) { // portrait (H wide, W tall) → landscape (W wide, H tall)
  const f = (q) => ({ ...q, x: q.y, y: H - q.x });
  const lanes = p.lanes.map((t) => { const btn = f(t.btn); return { ...t, btn, rot: btn.y < H / 2 ? 180 : 0, start: f(t.start), end: f(t.end), dense: t.dense.map(f), pts: t.pts.map(f) }; });
  const lay = { ...p, w: W, h: H, goal: f(p.goal), lanes, crossings: p.crossings.map(f), covers: p.covers.map((c) => ({ ...f(c), roam: c.roam.map(f) })) };
  buildGrid(lay, cfg);
  return lay;
}
const dbg = (cfg, k) => { if (cfg._dbg) cfg._dbg[k] = (cfg._dbg[k] || 0) + 1; };
function layoutPass(w, h, n, cfg = RACE, rng = Math.random) {
  const goal = { x: w / 2, y: h / 2 };
  const bR = cfg.buttonSize / 2, m = bR + 10;
  const pos = { bl: { x: m, y: h - m }, br: { x: w - m, y: h - m }, tl: { x: m, y: m }, tr: { x: w - m, y: m } };
  const corners = cornersFor(n);
  const btn = pos.bl; const v0 = sub(goal, btn); const D0 = len(v0); const S = add(btn, mul(v0, (bR + 12) / D0));
  const Dmin = D0 - bR - 12;
  const target = Math.round(Dmin * cfg.trackFactor);
  for (let tryN = 0; tryN < cfg.trackTries; tryN++) {
    const relax = tryN > cfg.trackTries * 0.5;
    // the bl curve crosses the vertical centre line (meets br) and, with 3-4 racers, the horizontal one (meets tl)
    const vias = [{ x: w / 2, y: goal.y + (cfg.goalRadius + 40) + rng() * Math.max(10, (h / 2 - m * 1.4 - cfg.goalRadius - 40)) }];
    vias.push({ x: goal.x + (cfg.goalRadius + 36) + rng() * Math.max(10, (w / 2 - cfg.edgeMargin - cfg.trackHalf - 20 - cfg.goalRadius - 36)), y: h / 2 });
    const phi = -Math.PI / 2 + 0.35 + rng() * (Math.PI / 2 - 0.7);
    const E = { x: goal.x + Math.cos(phi) * cfg.goalRadius, y: goal.y + Math.sin(phi) * cfg.goalRadius };
    const fam = trackFamily(S, E, vias, rng);
    if (!fam) { dbg(cfg, 'fam'); continue; }
    // ONE length for every racer: the mode's target, or a little more if this curve needs it (capped per mode,
    // Normal ≤ 1.75 × and Adult ≥ 1.78 × the straight distance, so Adult tracks are always longer)
    let Lt = target;
    if (fam.L0 * 1.03 > Lt) { Lt = Math.round(fam.L0 * 1.03); if (Lt > Dmin * cfg.trackMax) { dbg(cfg, 'famlong'); continue; } }
    let lay = null;
    for (let f = 0; f < 4 && !lay; f++) {
      const dense = fam.fit([(f % 2 ? -1 : 1) * (0.5 + rng() * 0.7), (rng() - 0.5) * 0.8, (rng() - 0.5) * 0.5], Lt);
      if (!dense) { dbg(cfg, 'fit'); continue; }
      const base = resample(dense, cfg.trackSamples);
      const tracks = corners.map((c) => {
        const fm = (p) => MIRROR[c](p, w, h);
        return { corner: c, btn: pos[c], rot: c[0] === 't' ? 180 : 0, start: fm(S), end: fm(E), dense: dense.map(fm), pts: base.pts.map(fm), L: base.L };
      });
      if (!validTracks(tracks, { w, h, goal, bR }, cfg)) { dbg(cfg, 'valid'); continue; }
      const crossings = [];
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) crossingsOf(tracks[i], tracks[j], cfg).forEach((c) => crossings.push({ a: i, b: j, ...c }));
      const good = crossings.filter((c) => c.inZone && c.ang >= (relax ? 20 : 30));
      if (!tracks.every((_, i) => good.some((c) => c.a === i || c.b === i))) { dbg(cfg, 'cross'); continue; }
      if (!noLongOverlaps(tracks, crossings, cfg)) { dbg(cfg, 'overlap'); continue; }
      const cand = { w, h, goal, bR, L: base.L, lanes: tracks, crossings, tries: tryN + 1 };
      buildGrid(cand, cfg);
      if (placeCovers(cand, cfg, rng)) lay = cand; else dbg(cfg, 'covers');
    }
    if (!lay) continue;
    return lay;
  }
  return null;
}

function validTracks(tracks, { w, h, goal, bR }, cfg, only = -1) {
  const mg = cfg.edgeMargin + cfg.trackHalf;
  for (const [ti, t] of tracks.entries()) {
    if (only >= 0 && ti !== only) continue;
    const N = t.pts.length - 1;
    if (ti > 0) { // mirror images: shape checks are identical, only the buttons differ
      for (let k = 0; k <= N; k++) for (const [oi, o] of tracks.entries()) if (dist(t.pts[k], o.btn) < bR + cfg.trackHalf + 6 && (oi !== ti || k / N > 0.04)) return false;
      continue;
    }
    for (let k = 0; k <= N; k++) {
      const p = t.pts[k], q = k / N;
      if (p.x < mg || p.y < mg || p.x > w - mg || p.y > h - mg) return false;
      if (q < 0.95 && dist(p, goal) < cfg.goalRadius + 4) return false;
      for (const [oi, o] of tracks.entries()) {
        if (dist(p, o.btn) < bR + cfg.trackHalf + 6 && (oi !== ti || q > 0.04)) return false;
      }
      if (k > 1 && k < N) { // smoothness: turning radius >= 24 px
        const a = sub(t.pts[k], t.pts[k - 1]), b = sub(t.pts[k + 1], t.pts[k]);
        const c = Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / (len(a) * len(b) || 1)));
        if (Math.acos(c) > len(a) / 15) return false;
      }
    }
    // no self-crossing / touching itself
    const gap = Math.ceil(((cfg.trackHalf * 2 + 4) * 2.4) / (t.L / N));
    for (let i = 0; i < N; i += 2) for (let j = i + gap; j < N; j += 2) if (dist(t.pts[i], t.pts[j]) < cfg.trackHalf * 2 + 4) return false;
  }
  return true;
}
// Tracks may cross, but must not run on top of each other for long stretches.
function noLongOverlaps(tracks, crossings, cfg) {
  const near = cfg.trackHalf * 2 + 2;
  for (let i = 0; i < tracks.length; i++) for (let j = 0; j < tracks.length; j++) {
    if (i === j) continue;
    const A = tracks[i], B = tracks[j]; const N = A.pts.length - 1;
    const xs = crossings.filter((c) => (c.a === i && c.b === j) || (c.a === j && c.b === i)).map((c) => ({ q: c.a === i ? c.qa : c.qb, allow: near / Math.sin(Math.max(c.ang, 22) * Math.PI / 180) + 8 }));
    for (let k = 0; k <= N; k++) {
      const q = k / N; if (q > 0.85) continue;
      const p = A.pts[k]; let md = 1e9;
      for (let m = 0; m < B.pts.length; m += 2) { const d = dist(p, B.pts[m]); if (d < md) md = d; }
      if (md < near && !xs.some((x) => Math.abs(x.q - q) * A.L < x.allow)) return false;
    }
  }
  return true;
}

// ---- keep-off grid: 1 = blocked (track band + wild radius, goal, buttons, screen edge)
function buildGrid(lay, cfg) {
  const c = cfg.gridCell; const W = Math.ceil(lay.w / c), H = Math.ceil(lay.h / c);
  const g = new Uint8Array(W * H);
  const stamp = (p, r) => {
    const x0 = Math.max(0, Math.floor((p.x - r) / c)), x1 = Math.min(W - 1, Math.floor((p.x + r) / c));
    const y0 = Math.max(0, Math.floor((p.y - r) / c)), y1 = Math.min(H - 1, Math.floor((p.y + r) / c));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const cx = (x + 0.5) * c, cy = (y + 0.5) * c; if ((cx - p.x) ** 2 + (cy - p.y) ** 2 <= r * r) g[y * W + x] = 1;
    }
  };
  const rT = cfg.trackHalf + cfg.wildRadius + 4;
  for (const t of lay.lanes) for (let k = 0; k < t.dense.length; k++) stamp(t.dense[k], rT);
  stamp(lay.goal, cfg.goalRadius + cfg.wildRadius + 6);
  for (const t of lay.lanes) stamp(t.btn, lay.bR + cfg.wildRadius + 6);
  const e = Math.ceil((cfg.wildRadius + 2) / c);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < e || y < e || x >= W - e || y >= H - e) g[y * W + x] = 1;
  lay.grid = g; lay.gw = W; lay.gh = H; lay.cell = c;
}
export function blockedAt(lay, x, y) {
  const gx = Math.floor(x / lay.cell), gy = Math.floor(y / lay.cell);
  if (gx < 0 || gy < 0 || gx >= lay.gw || gy >= lay.gh) return true;
  return lay.grid[gy * lay.gw + gx] === 1;
}
export function segClear(lay, a, b) {
  const d = dist(a, b); const n = Math.max(1, Math.ceil(d / (lay.cell * 0.5)));
  for (let i = 0; i <= n; i++) if (blockedAt(lay, a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n)) return false;
  return true;
}
// Min distance from p to a track's centre line (for checks and tests)
export function distToTrack(t, p) { let md = 1e9; for (let i = 0; i < t.pts.length - 1; i++) { const d = distToSeg(p, t.pts[i], t.pts[i + 1]); if (d < md) md = d; } return md; }

// ---- trees and bushes (fair by construction): covers are placed beside the bl track at fixed progress bands
// and MIRRORED onto every other track, so each racer has the same number of covers at the same distances along
// and beside their own track. Each cover is home to one wild animal of the type that bothers that track's racer
// (Human: alternating predator/prey). Babies move into the nearest cover.
function placeCovers(lay, cfg, rng) {
  const { w, h } = lay; const t0 = lay.lanes[0];
  const clearR = cfg.trackHalf + cfg.coverRadius + 6;
  const okSpot = (p, list) => !blockedAt(lay, p.x, p.y)
    && p.x > cfg.coverRadius + 4 && p.y > cfg.coverRadius + 4 && p.x < w - cfg.coverRadius - 4 && p.y < h - cfg.coverRadius - 4
    && lay.lanes.every((o) => distToTrack(o, p) >= clearR)
    && list.every((c) => dist(c, p) >= cfg.coverRadius * 2 + 14);
  const covers = [];
  for (const [bi, qb] of cfg.coverBands.entries()) {
    let placed = null;
    for (let a = 0; a < 120 && !placed; a++) {
      const otherMin = Math.max(clearR, cfg.coverOtherMin - Math.floor(a / 20) * 8);
      const q = qb + (rng() - 0.5) * 0.08;
      const P = trackPoint(t0, q); const tl = Math.hypot(P.tx, P.ty) || 1; const nrm = { x: -P.ty / tl, y: P.tx / tl };
      const side = rng() < 0.5 ? 1 : -1; const off = cfg.coverOffset[0] + rng() * (cfg.coverOffset[1] - cfg.coverOffset[0]);
      const p = { x: P.x + nrm.x * side * off, y: P.y + nrm.y * side * off };
      const imgs = lay.lanes.map((ln) => MIRROR[ln.corner](p, w, h));
      const list = [...covers];
      let ok = true;
      for (const [ti, im] of imgs.entries()) {
        if (!okSpot(im, list)) { ok = false; break; }
        const own = distToTrack(lay.lanes[ti], im); if (own > cfg.coverOffset[1] + 6) { ok = false; break; }
        if (lay.lanes.some((o, oi) => oi !== ti && distToTrack(o, im) < otherMin)) { ok = false; break; }
        list.push(im);
      }
      if (ok) placed = imgs.map((im, ti) => ({ x: im.x, y: im.y, owner: ti, band: bi, q, d: distToTrack(lay.lanes[ti], im), kind: bi % 2 ? 'bush' : 'tree', relaxed: otherMin < cfg.coverOtherMin }));
    }
    if (!placed) return false;
    covers.push(...placed);
  }
  // roam points are generated once per band and MIRRORED too (kept only where every image is clear), so
  // mirrored wild animals walk mirrored paths. adj[i][j] = straight clear walk between roam points i and j.
  const bands = cfg.coverBands.length; const per = lay.lanes.length;
  for (let bi = 0; bi < bands; bi++) {
    const group = covers.slice(bi * per, bi * per + per); const base = group[0];
    const roam = [];
    for (let k = 0; k < 90 && roam.length < 12; k++) {
      const a = rng() * Math.PI * 2, r = 20 + rng() * (cfg.roamRadius - 20);
      const p = { x: base.x + Math.cos(a) * r, y: base.y + Math.sin(a) * r };
      const imgs = group.map((c) => MIRROR[lay.lanes[c.owner].corner](p, w, h));
      if (imgs.every((im, gi) => !blockedAt(lay, im.x, im.y) && segClear(lay, group[gi], im))) roam.push(imgs);
    }
    if (roam.length < 3) return false;
    const R = roam.length;
    const adj = Array.from({ length: R }, (_, i) => Array.from({ length: R }, (_, j) => i !== j && group.every((c, gi) => segClear(lay, roam[i][gi], roam[j][gi]))));
    group.forEach((c, gi) => { c.roam = roam.map((im) => im[gi]); c.adj = adj; });
  }
  lay.covers = covers;
  return true;
}
