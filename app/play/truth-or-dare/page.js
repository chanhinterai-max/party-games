'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/components/api';
import { LEVELS, DRINK_CATEGORIES } from '@/lib/content';
import GenderDot, { WithDot } from '@/components/GenderDot';
import RunningAnimals from '@/components/RunningAnimals';

const STORE_PLAYERS = 'partygames.tod.players.v3';
const STORE_LEVEL = 'partygames.tod.level';
const STORE_ROOM = 'partygames.tod.room';
const MIN = 2, MAX = 16;
const blank = () => ({ name: '', gender: '' });

const load = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export default function TruthOrDare() {
  const [players, setPlayers] = useState([blank(), blank()]);
  const [level, setLevel] = useState('children');
  const [error, setError] = useState('');
  const [missing, setMissing] = useState([]);
  const [room, setRoom] = useState(null);
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [reveal, setReveal] = useState(null);
  const toastTimer = useRef();
  const petted = useRef([]);
  const onPetted = useCallback((list) => { petted.current = list; }, []);

  useEffect(() => {
    let p = load(STORE_PLAYERS, null);
    if (!Array.isArray(p)) {
      const old = load('partygames.tod.players', []);
      p = Array.isArray(old) ? old.filter((x) => typeof x === 'string').map((name) => ({ name, gender: '' })) : [];
    }
    if (p.length >= MIN) setPlayers(p.slice(0, MAX));
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
  const update = (i, patch) => setPlayers(players.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  async function start() {
    setError('');
    setMissing([]);
    const filled = players.map((p) => ({ ...p, name: p.name.trim() })).filter((p) => p.name);
    if (filled.length < MIN) return setError(`Add at least ${MIN} player names.`);
    const seen = new Set();
    for (const p of filled) {
      if (seen.has(p.name.toLowerCase())) return setError(`"${p.name}" is entered twice. Make each name unique.`);
      seen.add(p.name.toLowerCase());
    }
    const noGender = players.map((p, i) => (p.name.trim() && !p.gender ? i : -1)).filter((i) => i >= 0);
    if (noGender.length) { setMissing(noGender); return setError('Pick Male or Female for every player.'); }
    setBusy(true);
    try {
      const d = await api('/api/rooms', { method: 'POST', body: { game: 'truth-or-dare', level, players: filled } });
      save(STORE_PLAYERS, filled);
      save(STORE_LEVEL, level);
      save(STORE_ROOM, { code: d.room.code, token: d.token });
      setPlayers(filled);
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

  async function chickenOut() {
    const r = await act({ action: 'chicken', petted: petted.current });
    if (r?.lastChicken) setReveal(r.lastChicken);
  }

  function endGame() {
    save(STORE_ROOM, null);
    setRoom(null);
    setToken(null);
  }

  const animals = <RunningAnimals onPettedChange={onPetted} />;

  if (!room) {
    const lvl = LEVELS.find((l) => l.id === level);
    return (
      <>
        {animals}
        <div className="topbar" style={{ marginTop: 8 }}>
          <Link className="icon-btn" href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>← Games</Link>
          <h2>🍸 Truth or Dare</h2>
          <span style={{ width: 44 }} />
        </div>
        <div className="section">
          <div className="row" style={{ alignItems: 'center' }}>
            <div className="label" style={{ margin: 0 }}>Who’s playing?</div>
            <div className="count" style={{ textAlign: 'right' }}>{players.length} / {MAX}</div>
          </div>
          <div className="players" style={{ marginTop: 10 }}>
            {players.map((p, i) => (
              <div className={`player-row ${missing.includes(i) ? 'missing' : ''}`} key={i}>
                <input type="text" autoComplete="off" autoCapitalize="words" maxLength={20} placeholder={`Player ${i + 1}`}
                  value={p.name} aria-label={`Player ${i + 1} name`} data-idx={i}
                  onChange={(e) => update(i, { name: e.target.value })} />
                <div className="gender-pick" role="group" aria-label={`Player ${i + 1} gender`}>
                  <button type="button" className="male" aria-pressed={p.gender === 'male'} data-gender={`${i}-male`} onClick={() => update(i, { gender: 'male' })}>
                    <GenderDot gender="male" />M</button>
                  <button type="button" className="female" aria-pressed={p.gender === 'female'} data-gender={`${i}-female`} onClick={() => update(i, { gender: 'female' })}>
                    <GenderDot gender="female" />F</button>
                </div>
                <button className="remove" aria-label={`Remove player ${i + 1}`} disabled={players.length <= MIN}
                  style={players.length <= MIN ? { opacity: 0.35 } : undefined}
                  onClick={() => setPlayers(players.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>
          <div className="section">
            <button className="btn btn-ghost" data-act="add" disabled={players.length >= MAX} onClick={() => setPlayers([...players, blank()])}>＋ Add player</button>
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
        <aside className="note">Too scared for a card? Hit <strong>Chicken out 🐔</strong> and fate picks your drink. Water counts.</aside>
      </>
    );
  }

  const lvl = LEVELS.find((l) => l.id === room.level) || LEVELS[0];
  const card = room.card;
  const g = room.genders || {};
  const cat = reveal && DRINK_CATEGORIES.find((c) => c.id === reveal.category);
  return (
    <>
      {animals}
      <div className="topbar" style={{ marginTop: 8 }}>
        <Link className="icon-btn" href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>← Games</Link>
        <span className={`badge ${lvl.id}`}>{lvl.emoji} {lvl.name}</span>
        <button className="icon-btn" data-act="end" onClick={endGame}>New game</button>
      </div>
      <p className="room-code">Room code<b data-room-code>{room.code}</b></p>
      <div className="turn">
        <div className="pass">{card ? 'Your card' : 'Pass the phone to'}</div>
        <div className="who"><GenderDot gender={g[room.current]} />{room.current}{card ? '' : '’s turn'}</div>
        {!card && <div className="pass">Truth or Dare? 👀</div>}
      </div>
      {card ? (
        <>
          <div className={`prompt-card ${card.type}`} key={card.itemId}>
            <div className="kind">{card.type === 'truth' ? '🤫 Truth' : '🔥 Dare'}</div>
            <div className="text" data-card-text>
              <WithDot text={card.text} name={card.whoIsPlayer || card.whoRef?.kind === 'player' ? card.who : null} gender={g[card.who]} />
            </div>
          </div>
          <div className="stack">
            <button className="btn btn-primary" data-act="next" disabled={busy} onClick={async () => { await act({ action: 'done' }); window.scrollTo(0, 0); }}>Done ✓ · Next player</button>
            <button className="btn btn-chicken" data-act="chicken" disabled={busy} onClick={chickenOut}>Chicken out 🐔</button>
          </div>
        </>
      ) : (
        <>
          <div className="choice">
            <button className="btn btn-truth" data-act="truth" disabled={busy} onClick={() => act({ action: 'draw', type: 'truth' })}>🤫<span>Truth</span><small>spill a secret</small></button>
            <button className="btn btn-dare" data-act="dare" disabled={busy} onClick={() => act({ action: 'draw', type: 'dare' })}>🔥<span>Dare</span><small>do the thing</small></button>
          </div>
          <div className="section">
            <button className="btn btn-chicken" data-act="chicken-pass" disabled={busy} onClick={chickenOut}>Chicken out 🐔</button>
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
      <div className="scores" aria-label="Chicken-outs">
        {room.players.map((p) => <span key={p}><GenderDot gender={g[p]} />{p} · {room.sips?.[p] || 0} 🐔</span>)}
      </div>
      <p className="footer">Drink responsibly. Water always counts. 💜</p>
      {reveal && (
        <div className="modal-back" onClick={() => setReveal(null)}>
          <div className="modal" role="dialog" aria-label="Chicken out result" data-reveal={reveal.category} onClick={(e) => e.stopPropagation()}>
            <div className="big">🐔{cat?.emoji}</div>
            <div className="count">{reveal.player} chickened out!</div>
            <div className="cat">{cat?.name}</div>
            <div className="drink" data-reveal-text>{reveal.text}</div>
            <button className="btn btn-primary" data-act="reveal-ok" onClick={() => setReveal(null)}>Cheers! Next player ➜</button>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
