// Builds race maps OFF the main thread (the offset-crossing search can take ~0.1-1.5 s), so the page never janks.
// The race page asks for every upcoming heat's map while players look at the meet / results screens.
import { layout } from './geometry.js';
import { modeCfg } from './config.js';

self.onmessage = (e) => {
  const { id, w, h, n, mode } = e.data;
  const t0 = performance.now();
  try {
    const lay = layout(w, h, n, modeCfg(mode), Math.random);
    self.postMessage({ id, lay, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
