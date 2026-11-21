// Race-map cache + worker client. requestLayout(slot, w, h, n, mode) → Promise<layout>. Same slot + size + count +
// mode = same promise (computed once). Uses a Web Worker; falls back to the main thread (in an idle slice) if workers
// are unavailable. boardSize() = the real visible box (v12, see visibleBox).
let worker = null; let seq = 0;
const pending = new Map(); const cache = new Map();
export const stats = { ms: {} }; // per-key compute time (test hook)

function localCompute(job) {
  return new Promise((resolve, reject) => {
    const run = () => import('./geometry.js').then(({ layout }) => import('./config.js').then(({ modeCfg }) => {
      try { resolve(layout(job.w, job.h, job.n, modeCfg(job.mode), Math.random)); } catch (e) { reject(e); }
    }));
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 200 }); else setTimeout(run, 0);
  });
}
function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('./layout.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error)); else { stats.ms[p.key] = e.data.ms; p.resolve(e.data.lay); }
    };
    worker.onerror = () => { // worker broke: finish everything on the main thread
      worker = false; for (const [, p] of pending) localCompute(p.job).then(p.resolve, p.reject); pending.clear();
    };
  } catch { worker = false; }
  return worker;
}
// v12 (iPhone Safari bottom bars): the board = the REAL visible box. Height = the smallest of visualViewport.height,
// 100svh (bars fully shown), innerHeight and the layout viewport, minus the safe areas and a bottom margin, so the
// tap buttons stay fully visible even if Safari's bottom toolbar (URL pill + back/share/tabs, ~17 % of the screen)
// expands later (e.g. a tap near the bottom). Top/left follow visualViewport.offsetTop/Left. Values are written as
// px CSS variables (--rb-*) used by .race-board; RaceBoard re-fits (scales the map) when they change mid-race.
export const BOTTOM_MARGIN = 12;
let probe = null;
function probeBox() {
  if (!probe || !probe.isConnected) { probe = document.createElement('div'); probe.className = 'race-vprobe'; probe.setAttribute('aria-hidden', 'true'); document.body.appendChild(probe); }
  const cs = getComputedStyle(probe); const px = (v) => parseFloat(v) || 0;
  return { svh: probe.getBoundingClientRect().height, t: px(cs.paddingTop), r: px(cs.paddingRight), b: px(cs.paddingBottom), l: px(cs.paddingLeft) };
}
export function visibleBox() {
  const m = probeBox(); const vv = window.visualViewport; const de = document.documentElement;
  const pos = (x) => (x > 0 ? x : Infinity);
  const H = Math.min(vv ? pos(vv.height) : Infinity, pos(window.innerHeight), m.svh > 100 ? m.svh : Infinity, pos(de.clientHeight));
  const W = Math.min(vv ? pos(vv.width) : Infinity, pos(window.innerWidth), pos(de.clientWidth));
  const top = Math.max(0, vv ? vv.offsetTop : 0) + m.t, left = Math.max(0, vv ? vv.offsetLeft : 0) + m.l;
  return { top: Math.round(top), left: Math.round(left), w: Math.floor(W - m.l - m.r), h: Math.floor(H - m.t - m.b - BOTTOM_MARGIN) };
}
export function syncViewport() {
  const b = visibleBox(); const st = document.documentElement.style;
  const set = (k, v) => { if (st.getPropertyValue(k) !== v) st.setProperty(k, v); };
  set('--rb-top', `${b.top}px`); set('--rb-left', `${b.left}px`); set('--rb-w', `${b.w}px`); set('--rb-h', `${b.h}px`);
  return b;
}
export function boardSize() { const b = syncViewport(); return { w: b.w, h: b.h }; }
export function requestLayout(slot, w, h, n, mode) {
  const key = `${slot}|${w}x${h}|${n}|${mode}`;
  if (cache.has(key)) return cache.get(key);
  const job = { w, h, n, mode };
  const wk = getWorker();
  const pr = wk ? new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject, job, key }); wk.postMessage({ id, ...job }); }) : localCompute(job);
  const safe = pr.catch(() => localCompute(job)); // last resort: compute here
  cache.set(key, safe);
  return safe;
}
export function clearLayouts() { cache.clear(); }
