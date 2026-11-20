'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from './api';
import { LEVELS, DRINK_CATEGORIES } from '@/lib/content';
import GenderDot, { WithDot } from './GenderDot';
import CategoryManager from './CategoryManager';
import DrinksEditor from './DrinksEditor';
import SurpriseEditor from './SurpriseEditor';
import Results from './Results';

const hexId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
const shortWhat = (t) => t.replaceAll('{who}', 'WHO').replaceAll('{where}', 'WHERE').replaceAll('{partner}', 'PARTNER');

export default function QueueEditor({ code }) {
  const [view, setView] = useState(null);
  const [queues, setQueues] = useState(null);
  const [tab, setTab] = useState('dare');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [drag, setDrag] = useState(null); // { x, y, label, cls }
  const [cats, setCats] = useState([]);
  const [catId, setCatId] = useState('');
  const [hover, setHover] = useState(null); // { key, pos }
  const pending = useRef(0);
  const dragging = useRef(false);
  const saveTimer = useRef();
  const queuesRef = useRef(null);
  queuesRef.current = queues;

  const load = useCallback(async (force = false) => {
    if (!force && (pending.current > 0 || dragging.current)) return;
    try {
      const d = await api(`/api/rooms/${code}/queue`);
      if (!force && (pending.current > 0 || dragging.current)) return;
      setView(d);
      setQueues(d.queues);
      setError('');
    } catch (e) {
      setError(e.status === 401 ? 'login' : e.message);
    }
  }, [code]);

  const loadCats = useCallback(() => api('/api/me/categories').then((d) => setCats(d.categories)).catch(() => {}), []);
  useEffect(() => { loadCats(); }, [loadCats]);

  useEffect(() => {
    load(true);
    const t = setInterval(() => load(false), 3000);
    return () => clearInterval(t);
  }, [load]);

  function commit(next, note) {
    setQueues(next);
    pending.current += 1;
    setStatus('Saving…');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const d = await api(`/api/rooms/${code}/queue`, { method: 'PUT', body: { truth: queuesRef.current.truth, dare: queuesRef.current.dare, note } });
        pending.current = 0;
        setView(d);
        setQueues(d.queues);
        setStatus('Saved ✓');
      } catch (e) {
        pending.current = 0;
        setStatus(`Save failed: ${e.message}`);
        load(true);
      }
    }, 250);
  }

  if (error === 'login') {
    return <div className="panel" style={{ marginTop: 30 }}><h3>Login required</h3><p className="count">Advanced players and admins can view and edit rooms.</p><Link className="btn btn-primary" href="/login">Login</Link></div>;
  }
  if (error && !view) return <div className="panel" style={{ marginTop: 30 }}><h3>Room {code}</h3><p className="error">{error}</p><Link href="/room">Try another code</Link></div>;
  if (!view || !queues) return <p className="count" style={{ marginTop: 30 }}>Loading room {code}…</p>;

  const { room, palette } = view;
  const genders = room.genders || {};
  const cat = tab === 'dare' ? cats.find((c) => c.id === catId) : null;
  const whoAllowed = (w) => {
    if (!cat) return true;
    const m = cat.who?.mode;
    if (m === 'all') return true;
    if (m === 'female' || m === 'male') return w.kind === 'player' && w.gender === m;
    if (m === 'custom') return (cat.who.values || []).some((v) => (v.kind === 'gender' ? w.kind === 'player' && w.gender === v.value : v.kind === w.kind && v.value === w.value));
    return true;
  };
  const pWho = palette.who.filter(whoAllowed);
  const pWhat = cat ? palette.what[tab].filter((w) => cat.what.includes(w.id)) : palette.what[tab];
  const pWhere = cat ? palette.where.filter((w) => cat.where.includes(w)) : palette.where;
  const list = queues[tab];
  const whoLabel = (w) => palette.who.find((p) => p.kind === w.kind && p.value === w.value)?.label || w.value;
  const whatInfo = (id) => palette.what[tab].find((w) => w.id === id);
  const lvl = LEVELS.find((l) => l.id === room.level);

  // ---------- pointer drag & drop ----------
  function startDrag(e, payload, label, cls) {
    if (e.button !== undefined && e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    let started = false;
    let target = null;
    const move = (ev) => {
      if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      if (!started) { started = true; dragging.current = true; }
      ev.preventDefault();
      setDrag({ x: ev.clientX, y: ev.clientY, label, cls });
      const pal = document.querySelector('.palette')?.getBoundingClientRect();
      // scroll up when hovering just below the sticky palette (or the top edge)
      if (ev.clientY < 70 || (pal && pal.top <= 1 && ev.clientY > pal.bottom && ev.clientY < pal.bottom + 50)) window.scrollBy(0, -14);
      else if (ev.clientY > window.innerHeight - 70) window.scrollBy(0, 14);
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-drop]');
      if (!el) { target = null; setHover(null); return; }
      const r = el.getBoundingClientRect();
      target = { drop: el.dataset.drop, idx: el.dataset.idx != null ? +el.dataset.idx : null, field: el.dataset.field, pos: ev.clientY < r.top + r.height / 2 ? 'before' : 'after' };
      setHover({ key: `${target.drop}:${target.idx}:${target.field || ''}`, idx: target.idx, drop: target.drop, pos: target.pos });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDrag(null);
      setHover(null);
      dragging.current = false;
      if (started && target) applyDrop(payload, target);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function setField(item, field, value) {
    const it = { ...item };
    if (field === 'who') it.who = value;
    if (field === 'where') it.where = value;
    if (field === 'what') {
      it.what = { id: value.id, text: value.text };
      const touch = value.text.includes('{where}');
      if (!touch) it.where = null;
    }
    return it;
  }

  function applyDrop(p, t) {
    const cur = queuesRef.current;
    const arr = cur[tab].slice();
    if (p.kind === 'item') {
      const [moved] = arr.splice(p.idx, 1);
      if (t.drop === 'add') arr.push(moved);
      else if (t.idx != null) {
        let to = t.idx + (t.pos === 'after' ? 1 : 0);
        if (p.idx < to) to -= 1;
        arr.splice(to, 0, moved);
      } else return;
      return commit({ ...cur, [tab]: arr }, 'reorder');
    }
    // field chip
    if (t.drop === 'add') {
      if (p.field !== 'what') return setStatus('Drop a WHAT chip here to add a question');
      const who = palette.who[Math.floor(Math.random() * palette.who.length)];
      arr.push({ id: hexId(), who: { kind: who.kind, value: who.value }, what: { id: p.value.id, text: p.value.text }, where: null });
      return commit({ ...cur, [tab]: arr }, 'add');
    }
    if (t.idx == null) return;
    const target = arr[t.idx];
    if (p.field === 'where' && !target.what.text.includes('{where}')) return setStatus('That question has no WHERE (only touch dares at Adult level).');
    if (p.from != null && p.from !== t.idx) {
      // swap the component between two questions
      const src = arr[p.from];
      const tv = p.field === 'who' ? target.who : p.field === 'what' ? target.what : target.where;
      if (p.field === 'where' && !src.what.text.includes('{where}')) return;
      arr[t.idx] = setField(target, p.field, p.value);
      arr[p.from] = setField(src, p.field, tv);
    } else if (p.from == null) {
      arr[t.idx] = setField(target, p.field, p.value);
    } else return;
    commit({ ...cur, [tab]: arr }, `set ${p.field}`);
  }

  const chip = (field, value, label, from = null, extra = '') => (
    <span className={`chip ${field} ${extra}`} data-chip={field}
      onPointerDown={(e) => startDrag(e, { kind: 'field', field, value, from }, label, `chip ${field}`)}>
      {field === 'who' && value?.kind === 'player' && <GenderDot gender={genders[value.value]} />}{label}
    </span>
  );

  function move(idx, d) {
    const arr = queues[tab].slice();
    const j = idx + d;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    commit({ ...queues, [tab]: arr }, 'reorder');
  }
  function remove(idx) {
    commit({ ...queues, [tab]: queues[tab].filter((_, i) => i !== idx) }, 'remove');
  }
  function addRandom() {
    const w = palette.what[tab][Math.floor(Math.random() * palette.what[tab].length)];
    const who = palette.who[Math.floor(Math.random() * palette.who.length)];
    commit({ ...queues, [tab]: [{ id: hexId(), who: { kind: who.kind, value: who.value }, what: { id: w.id, text: w.text }, where: null }, ...queues[tab]] }, 'add');
  }
  const preview = (it) => {
    let t = it.what.text;
    if (!t.includes('{who}')) t = `Tell {who}: ${t}`;
    return t.replaceAll('{who}', whoLabel(it.who)).replaceAll('{where}', it.where || '…');
  };
  const hov = (drop, idx, field = '') => hover && hover.key === `${drop}:${idx}:${field}`;

  if (room.status && room.status !== 'active') {
    return (
      <>
        <div className="topbar" style={{ marginTop: 8 }}>
          <Link className="icon-btn" href="/room" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>← Rooms</Link>
          <span className={`badge ${room.level}`}>{lvl?.emoji} {lvl?.name}</span>
        </div>
        <p className="room-code">Room<b>{room.code}</b></p>
        <div className="closed-banner" data-room-status={room.status}>
          {room.closedReason === 'idle' ? '💤 Room closed (1 hour without play)' : '🏁 Game over'} · {room.turn} turns
        </div>
        <Results room={room} />
      </>
    );
  }

  return (
    <>
      <div className="topbar" style={{ marginTop: 8 }}>
        <Link className="icon-btn" href="/room" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>← Rooms</Link>
        <span className={`badge ${room.level}`}>{lvl?.emoji} {lvl?.name}</span>
      </div>
      <p className="room-code">Room<b>{room.code}</b></p>

      <div className="live-card section" data-live>
        <div className="label">Live · turn {room.turn} · <span data-live-left>{room.questionsLeft}/{room.total} questions left</span></div>
        <div><strong data-live-current><GenderDot gender={genders[room.current]} />{room.current}</strong>’s turn</div>
        {room.card ? <p data-live-card style={{ margin: '8px 0 0' }}>{room.card.type === 'truth' ? '🤫' : '🔥'} <WithDot text={room.card.text} name={room.card.whoRef?.kind === 'player' ? room.card.who : null} gender={genders[room.card.who]} /></p> : <p className="count" style={{ margin: '8px 0 0' }}>Choosing Truth or Dare…</p>}
        {room.lastChicken && <p className="count" data-live-chicken style={{ margin: '6px 0 0' }}>🐔 {room.lastChicken.player} chickened out: {DRINK_CATEGORIES.find((c) => c.id === room.lastChicken.category)?.name} · {room.lastChicken.text}</p>}
        <details style={{ marginTop: 10 }}>
          <summary className="count">History ({room.history.length})</summary>
          <ul className="history" style={{ marginTop: 8 }}>
            {room.history.map((h, i) => (
              <li key={i}><div className="meta">#{h.turn} · {h.result === 'surprise' ? `✨ Surprise · ${h.stype}` : <><GenderDot gender={genders[h.player]} />{h.player}</>} · {h.result === 'surprise' ? '' : h.result === 'chicken' ? `🐔 chickened out → ${h.drink?.text || ''}` : h.result === 'drank' ? '🍻 drank' : '✓ done'}</div>{h.text || '(passed)'}</li>
            ))}
          </ul>
        </details>
      </div>

      <div className="tabs" role="tablist">
        {['dare', 'truth'].map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-tab={t}>
            {t === 'dare' ? '🔥 Dare' : '🤫 Truth'} queue ({queues[t].length})
          </button>
        ))}
      </div>

      <div className="palette">
        {tab === 'dare' && (
          <div className="cat-bar">
            <select value={catId} onChange={(e) => setCatId(e.target.value)} aria-label="Quick category" data-cat-select>
              <option value="">All chips (no category)</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <details open><summary>WHO · drag onto a question{cat ? ` (${pWho.length})` : ''}</summary>
          <div className="chips" data-palette="who">{pWho.length === 0 && <span className="count">No matching players in this room.</span>}{pWho.map((w) => <span key={w.kind + w.value}>{chip('who', { kind: w.kind, value: w.value }, w.label)}</span>)}</div>
        </details>
        <details open={!!cat}><summary>WHAT · {tab} bank ({pWhat.length})</summary>
          <div className="chips" data-palette="what">{pWhat.map((w) => <span key={w.id}>{chip('what', { id: w.id, text: w.text }, shortWhat(w.text))}</span>)}</div>
        </details>
        {tab === 'dare' && room.level === 'adult' && (
          <details open={!!cat}><summary>WHERE · touch dares ({pWhere.length})</summary>
            <div className="chips" data-palette="where">{pWhere.map((w) => <span key={w}>{chip('where', w, w)}</span>)}</div>
          </details>
        )}
        <div className="status" aria-live="polite">{status}</div>
      </div>

      {tab === 'dare' && <CategoryManager cats={cats} reload={loadCats} palette={palette} level={room.level} />}
      <DrinksEditor />
      <SurpriseEditor />
      <div className="row section"><button className="btn btn-ghost" onClick={addRandom} data-act="add-q">＋ Add question at top</button></div>
      <div className="qlist" data-queue={tab}>
        {list.map((it, idx) => {
          const touch = it.what.text.includes('{where}');
          const cls = hover && hover.drop === 'card' && hover.idx === idx ? (drag?.cls === 'qcard' ? `drop-${hover.pos}` : 'drop-hover') : '';
          return (
            <div key={it.id} className={`qcard ${cls}`} data-drop="card" data-idx={idx} data-qid={it.id}>
              <div className="qhead">
                <span className="handle" aria-label="Drag to reorder" onPointerDown={(e) => startDrag(e, { kind: 'item', idx }, `#${idx + 1} ${preview(it).slice(0, 40)}…`, 'qcard')}>⋮⋮</span>
                <span className="num">#{idx + 1}{idx === 0 ? ' · next up' : ''}</span>
                <button className="small-btn" aria-label="Move up" onClick={() => move(idx, -1)}>↑</button>
                <button className="small-btn" aria-label="Move down" onClick={() => move(idx, 1)}>↓</button>
                <button className="small-btn danger" aria-label="Remove question" onClick={() => remove(idx)} data-act="remove">✕</button>
              </div>
              <div className="slots">
                <span className="slot-label">WHO</span>
                <span className={`slot ${hov('slot', idx, 'who') ? 'drop-hover' : ''}`} data-drop="slot" data-idx={idx} data-field="who">{chip('who', it.who, whoLabel(it.who), idx)}</span>
                <span className="slot-label">WHAT</span>
                <span className={`slot ${hov('slot', idx, 'what') ? 'drop-hover' : ''}`} data-drop="slot" data-idx={idx} data-field="what">{chip('what', it.what, shortWhat(it.what.text), idx)}</span>
                {touch && <>
                  <span className="slot-label">WHERE</span>
                  <span className={`slot ${hov('slot', idx, 'where') ? 'drop-hover' : ''}`} data-drop="slot" data-idx={idx} data-field="where">{it.where ? chip('where', it.where, it.where, idx) : <span className="chip where empty">drop WHERE</span>}</span>
                </>}
              </div>
              <div className="preview" data-preview>{preview(it)}</div>
            </div>
          );
        })}
        <div className={`add-zone ${hover?.drop === 'add' ? 'drop-hover' : ''}`} data-drop="add">Drop a WHAT chip here to add a question at the end</div>
      </div>
      {drag && <div className={`ghost ${drag.cls}`} style={{ left: drag.x, top: drag.y }}>{drag.label}</div>}
    </>
  );
}
