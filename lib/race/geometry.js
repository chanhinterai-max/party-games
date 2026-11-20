// ANIMAL RACE MAP: random curvy tracks (one per racer, all EXACTLY the same arc length, each crossing another),
// a keep-off grid (hunters can never stand on a track, the goal or a button), and trees/bushes placed
// fairly: every track gets the same number of covers at the same progress and distance from its own track.
import { RACE } from './config.js';

// Corner seats. v9: TWO random base curves A and B of EXACTLY the same length. A passes crossing point P1, which sits
// 38-66 px off the vertical centre line; B passes P1's mirror image. bl = A, br = B mirrored left↔right,
// tl = B mirrored top↔bottom, tr = A mirrored both ways → bl×br meet exactly at P1 and tl×tr at its mirror, but the
// two racers reach it after different distances (≥ crossOffsetPx), so racers tapping at the same pace don't arrive
// together. (3 racers: tl×bl also meet at P2 on the horizontal centre line.) The planned crossings pair A with B.
const CORNERS = ['bl', 'br', 'tl', 'tr'];
export const cornersFor = (n) => CORNERS.slice(0, n);
const SHAPE = { bl: 0, br: 1, tl: 1, tr: 0 }; // 0 = curve A, 1 = curve B
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
function trackFamily(S, E, vias, rng, samples = 360, tsIn = null) {
  // p(t) = S + (E-S)·t + Σ a_k·sin(kπt) (+ A·free wiggles that vanish at the vias); p(t_k) = via_k exactly.
  const m = vias.length; const sn = (k, t) => Math.sin(k * Math.PI * t);
  const ts = tsIn || (m === 1 ? [0.4 + rng() * 0.3] : m === 2 ? [0.28 + rng() * 0.14, 0.58 + rng() * 0.16] : []);
  const lin = (t) => ({ x: S.x + (E.x - S.x) * t, y: S.y + (E.y - S.y) * t });
  const M = ts.map((t) => Array.from({ length: m }, (_, k) => sn(k + 1, t)));
  let ax = [], ay = [];
  if (m) { ax = solve(M, vias.map((X, i) => X.x - lin(ts[i]).x)); ay = solve(M, vias.map((X, i) => X.y - lin(ts[i]).y)); if (!ax || !ay) return null; }
  const bases = [0, 1, 2].map((j) => { const k = Math.max(m + 1, 3) + j; const b = m ? solve(M, ts.map((t) => sn(k, t))) : []; return b && { k, b }; });
  if (bases.some((f) => !f)) return null;
  // extra wiggle length is weighted toward the END of the track, so the progress at which a curve reaches its
  // crossing points follows the crossing-point shift (and isn't evened out by the length fit)
  const env = (t) => RACE.wiggleEnv[0] + (RACE.wiggleEnv[1] - RACE.wiggleEnv[0]) * (1 - Math.cos(Math.PI * t)) / 2;
  const v = sub(E, S); const cl = len(v); const nr = { x: -v.y / cl, y: v.x / cl };
  // precompute once per family: the fixed curve (chord + via terms) and the unit wiggle profile per sample,
  // so each bisection step is a cheap O(samples) pass with no trig (the layout runs many fits)
  const P0x = new Float64Array(samples + 1), P0y = new Float64Array(samples + 1), H = new Float64Array(samples + 1), env_ = new Float64Array(samples + 1);
  const Hk = [0, 1, 2].map(() => new Float64Array(samples + 1));
  for (let i = 0; i <= samples; i++) {
    const t = i / samples; const p = lin(t);
    for (let k = 0; k < m; k++) { const sk = sn(k + 1, t); p.x += ax[k] * sk; p.y += ay[k] * sk; }
    P0x[i] = p.x; P0y[i] = p.y; env_[i] = env(t);
    bases.forEach((f, j) => { let hh = sn(f.k, t); for (let k = 0; k < m; k++) hh -= f.b[k] * sn(k + 1, t); Hk[j][i] = hh * env_[i]; });
  }
  const lenA = (A) => { let L = 0, px = P0x[0] + A * H[0] * nr.x, py = P0y[0] + A * H[0] * nr.y; for (let i = 1; i <= samples; i++) { const x = P0x[i] + A * H[i] * nr.x, y = P0y[i] + A * H[i] * nr.y; L += Math.hypot(x - px, y - py); px = x; py = y; } return L; };
  const build = (A) => { const out = []; for (let i = 0; i <= samples; i++) out.push({ x: P0x[i] + A * H[i] * nr.x, y: P0y[i] + A * H[i] * nr.y }); return out; };
  const L0 = lenA(0);
  const setFree = (free) => { for (let i = 0; i <= samples; i++) H[i] = free[0] * Hk[0][i] + free[1] * Hk[1][i] + free[2] * Hk[2][i]; };
  const fit = (free, Lt) => {
    if (L0 > Lt) return null;
    setFree(free);
    let lo = 0, hi = 30; while (lenA(hi) < Lt && hi < 5000) hi *= 2; if (lenA(hi) < Lt) return null;
    for (let k = 0; k < 40 && hi - lo > 1e-7; k++) { const mid = (lo + hi) / 2; if (lenA(mid) < Lt) lo = mid; else hi = mid; }
    const d = build((lo + hi) / 2); d.free = free; d.A = (lo + hi) / 2; return d;
  };
  // final polish of an ACCEPTED candidate on the RESAMPLED track (what racers actually run on): its length must be
  // Lt to ~1e-9 px, so every track (curve A, curve B and all mirror images) is EXACTLY the same length
  const polish = (d, Lt, N) => {
    setFree(d.free); const rl = (A) => polyLen(resample(build(A), N).pts);
    let lo = d.A, hi = lo * 1.01 + 1e-6, g = 0; while (rl(hi) < Lt && g++ < 20) hi = hi * 1.05 + 1e-3; if (rl(hi) < Lt) return null;
    for (let k = 0; k < 60 && hi - lo > 1e-12; k++) { const mid = (lo + hi) / 2; if (rl(mid) < Lt) lo = mid; else hi = mid; }
    return build(hi);
  };
  return { L0, fit, polish, ts };
}
// Public entry: never returns null. Portrait is generated directly; landscape is generated in portrait and
// rotated. Each pass relaxes a little (shorter tracks, wider cover band) if the screen is tight.
export function layout(w, h, n, cfg = RACE, rng = Math.random) {
  if (w > h) { const p = layout(h, w, n, cfg, rng); return rotateLayout(p, w, h, cfg); }
  const passes = [cfg,
    { ...cfg, coverOffset: [cfg.coverOffset[0] - 4, cfg.coverOffset[1] + 14], trackTries: 300 },
    { ...cfg, coverOffset: [cfg.coverOffset[0] - 6, cfg.coverOffset[1] + 30], coverOtherMin: 0, crossZone: [0.06, 0.92], trackTries: 600 }];
  // the offset-crossing search gets a time budget; then a symmetric fallback (crossings on the centre lines,
  // like v8: still exactly equal + mirrored, only the same-pace offset is not guaranteed) that always works fast
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const deadline = now() + (cfg.layoutBudgetMs ?? 900);
  for (const [i, c] of passes.entries()) { const l = layoutPass(w, h, n, { ...c, _deadline: deadline, _now: now }, rng); if (l) { l.pass = i; return l; } }
  const fb = { ...passes[2], crossShift: [0, 0], crossOffsetPx: 0, trackTries: 3000 };
  const l = layoutPass(w, h, n, fb, rng); if (l) { l.pass = 3; l.fallback = true; return l; }
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
    if (cfg._deadline && (tryN & 3) === 0 && cfg._now() > cfg._deadline) return null;
    const relax = tryN > cfg.trackTries * 0.5;
    // Crossing points P1 (meets br) and P2 (meets tl) sit a little OFF the centre lines. Curve A passes P1 and P2;
    // curve B passes their mirror images, so br = mirror(B) and tl = mirror(B) still pass P1 / P2 exactly, but
    // A and B reach them after different distances → racers at the same pace arrive at different moments.
    const sg = () => (rng() < 0.5 ? -1 : 1); const dX = sg() * (cfg.crossShift[0] + rng() * (cfg.crossShift[1] - cfg.crossShift[0])), dY = sg() * (cfg.crossShift[0] + rng() * (cfg.crossShift[1] - cfg.crossShift[0]));
    const P1 = { x: w / 2 + dX, y: goal.y + (cfg.goalRadius + 40) + rng() * Math.max(10, (h / 2 - m * 1.4 - cfg.goalRadius - 40)) };
    const P2 = { x: goal.x + (cfg.goalRadius + 36) + rng() * Math.max(10, (w / 2 - cfg.edgeMargin - cfg.trackHalf - 20 - cfg.goalRadius - 36)), y: h / 2 + dY };
    // 3 racers: P2 (bl×tl) stays ON the centre line — offsetting both points made almost every curve too long or
    // too close (measured), so for 3 racers only the bl×br crossing is guaranteed offset (tl's is left to chance)
    if (n === 3) P2.y = h / 2;
    // 2 or 4 racers: only P1 is needed (bl×br at P1, tl×tr at its mirror); 3 racers also need P2 (tl×bl)
    const vias = n === 3 ? [P1, P2] : [P1], viasB = n === 3 ? [{ x: w - P1.x, y: P1.y }, { x: P2.x, y: h - P2.y }] : [{ x: w - P1.x, y: P1.y }];
    const endAt = () => { const phi = -Math.PI / 2 + 0.35 + rng() * (Math.PI / 2 - 0.7); return { x: goal.x + Math.cos(phi) * cfg.goalRadius, y: goal.y + Math.sin(phi) * cfg.goalRadius }; };
    const E = endAt(), EB = endAt();
    const fam = trackFamily(S, E, vias, rng);
    if (!fam) { dbg(cfg, 'fam'); continue; }
    // curve B: through the mirrored crossing points
    const famB = trackFamily(S, EB, viasB, rng, 360, fam.ts); // same curve parameters → offset comes from the shift
    if (!famB) { dbg(cfg, 'famB'); continue; }
    // ONE length for every racer: the mode's target, or a little more if a curve needs it (capped per mode)
    let Lt = target; const L0 = Math.max(fam.L0, famB.L0);
    if (L0 * 1.03 > Lt) { Lt = Math.round(L0 * 1.03); if (Lt > Dmin * cfg.trackMax) { dbg(cfg, 'famlong'); continue; } }
    // Each shape is checked ONCE in the bottom-left frame (edges, goal, turn radius, self-touch, every corner
    // button): its mirror images pass the same checks, so A and B are searched independently (fast).
    const btns = Object.values(pos);
    const fitShape = (fm2, k) => {
      for (let f = 0; f < k; f++) {
        const d0 = fm2.fit([(f % 2 ? -1 : 1) * (0.5 + rng() * 0.7), (rng() - 0.5) * 0.8, (rng() - 0.5) * 0.5], Lt);
        if (!d0) { dbg(cfg, 'fit'); continue; }
        if (!validShape(resample(d0, cfg.trackSamples), { w, h, goal, bR, btns, self: pos.bl }, cfg)) { dbg(cfg, 'valid'); continue; }
        const d = fm2.polish(d0, Lt, cfg.trackSamples); if (!d) continue;
        const b = resample(d, cfg.trackSamples); b.L = polyLen(b.pts); // = Lt: identical for every track
        if (validShape(b, { w, h, goal, bR, btns, self: pos.bl }, cfg)) return { dense: d, base: b };
      }
      return null;
    };
    const qAt = (pts, v) => { let bi = 0, bd = 1e9; pts.forEach((p, k) => { const d = (p.x - v.x) ** 2 + (p.y - v.y) ** 2; if (d < bd) { bd = d; bi = k; } }); return bi / (pts.length - 1); };
    const shA = fitShape(fam, 6); if (!shA) continue;
    let lay = null;
    for (let f = 0; f < 6 && !lay; f++) {
      const shB = fitShape(famB, 3); if (!shB) break;
      const { dense, base } = shA, { dense: denseB, base: baseB } = shB;
      // crossing offset: progress where each curve passes each via must differ by ≥ crossOffsetPx
      const offs = vias.slice(0, 1).map((v, k) => Math.abs(qAt(base.pts, v) - qAt(baseB.pts, viasB[k])));
      if (cfg._dbg) (cfg._dbg.offs = cfg._dbg.offs || []).push(offs.map((o) => +o.toFixed(2)).join('/'));
      if (offs.some((o) => o * base.L < cfg.crossOffsetPx)) { dbg(cfg, 'offset'); continue; }
      const shapes = [{ dense, base }, { dense: denseB, base: baseB }];
      const tracks = corners.map((c) => {
        const fm = (p) => MIRROR[c](p, w, h); const sh = shapes[SHAPE[c]];
        return { corner: c, shape: SHAPE[c], btn: pos[c], rot: c[0] === 't' ? 180 : 0, start: fm(S), end: fm(SHAPE[c] ? EB : E), dense: sh.dense.map(fm), pts: sh.base.pts.map(fm), L: sh.base.L };
      });
      const crossings = [];
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) crossingsOf(tracks[i], tracks[j], cfg).forEach((c) => crossings.push({ a: i, b: j, ...c }));
      // EVERY crossing in the crash zone (planned or incidental) must be reached ≥ crossOffsetPx apart
      const exempt = (c) => n === 3 && tracks[c.a].corner === 'bl' && tracks[c.b].corner === 'tl'; // the 3-racer centre-line crossing
      if (crossings.some((c) => !exempt(c) && c.qa > cfg.crashMinQ && c.qa < cfg.crashMaxQ && c.qb > cfg.crashMinQ && c.qb < cfg.crashMaxQ && Math.abs(c.qa - c.qb) * base.L < cfg.crossOffsetPx * (relax ? 0.8 : 1))) { dbg(cfg, 'xoff'); continue; }
      // …and racers at the SAME progress (same tap pace) are never within crash distance anywhere (near misses too)
      if (cfg.crossOffsetPx > 0 && !sameQClear(tracks, cfg, exempt)) { dbg(cfg, 'sameq'); continue; }
      const good = crossings.filter((c) => c.inZone && c.ang >= (relax ? 20 : 30));
      if (!tracks.every((_, i) => good.some((c) => c.a === i || c.b === i))) { dbg(cfg, 'cross'); continue; }
      if (!noLongOverlaps(tracks, crossings, cfg)) { dbg(cfg, 'overlap'); continue; }
      const cand = { w, h, goal, bR, L: base.L, lanes: tracks, crossings, tries: tryN + 1, crossOffset: Math.min(...offs) };
      buildGrid(cand, cfg);
      if (placeCovers(cand, cfg, rng, shapes)) lay = cand; else dbg(cfg, 'covers');
    }
    if (!lay) continue;
    return lay;
  }
  return null;
}

