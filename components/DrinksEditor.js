'use client';
import { useEffect, useState } from 'react';
import { api } from './api';
import { DRINK_CATEGORIES } from '@/lib/content';

// Global chicken-out drink options (apply to all games).
export default function DrinksEditor() {
  const [drinks, setDrinks] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { api('/api/drinks').then((d) => setDrinks(Object.fromEntries(Object.entries(d.drinks).map(([k, v]) => [k, v.join('\n')])))).catch(() => {}); }, []);
  if (!drinks) return null;
  async function save() {
    setMsg('');
    try {
      const body = Object.fromEntries(DRINK_CATEGORIES.map((c) => [c.id, (drinks[c.id] || '').split('\n')]));
      await api('/api/drinks', { method: 'PUT', body });
      setMsg('Saved ✓ (applies to all games)');
    } catch (e) { setMsg(e.message); }
  }
  return (
    <details className="panel" data-section="drinks">
      <summary style={{ fontWeight: 800 }}>🐔 Chicken-out drinks (global)</summary>
      <p className="count">One option per line. A random option from the picked category is shown when someone chickens out.</p>
      {DRINK_CATEGORIES.map((c) => (
        <label className="field" key={c.id}>{c.emoji} {c.name}
          <textarea className="input" name={`drinks-${c.id}`} value={drinks[c.id] || ''} onChange={(e) => setDrinks({ ...drinks, [c.id]: e.target.value })} />
        </label>
      ))}
      <button className="btn btn-primary" style={{ marginTop: 10 }} data-act="save-drinks" onClick={save}>Save drinks</button>
      {msg && <p className="count" data-drinks-msg>{msg}</p>}
    </details>
  );
}
