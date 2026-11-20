'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/components/api';
import { LEVELS, DRINK_CATEGORIES } from '@/lib/content';
import GenderDot, { WithDot } from '@/components/GenderDot';
import dynamic from 'next/dynamic';
import RunningAnimals from '@/components/RunningAnimals';

// v9: in-game pieces load on demand (prefetched as soon as a game starts) → smaller first load of the setup screen
const loadResults = () => import('@/components/Results');
const loadTimer = () => import('@/components/play/Timer');
const loadConfetti = () => import('@/components/play/Confetti');
const loadSurprise = () => import('@/components/play/SurpriseBody');
const Results = dynamic(loadResults, { ssr: false });
const Timer = dynamic(loadTimer, { ssr: false });
const Confetti = dynamic(loadConfetti, { ssr: false });
const SurpriseBody = dynamic(loadSurprise, { ssr: false });
const prefetchGame = () => { loadTimer(); loadSurprise(); loadResults(); loadConfetti(); };
import AnimalList from '@/components/party/AnimalList';
import PlayerRows from '@/components/party/PlayerRows';
import useNoSelect from '@/components/party/useNoSelect';
import { STORE_PLAYERS, MIN, MAX, blank, load, save, loadPlayers } from '@/components/party/store';

const STORE_LEVEL = 'partygames.tod.level';
const STORE_ROOM = 'partygames.tod.room';
const Shimmer = ({ w = '80%', h = 22 }) => <span className="shimmer" style={{ width: w, height: h }} aria-hidden="true" />;

