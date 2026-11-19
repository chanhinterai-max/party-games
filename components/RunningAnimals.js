'use client';
import { useEffect, useRef, useState } from 'react';
import { ANIMALS } from '@/lib/content';

// Lanes: [top %, duration s, delay s, direction]
const LANES = [
  [14, 17, 0, 1], [32, 22, 6, -1], [58, 19, 3, 1], [76, 24, 10, -1], [88, 20, 14, 1],
];

// Lightweight emoji + CSS animation. Tapping an animal pauses it for petMs (admin-set, default 20 s) with hearts.
// onPettedChange({ id: petStart (performance.now()) }) lets the game send elapsed times with actions.
export default function RunningAnimals({ onPettedChange, petMs = 20000 }) {
  const [petted, setPetted] = useState({}); // id -> pet start (performance.now())
  const timers = useRef({});

  useEffect(() => {
    onPettedChange?.(petted);
  }, [petted, onPettedChange]);
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  function pet(id) {
    clearTimeout(timers.current[id]);
    setPetted((p) => ({ ...p, [id]: performance.now() }));
    timers.current[id] = setTimeout(() => {
      setPetted((p) => { const n = { ...p }; delete n[id]; return n; });
    }, petMs);
  }

  return (
    <div className="critters" aria-hidden="true">
      {ANIMALS.map((a, i) => {
        const [top, dur, delay, dir] = LANES[i % LANES.length];
        const isPetted = !!petted[a.id];
        return (
          <div key={a.id} className={`critter-track ${dir < 0 ? 'rtl' : ''} ${isPetted ? 'paused' : ''}`}
            style={{ top: `${top}%`, animationDuration: `${dur}s`, animationDelay: `-${delay}s` }}>
            <button type="button" tabIndex={-1} className={`critter ${isPetted ? 'petted' : ''}`} data-animal={a.id}
              onClick={() => pet(a.id)}>
              <span className="critter-body">{isPetted ? a.happy : a.emoji}</span>
              {isPetted && <span className="hearts"><i>💕</i><i>💗</i><i>💖</i></span>}
              {isPetted && <span className="comfy">so comfy~</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
}
