'use client';
import { useEffect, useState } from 'react';

// Hand-rolled confetti: ~36 CSS-animated spans (transform/opacity only), added AFTER the results have
// painted and removed after ~3.5 s. Skipped entirely with prefers-reduced-motion.
const COLORS = ['#ff2fb3', '#22e6ff', '#ffb340', '#b6ff3b', '#9b5cff'];
export default function Confetti() {
  const [pieces, setPieces] = useState(null);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const raf = requestAnimationFrame(() => setPieces(Array.from({ length: 36 }, (_, i) => ({
      l: Math.random() * 100, x: (Math.random() - 0.5) * 160, d: 2.2 + Math.random() * 1.2,
      delay: Math.random() * 0.5, c: COLORS[i % COLORS.length], r: Math.random() * 720 - 360,
    }))));
    const t = setTimeout(() => setPieces(null), 4000);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, []);
  if (!pieces) return null;
  return (
    <div className="confetti" aria-hidden="true" data-confetti>
      {pieces.map((p, i) => (
        <i key={i} style={{ left: `${p.l}%`, background: p.c, animationDuration: `${p.d}s`, animationDelay: `${p.delay}s`, '--x': `${p.x}px`, '--r': `${p.r}deg` }} />
      ))}
    </div>
  );
}
