'use client';
import { useEffect, useRef, useState } from 'react';

// Countdown timer that runs purely on the phone (no network). Start / Pause + Reset.
export default function Timer({ seconds }) {
  const total = seconds * 1000;
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);
  const end = useRef(0);
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      const l = Math.max(0, end.current - performance.now());
      setLeft(l);
      if (l === 0) { setRunning(false); try { navigator.vibrate?.([120, 60, 120]); } catch {} }
    }, 200);
    return () => clearInterval(id);
  }, [running]);
  const start = () => {
    if (running) { setRunning(false); return; }
    const from = left > 0 ? left : total;
    end.current = performance.now() + from;
    setLeft(from);
    setRunning(true);
  };
  const reset = () => { setRunning(false); setLeft(total); };
  const s = Math.ceil(left / 1000);
  const done = left === 0;
  return (
    <div className={`timer ${done ? 'done' : ''}`} data-timer>
      <span className="timer-left" data-timer-left={s} aria-live="polite">{done ? '⏰ Time!' : `⏱ ${s}s`}</span>
      <button type="button" className="small-btn good" data-act="timer-start" onClick={start}>{running ? 'Pause' : done ? 'Again' : 'Start'}</button>
      <button type="button" className="small-btn" data-act="timer-reset" onClick={reset}>Reset</button>
    </div>
  );
}
