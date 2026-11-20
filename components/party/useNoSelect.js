'use client';
import { useEffect } from 'react';

// Once inside a game (Truth or Dare / Animal Race, every phase): no text or emoji can be selected or long-pressed
// into the phone's selection box, callout or magnifier. Text inputs (player names) keep working.
// selectstart inside a text field can target a text node → use its parent element
const editable = (t) => { const e = t && t.nodeType === 3 ? t.parentElement : t; return !!(e && e.closest && e.closest('input, textarea, select, [contenteditable="true"]')) || document.activeElement?.matches?.('input, textarea'); };
export default function useNoSelect() {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('no-select');
    const stop = (e) => { if (!editable(e.target)) e.preventDefault(); };
    document.addEventListener('contextmenu', stop);
    document.addEventListener('selectstart', stop);
    document.addEventListener('dragstart', stop);
    return () => {
      html.classList.remove('no-select');
      document.removeEventListener('contextmenu', stop);
      document.removeEventListener('selectstart', stop);
      document.removeEventListener('dragstart', stop);
    };
  }, []);
}
