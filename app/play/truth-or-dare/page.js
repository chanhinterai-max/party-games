'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/components/api';
import { LEVELS } from '@/lib/content';

const STORE_PLAYERS = 'partygames.tod.players';
const STORE_LEVEL = 'partygames.tod.level';
const STORE_ROOM = 'partygames.tod.room';
const MIN = 2, MAX = 16;

const load = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export default function TruthOrDare() {
  const [names, setNames] = useState(['', '']);
  const [level, setLevel] = useState('children');
  const [error, setError] = useState('');
  const [room, setRoom] = useState(null);
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef();

  useEffect(() => {
    const p = load(STORE_PLAYERS, []);
    if (Array.isArray(p) && p.length >= MIN) setNames(p.slice(0, MAX));
    const l = load(STORE_LEVEL, 'children');
    if (LEVELS.some((x) => x.id === l)) setLevel(l);
    const r = load(STORE_ROOM, null);
    if (r?.code && r?.token) {
      api(`/api/rooms/${r.code}`).then((d) => { setRoom(d.room); setToken(r.token); }).catch(() => save(STORE_ROOM, null));
    }
  }, []);

  function flash(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }

  async function start() {
    setError('');
    const filled = names.map((n) => n.trim()).filter(Boolean);
    if (filled.length < MIN) return setError(`Add at least ${MIN} player names.`);
    const seen = new Set();
    for (const n of filled) {
      if (seen.has(n.toLowerCase())) return setError(`"${n}" is entered twice. Make each name unique.`);
      seen.add(n.toLowerCase());
    }
    setBusy(true);
    try {
      const d = await api('/api/rooms', { method: 'POST', body: { game: 'truth-or-dare', level, players: filled } });
      save(STORE_PLAYERS, filled);
      save(STORE_LEVEL, level);
      save(STORE_ROOM, { code: d.room.code, token: d.token });
      setNames(filled);
      setToken(d.token);
      setRoom(d.room);
      window.scrollTo(0, 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function act(body) {
    setBusy(true);
    try {
      const d = await api(`/api/rooms/${room.code}/action`, { method: 'POST', body, headers: { 'x-room-token': token } });
      setRoom(d.room);
      return d.room;
    } catch (e) {
      flash(e.message);
    } finally {
      setBusy(false);
    }
  }

  function endGame() {
    save(STORE_ROOM, null);
    setRoom(null);
    setToken(null);
  }

  if (!room) {
    const lvl = LEVELS.find((l) => l.id === level);
    return (
      <>
        <div className="topbar" style={{ marginTop: 8 }}>
          <Link className="icon-btn" href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>← Games</Link>
          <h2>🍸 Truth or Dare</h2>
          <span style={{ width: 44 }} />
        </div>
        <div className="section">
          <div className="row" style={{ alignItems: 'center' }}>
            <div className="label" style={{ margin: 0 }}>Who&apos;s playing?</div>
            <div className="count" style={{ textAlign: 'right' }}>{names.length} / {MAX}</div>
          </div>
          <div className="players" style={{ marginTop: 10 }}>
            {names.map((n, i) => (
              <div className="player-row" key={i}>
                <input type="text" autoComplete="off" autoCapitalize="words" maxLength={20} placeholder={`Player ${i + 1}`}
                  value={n} aria-label={`Player ${i + 1} name`} data-idx={i}
                  onChange={(e) => { const c = names.slice(); c[i] = e.target.value; setNames(c); }} />
                <button className="remove" aria-label={`Remove player ${i + 1}`} disabled={names.length <= MIN}
                  style={names.length <= MIN ? { opacity: 0.35 } : undefined}
                  onClick={() => setNames(names.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>
          <div className="section">
            <button className="btn btn-ghost" data-act="add" disabled={names.length >= MAX} onClick={() => setNames([...names, ''])}>＋ Add player</button>
          </div>
        </div>
        <div className="section">
          <div className="label">Level</div>
          <div className="levels">
            {LEVELS.map((l) => (
              <button key={l.id} className={`level ${l.id}`} data-level={l.id} aria-pressed={level === l.id} onClick={() => setLevel(l.id)}>
                <span className="e">{l.emoji}</span><span className="t">{l.name}</span>
              </button>
            ))}
          </div>
          <p className="level-hint">{lvl.hint}</p>
        </div>
        <div className="error" role="alert">{error}</div>
        <div className="section">
          <button className="btn btn-primary" data-act="start" disabled={busy} onClick={start}>{busy ? 'Starting…' : "Let's play 🔥"}</button>
        </div>
        <aside className="note">Don&apos;t want a card? Drink instead: a small sip, and <strong>water counts</strong>.</aside>
      </>
    );
  }

  const lvl = LEVELS.find((l) => l.id === room.level) || LEVELS[0];
  const card = room.card;
  return (
    <>
      <div className="topbar" style={{ marginTop: 8 }}>
        <Link className="icon-btn" href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>← Games</Link>
        <span className={`badge ${lvl.id}`}>{lvl.emoji} {lvl.name}</span>
        <button className="icon-btn" data-act="end" onClick={endGame}>New game</button>
      </div>
      <p className="room-code">Room code<b data-room-code>{room.code}</b></p>
      <div className="turn">
        <div className="pass">{card ? 'Your card' : 'Pass the phone to'}</div>
        <div className="who">{room.current}{card ? '' : '’s turn'}</div>
        {!card && <div className="pass">Truth or Dare? 👀</div>}
      </div>
      {card ? (
        <>
          <div className={`prompt-card ${card.type}`} key={card.itemId}>
            <div className="kind">{card.type === 'truth' ? '🤫 Truth' : '🔥 Dare'}</div>
            <div className="text" data-card-text>{card.text}</div>
          </div>
          <div className="stack">
            <button className="btn btn-primary" data-act="next" disabled={busy} onClick={async () => { await act({ action: 'done' }); window.scrollTo(0, 0); }}>Done ✓ · Next player</button>
            <button className="btn btn-sip" data-act="skip" disabled={busy} onClick={async () => { const who = room.current; const r = await act({ action: 'sip' }); if (r) flash(`🍻 ${who} drinks instead (water counts!)`); }}>Drink instead 🍻</button>
          </div>
        </>
      ) : (
        <>
          <div className="choice">
            <button className="btn btn-truth" data-act="truth" disabled={busy} onClick={() => act({ action: 'draw', type: 'truth' })}>🤫<span>Truth</span><small>spill a secret</small></button>
            <button className="btn btn-dare" data-act="dare" disabled={busy} onClick={() => act({ action: 'draw', type: 'dare' })}>🔥<span>Dare</span><small>do the thing</small></button>
          </div>
          <div className="section">
            <button className="btn btn-ghost" data-act="pass" disabled={busy} onClick={async () => { const who = room.current; const r = await act({ action: 'sip' }); if (r) flash(`🍻 ${who} drinks instead (water counts!)`); }}>Pass turn (drink) 🍻</button>
          </div>
        </>
      )}
      <div className="label" style={{ textAlign: 'center', marginTop: 22 }}>Change level</div>
      <div className="level-switch">
        {LEVELS.map((l) => (
          <button key={l.id} className={`level ${l.id}`} data-level={l.id} aria-pressed={room.level === l.id} disabled={busy}
            onClick={async () => { if (room.level !== l.id && (await act({ action: 'level', level: l.id }))) { save(STORE_LEVEL, l.id); flash(`Level: ${l.emoji} ${l.name}`); } }}>
            <span className="e">{l.emoji}</span><span className="t">{l.name}</span>
          </button>
        ))}
      </div>
      <div className="scores" aria-label="Drinks taken">
        {room.players.map((p) => <span key={p}>{p} · {room.sips?.[p] || 0} 🍻</span>)}
      </div>
      <p className="footer">Sips are small and water always counts. 💜</p>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