function validShape(t, { w, h, goal, bR, btns, self }, cfg) {
  const mg = cfg.edgeMargin + cfg.trackHalf; const pts = t.pts; const N = pts.length - 1;
  const rr = (bR + cfg.trackHalf + 6) ** 2, gr = (cfg.goalRadius + 4) ** 2;
  for (let k = 0; k <= N; k++) {
    const p = pts[k], q = k / N;
    if (p.x < mg || p.y < mg || p.x > w - mg || p.y > h - mg) return false;
    if (q < 0.95 && (p.x - goal.x) ** 2 + (p.y - goal.y) ** 2 < gr) return false;
    for (const b of btns) if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 < rr && (b !== self || q > 0.04)) return false;
    if (k > 1 && k < N) { // smoothness: turning radius >= 15 px
      const a = sub(pts[k], pts[k - 1]), c2 = sub(pts[k + 1], pts[k]);
      const c = Math.max(-1, Math.min(1, (a.x * c2.x + a.y * c2.y) / (len(a) * len(c2) || 1)));
      if (Math.acos(c) > len(a) / 15) return false;
    }
  }
  // no self-crossing / touching itself
  const gap = Math.ceil(((cfg.trackHalf * 2 + 4) * 2.4) / (t.L / N)); const sr = (cfg.trackHalf * 2 + 4) ** 2;
  for (let i = 0; i < N; i += 2) for (let j = i + gap; j < N; j += 2) if ((pts[i].x - pts[j].x) ** 2 + (pts[i].y - pts[j].y) ** 2 < sr) return false;
  return true;
}
// equal pace = equal progress q: two racers with the same q must never be within crash distance (+4 px margin)
function sameQClear(tracks, cfg, exempt) {
  const r2 = (cfg.crashDist + 4) ** 2;
  for (let i = 0; i < tracks.length; i++) for (let j = i + 1; j < tracks.length; j++) {
    if (exempt({ a: i, b: j })) continue;
    const A = tracks[i].pts, B = tracks[j].pts; const N = A.length - 1;
    for (let k = Math.floor(cfg.crashMinQ * N); k <= Math.ceil(cfg.crashMaxQ * N); k++) if ((A[k].x - B[k].x) ** 2 + (A[k].y - B[k].y) ** 2 < r2) return false;
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

// ---- keep-off grid: 1 = blocked (track band + hunter radius, goal, buttons, screen edge)
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
  const rT = cfg.trackHalf + cfg.hunterRadius + 4;
  for (const t of lay.lanes) for (let k = 0; k < t.dense.length; k++) stamp(t.dense[k], rT);
  stamp(lay.goal, cfg.goalRadius + cfg.hunterRadius + 6);
  for (const t of lay.lanes) stamp(t.btn, lay.bR + cfg.hunterRadius + 6);
  const e = Math.ceil((cfg.hunterRadius + 2) / c);
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

// ---- trees and bushes (fair by construction): each cover is placed in the LOCAL frame of its own track (same
// progress q, same side, same distance from the centre line) for curve A and curve B, then mirrored per corner,
// so every racer has the same number of covers at the same progress and distance. Hunters come out of them.
// Roam points are also defined in the local frame (along / across the track) → hunters walk equivalent paths.
function placeCovers(lay, cfg, rng, shapes) {
  const { w, h } = lay;
  const clearR = cfg.trackHalf + cfg.coverRadius + 6;
  const frame = (sh, q) => { const P = trackPoint(sh.base, q); const tl = Math.hypot(P.tx, P.ty) || 1; return { P, t: { x: P.tx / tl, y: P.ty / tl }, n: { x: -P.ty / tl, y: P.tx / tl } }; };
  const local = (F, u, v) => ({ x: F.P.x + F.t.x * u + F.n.x * v, y: F.P.y + F.t.y * u + F.n.y * v });
  const okSpot = (p, list) => !blockedAt(lay, p.x, p.y)
    && p.x > cfg.coverRadius + 4 && p.y > cfg.coverRadius + 4 && p.x < w - cfg.coverRadius - 4 && p.y < h - cfg.coverRadius - 4
    && lay.lanes.every((o) => distToTrack(o, p) >= clearR)
    && list.every((c) => dist(c, p) >= cfg.coverRadius * 2 + 14);
  const covers = []; const frames = [];
  for (const [bi, qb] of cfg.coverBands.entries()) {
    let placed = null;
    for (let a = 0; a < 140 && !placed; a++) {
      const otherMin = Math.max(clearR, cfg.coverOtherMin - Math.floor(a / 20) * 8);
      const q = qb + (rng() - 0.5) * 0.08;
      const side = rng() < 0.5 ? 1 : -1; const off = cfg.coverOffset[0] + rng() * (cfg.coverOffset[1] - cfg.coverOffset[0]);
      const F = shapes.map((sh) => frame(sh, q)); const P = F.map((f) => local(f, 0, side * off));
      const imgs = lay.lanes.map((ln) => MIRROR[ln.corner](P[ln.shape], w, h));
      const list = [...covers];
      let ok = true;
      for (const [ti, im] of imgs.entries()) {
        if (!okSpot(im, list)) { ok = false; break; }
        const own = distToTrack(lay.lanes[ti], im); if (Math.abs(own - off) > 0.75) { ok = false; break; } // nearest bit of its own track = that spot
        if (lay.lanes.some((o, oi) => oi !== ti && distToTrack(o, im) < otherMin)) { ok = false; break; }
        list.push(im);
      }
      if (ok) { placed = imgs.map((im, ti) => ({ x: im.x, y: im.y, owner: ti, band: bi, q, side, off, d: distToTrack(lay.lanes[ti], im), kind: bi % 2 ? 'bush' : 'tree', relaxed: otherMin < cfg.coverOtherMin })); frames.push({ F, side, off }); }
    }
    if (!placed) return false;
    covers.push(...placed);
  }
  // roam points: same (along, across) offsets from the cover in each track's local frame, kept only where every
  // image is clear. adj[i][j] = straight clear walk between roam points i and j for every image.
  const per = lay.lanes.length;
  for (let bi = 0; bi < cfg.coverBands.length; bi++) {
    const group = covers.slice(bi * per, bi * per + per); const { F, side, off } = frames[bi];
    const roam = [];
    for (let k = 0; k < 120 && roam.length < 12; k++) {
      const a = rng() * Math.PI * 2, r = 20 + rng() * (cfg.roamRadius - 20);
      const u = Math.cos(a) * r, v = side * off + Math.sin(a) * r;
      const P = F.map((f) => local(f, u, v));
      const imgs = group.map((c) => MIRROR[lay.lanes[c.owner].corner](P[lay.lanes[c.owner].shape], w, h));
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