export default function TruthOrDare() {
  useNoSelect();
  const [players, setPlayers] = useState([blank(), blank()]);
  const [level, setLevel] = useState('children');
  const [error, setError] = useState('');
  const [missing, setMissing] = useState([]);
  const [room, setRoom] = useState(null);
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);
  // v5 instant feel: the tapped action drives the UI immediately; the server response fills in content.
  const [pending, setPending] = useState(null); // 'truth' | 'dare' | 'next' | 'chicken' | 'surprise' | 'level' | 'end'
  const [revealing, setRevealing] = useState(false); // v6 open animal list shown once after Start
  const [reduced, setReduced] = useState(false);
  const [toast, setToast] = useState('');
  const [reveal, setReveal] = useState(null);
  const toastTimer = useRef();
  const [petMs, setPetMs] = useState(20000);
  const petted = useRef({}); // id -> pet start (performance.now())
  const onPetted = useCallback((map) => { petted.current = map; }, []);

  useEffect(() => {
    api('/api/config').then((d) => d?.petSeconds && setPetMs(d.petSeconds * 1000)).catch(() => {});
    const p = loadPlayers();
    if (p) setPlayers(p);
    const l = load(STORE_LEVEL, 'children');
    if (LEVELS.some((x) => x.id === l)) setLevel(l);
    setReduced(!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    const r = load(STORE_ROOM, null);
    if (r?.code && r?.token) {
      api(`/api/rooms/${r.code}`).then((d) => {
        setRoom(d.room); setToken(r.token);
        if (d.room.status === 'active' && r.revealed === false) setRevealing(true);
      }).catch(() => save(STORE_ROOM, null));
    }
  }, []);

  function flash(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }

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
      save(STORE_ROOM, { code: d.room.code, token: d.token, revealed: false });
      setPlayers(filled);
      setToken(d.token);
      setRoom(d.room);
      setRevealing(true);
      window.scrollTo(0, 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // One request per tap; the response IS the new state (no refetch, no prefetch, no cached cards).
  const inFlight = useRef(false);
  async function act(body, kind) {
    if (inFlight.current) return null; // double-tap guard (sync, before React re-renders)
    inFlight.current = true;
    setPending(kind || body.action);
    setBusy(true);
    try {
      const d = await api(`/api/rooms/${room.code}/action`, { method: 'POST', body, headers: { 'x-room-token': token } });
      setRoom(d.room);
      return d.room;
    } catch (e) {
      flash(e.message);
      if (e.status === 409) api(`/api/rooms/${room.code}`).then((d) => setRoom(d.room)).catch(() => {});
      return null;
    } finally {
      inFlight.current = false;
      setPending(null);
      setBusy(false);
    }
  }

  async function chickenOut() {
    const now = performance.now();
    const pets = Object.entries(petted.current).map(([id, start]) => ({ id, elapsedMs: Math.round(now - start) }));
    const r = await act({ action: 'chicken', petted: pets }, 'chicken');
    if (r?.lastChicken) setReveal(r.lastChicken);
  }
  function finishReveal() {
    setRevealing(false);
    const r = load(STORE_ROOM, null);
    if (r) save(STORE_ROOM, { ...r, revealed: true });
    window.scrollTo(0, 0);
  }

  function endGame() {
    save(STORE_ROOM, null);
    setRoom(null);
    setToken(null);
    setRevealing(false);
  }

  async function endByHost() {
    if (!confirm('End the game now and show the results?')) return;
    await act({ action: 'end' }, 'end');
    window.scrollTo(0, 0);
  }

  // v6: in a game the running animals ARE the players' animals (the Human runs as 🏃).
  const roomAnimals = room?.animals && room.status === 'active'
    ? room.players.map((p) => room.animals[p]).filter(Boolean).map((a) => ({ id: a.id, emoji: a.role === 'human' ? '🏃' : a.emoji, happy: a.role === 'human' ? '🧍' : a.emoji, name: a.name }))
    : null;
  useEffect(() => { if (room?.code) { const id = setTimeout(prefetchGame, 300); return () => clearTimeout(id); } return undefined; }, [room?.code]);
  // v10: 'Chicken out' appears only once the question is REVEALED: the drawn card is shown and the 0.45 s flip has
  // finished (never before or during the flip / shimmer). readyCard = the card id whose flip has completed.
  const [readyCard, setReadyCard] = useState(null);
  const shownCard = pending !== 'truth' && pending !== 'dare' && room?.card ? (room.card.itemId ?? room.card.text) : null;
  useEffect(() => {
    if (shownCard == null) { setReadyCard(null); return undefined; }
    const id = setTimeout(() => setReadyCard(shownCard), reduced ? 0 : 480);
    return () => clearTimeout(id);
  }, [shownCard, reduced]);
  const animals = <RunningAnimals key={room?.code || 'setup'} animals={roomAnimals} onPettedChange={onPetted} petMs={petMs} />;

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
          <PlayerRows players={players} setPlayers={setPlayers} missing={missing} />
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
  if (room.status && room.status !== 'active') {
    const lc = room.lastChicken && DRINK_CATEGORIES.find((c) => c.id === room.lastChicken.category);
    return (
      <>
        <div className="topbar" style={{ marginTop: 8 }}>
          <Link className="icon-btn" href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>← Games</Link>
          <span className={`badge ${lvl.id}`}>{lvl.emoji} {lvl.name}</span>
          <button className="icon-btn" data-act="end" onClick={endGame}>New game</button>
        </div>
        <p className="room-code">Room code<b data-room-code>{room.code}</b></p>
        {reveal && lc && <div className="closed-banner">🐔 {reveal.player}: {lc.emoji} {reveal.text}</div>}
        <Results room={room} />
        <Confetti />
        <div className="section"><button className="btn btn-primary" data-act="new-game" onClick={endGame}>Play again 🔁</button></div>
        <p className="footer">Drink responsibly. Water always counts. 💜</p>
      </>
    );
  }
  const g = room.genders || {};
  const cat = reveal && DRINK_CATEGORIES.find((c) => c.id === reveal.category);
  const sp = room.surprise;
  if (revealing) {
    const has = (r) => Object.values(room.animals || {}).filter((a) => a.role === r).length;
    return (
      <>
        <div className="topbar" style={{ marginTop: 8 }}>
          <Link className="icon-btn" href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>← Games</Link>
          <span className={`badge ${lvl.id}`}>{lvl.emoji} {lvl.name}</span>
          <span style={{ width: 44 }} />
        </div>
        <div className="reveal-stage" data-reveal-stage>
          <h2 className="reveal-title">🐾 Meet the party animals!</h2>
          <p className="count" style={{ textAlign: 'center' }}>{has('predator')} predators · {has('prey')} prey{has('human') ? ' · 1 Human' : ''}</p>
          <AnimalList players={room.players} animals={room.animals} genders={room.genders} />
          <p className="count" style={{ textAlign: 'center' }}>When your animal is called in a surprise, it’s your moment! Check again anytime in 🐾 Animals.</p>
          <button className="btn btn-primary" data-act="begin" onClick={finishReveal}>Let the party begin 🔥</button>
        </div>
      </>
    );
  }
  // Flip state: Truth/Dare tap flips immediately; Next / Chicken / surprise Done flip back immediately.
  const drawing = pending === 'truth' || pending === 'dare';
  const leaving = pending === 'next' || pending === 'chicken' || pending === 'surprise';
  const flipped = drawing || (!leaving && !!(card || sp));
  const faceType = drawing ? pending : card ? card.type : sp ? 'surprise' : 'truth';
  const showCardButtons = drawing || (!leaving && !!card);
  const showSurpriseButtons = !leaving && !drawing && !card && !!sp;
  const heat = room.total ? Math.min(1, (room.drawn || 0) / room.total) : 0;
  return (
    <>
      {animals}
      <div className="topbar" style={{ marginTop: 8 }}>
        <Link className="icon-btn" href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>← Games</Link>
        <span className={`badge ${lvl.id}`}>{lvl.emoji} {lvl.name}</span>
        <button className="icon-btn" data-act="end" onClick={endGame}>New game</button>
      </div>
      <p className="room-code">Room code<b data-room-code>{room.code}</b></p>
      <div className="heat" data-heat={Math.round(heat * 100)} aria-label={`Heat: ${room.drawn || 0} of ${room.total} turns played`}>
        <span className="heat-label">🔥 Heat</span>
        <span className="heat-bar"><span className="heat-fill" style={{ transform: `scaleX(${heat})` }} /></span>
        <span className="heat-count" data-questions-left={room.questionsLeft}>{room.drawn || 0}/{room.total}</span>
      </div>
      {room.virus && (
        <div className="virus-banner" data-virus={room.virus.turnsLeft}>🦠 {room.virus.text} <b>· {room.virus.turnsLeft} turn{room.virus.turnsLeft === 1 ? '' : 's'} left</b></div>
      )}
      <div className="turn">
        {sp && !leaving && !drawing ? (
          <><div className="pass">Everyone!</div><div className="who">✨ Surprise card</div></>
        ) : leaving ? (
          <><div className="pass">Pass the phone to</div><div className="who"><Shimmer w="55%" h={34} /></div></>
        ) : (
          <>
            <div className="pass">{flipped ? 'Your card' : 'Pass the phone to'}</div>
            <div className="who"><GenderDot gender={g[room.current]} />{room.current}{flipped ? '' : '’s turn'}</div>
          </>
        )}
      </div>
      <div className={`flip-card ${flipped ? 'flipped' : ''} ${reduced ? 'reduced' : ''}`} data-flipped={flipped ? '1' : '0'}>
        <div className="flip-inner">
          <div className="face face-a" aria-hidden={flipped}>
            <div className="deck-mark">🤫 <span>or</span> 🔥</div>
            <div className="count">Truth or Dare?</div>
          </div>
          <div className={`face face-b ${faceType}`} aria-hidden={!flipped} data-face={faceType}>
            {drawing || (!card && !sp) ? (
              <>
                <div className="kind">{faceType === 'truth' ? '🤫 Truth' : '🔥 Dare'}</div>
                <div className="text"><Shimmer w="90%" /><Shimmer w="70%" /><Shimmer w="50%" /></div>
              </>
            ) : card ? (
              <>
                <div className="kind" data-human-card={card.human ? '1' : undefined}>{card.type === 'truth' ? '🤫 Truth' : '🔥 Dare'}{card.human ? ' · 🧍 Human card' : ''}</div>
                <div className="text card-in" data-card-text key={card.itemId}>
                  <WithDot text={card.text} name={card.whoIsPlayer || card.whoRef?.kind === 'player' ? card.who : null} gender={g[card.who]} />
                </div>
                {card.seconds ? <Timer key={`timer-${card.itemId}`} seconds={card.seconds} /> : null}
              </>
            ) : (
              <SurpriseBody key={sp.id} sp={sp} players={room.players} />
            )}
          </div>
        </div>
      </div>
      {showCardButtons ? (
        <div className="stack">
          <button className={`btn btn-primary ${pending === 'next' ? 'is-pending' : ''}`} data-act="next" disabled={busy}
            onClick={async () => { await act({ action: 'done' }, 'next'); window.scrollTo(0, 0); }}>Done ✓ · Next player</button>
          {(pending === 'chicken' || (!drawing && readyCard != null && readyCard === shownCard)) && (
            <button className={`btn btn-chicken chicken-in ${pending === 'chicken' ? 'is-pending' : ''}`} data-act="chicken" disabled={busy} onClick={chickenOut}>Chicken out 🐔</button>
          )}
        </div>
      ) : showSurpriseButtons ? (
        <div className="stack">
          <button className="btn btn-primary" data-act="surprise-done" disabled={busy}
            onClick={async () => { await act({ action: 'surprise_done' }, 'surprise'); window.scrollTo(0, 0); }}>Done ✓ · Back to the game</button>
        </div>
      ) : (
        <>
          <div className="choice">
            <button className={`btn btn-truth ${pending === 'truth' ? 'is-pending' : ''}`} data-act="truth" disabled={busy} onClick={() => act({ action: 'draw', type: 'truth' }, 'truth')}>🤫<span>Truth</span><small>spill a secret</small></button>
            <button className={`btn btn-dare ${pending === 'dare' ? 'is-pending' : ''}`} data-act="dare" disabled={busy} onClick={() => act({ action: 'draw', type: 'dare' }, 'dare')}>🔥<span>Dare</span><small>do the thing</small></button>
          </div>
        </>
      )}
      <div className="label" style={{ textAlign: 'center', marginTop: 22 }}>Change level</div>
      <div className="level-switch">
        {LEVELS.map((l) => (
          <button key={l.id} className={`level ${l.id} ${pending === 'level' && room.level !== l.id ? 'is-pending' : ''}`} data-level={l.id} aria-pressed={room.level === l.id} disabled={busy}
            onClick={async () => { if (room.level !== l.id && (await act({ action: 'level', level: l.id }, 'level'))) { save(STORE_LEVEL, l.id); flash(`Level: ${l.emoji} ${l.name}`); } }}>
            <span className="e">{l.emoji}</span><span className="t">{l.name}</span>
          </button>
        ))}
      </div>
      <details className="animals-box" data-animals-box>
        <summary>🐾 Animals <small>{room.players.length} players</small></summary>
        <AnimalList players={room.players} animals={room.animals} genders={g} />
      </details>
      <div className="scores" aria-label="Chicken-outs">
        {room.players.map((p) => <span key={p}><GenderDot gender={g[p]} />{p} · {room.sips?.[p] || 0} 🐔</span>)}
      </div>
      <div className="section row">
        <button className={`btn btn-ghost ${pending === 'end' ? 'is-pending' : ''}`} data-act="end-game" disabled={busy} onClick={endByHost}>End game 🏁</button>
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
