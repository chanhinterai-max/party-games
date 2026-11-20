// Race-map cache + worker client. requestLayout(slot, w, h, n, mode) → Promise<layout>. Same slot + size + count +
// mode = same promise (computed once). Uses a Web Worker; falls back to the main thread (in an idle slice) if workers
// are unavailable. boardSize() = the visible viewport minus safe areas (v10).
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
// v10: the board's size = the VISIBLE viewport minus safe areas (see .race-board in globals.css). Measured with an
// invisible probe that has the board's own CSS, so CSS env(safe-area-inset-*) / dvh are honoured exactly.
export function boardSize() {
  syncViewport();
  let pr = document.querySelector('.race-probe');
  if (!pr) { pr = document.createElement('div'); pr.className = 'race-board race-probe'; pr.setAttribute('aria-hidden', 'true'); document.body.appendChild(pr); }
  const r = pr.getBoundingClientRect();
  const vv = window.visualViewport;
  const w = Math.floor(Math.min(r.width || window.innerWidth, vv ? vv.width : Infinity));
  const h = Math.floor(Math.min(r.height || window.innerHeight, window.innerHeight));
  return { w, h };
}
// --vvh = the visible viewport height (browser bars shown/hidden, keyboard, rotation). Cheap; called on resize.
export function syncViewport() {
  const vv = window.visualViewport; const h = Math.round(vv ? vv.height : window.innerHeight);
  const root = document.documentElement; const v = `${h}px`;
  if (root.style.getPropertyValue('--vvh') !== v) root.style.setProperty('--vvh', v);
}
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
