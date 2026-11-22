'use client';
import { useState, useSyncExternalStore } from 'react';

// v14 PROFILE PICTURES in games: { playerName: '/api/avatar/<key>' } for the host's own player (room.pics / race pics).
// One tiny shared store (no context threading): a game page calls setPics(room.pics); any face reads usePics().
let cur = {}; let curKey = '{}';
const subs = new Set();
export function setPics(p) {
  const k = JSON.stringify(p || {});
  if (k === curKey) return;
  cur = p || {}; curKey = k; subs.forEach((f) => f());
}
const sub = (f) => { subs.add(f); return () => subs.delete(f); };
export const usePics = () => useSyncExternalStore(sub, () => cur, () => cur);

// The face of a player: their picture (small, lazy, async-decoded, cached forever by URL) or the animal emoji fallback
// (also when the picture fails to load).
export function Face({ name, emoji, size = 22, className = '' }) {
  const pics = usePics(); const src = name ? pics[name] : null;
  const [bad, setBad] = useState(null);
  if (src && bad !== src) {
    return <img className={`face-pic ${className}`} src={src} alt="" width={size} height={size} loading="lazy" decoding="async"
      data-face-pic={name} onError={() => setBad(src)} />;
  }
  return emoji;
}
