'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { api } from '@/components/api';
import PlayerRows from '@/components/party/PlayerRows';
import useNoSelect from '@/components/party/useNoSelect';
import AnimalList from '@/components/party/AnimalList';
import StarAnnounce from '@/components/party/StarAnnounce';
import StarBadge from '@/components/party/StarBadge';
import EndWheel from '@/components/party/EndWheel';
import useEndWheel from '@/components/party/useEndWheel';
import { STORE_PLAYERS, MAX, blank, save, loadPlayers, checkPlayers } from '@/components/party/store';
import { makeHeats, needsFinal } from '@/lib/race/heats';

// v9: the heavy race code (board + engine + map maths) and the results/confetti load on demand, and are
// prefetched while players look at the meet screen → small first load, no wait when the race starts.
const loadBoard = () => import('@/components/race/RaceBoard');
const RaceBoard = dynamic(loadBoard, { ssr: false, loading: () => <div className="race-board" data-race-board data-stage="loading" /> });
const loadResults = () => import('@/components/race/RaceResults');
const loadConfetti = () => import('@/components/play/Confetti');
const RaceResults = dynamic(loadResults, { ssr: false });
const Confetti = dynamic(loadConfetti, { ssr: false });
const loadMaps = () => import('@/lib/race/layoutClient');

// ANIMAL RACE page: setup → meet the animals → heats → final → champion. One server call (start), then the
// whole game runs on this phone.
const MODE_KEY = 'partygames.race.mode';
const Top = ({ right }) => (
  <div className="topbar" style={{ marginTop: 8 }}>
    <Link className="icon-btn" href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>← Games</Link>
    <h2>🏁 Animal Race</h2>
    {right || <span style={{ width: 44 }} />}
  </div>
);

export default function AnimalRace() {
  useNoSelect();
  const [players, setPlayers] = useState([blank(), blank()]);
  const [missing, setMissing] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [game, setGame] = useState(null);   // { players, genders, animals }
  const [planId, setPlanId] = useState(0);  // new map slots for every new plan (rematch)
  const [plan, setPlan] = useState(null);   // { heats: [[names]], results: [], final: null|{...} }
  const [phase, setPhase] = useState('setup'); // setup | meet | race | results | champion
  const [cur, setCur] = useState(0);        // index of the race being run (heats..., then final)
  const [mode, setMode] = useState('normal'); // normal | adult
  const [host, setHost] = useState(false);    // v11: opened from an advanced user's Rooms page (?host=1)
  const end = useEndWheel('animal-race');     // v12b 🎡 shared end-of-game wheel (every race, room or not)

  useEffect(() => { if (new URLSearchParams(window.location.search).get('host') === '1') setHost(true); const p = loadPlayers(); if (p) setPlayers(p); try { if (localStorage.getItem(MODE_KEY) === 'adult') setMode('adult'); } catch {} }, []);
  const pickMode = (m) => { setMode(m); try { localStorage.setItem(MODE_KEY, m); } catch {} };

  async function start() {
    setError(''); setMissing([]); end.reset();
    const c = checkPlayers(players);
    if (c.error) { setError(c.error); setMissing(c.missing || []); return; }
    setBusy(true);
    loadBoard(); loadResults(); loadConfetti(); loadMaps(); // fetch the race code while the server deals the animals
    try {
      const prev = end.prev(); // v12b: last game's wheel proof ({code, token} or {ticket}) → its winner is the ⭐ star
      const d = await api('/api/race/start', { method: 'POST', body: { players: c.filled, ...(host ? { host: true } : {}), ...(prev ? { prev } : {}) } });
      end.clear(); save(STORE_PLAYERS, c.filled); setPlayers(c.filled);
      setGame(d); newPlan(d); setPhase('meet'); window.scrollTo(0, 0);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function newPlan(d) {
    const heats = makeHeats(d.players, d.animals, 4);
    // ⭐ Party Star "crossing partner" (visible star only): with raceCrossPct % an opposite-sex racer of the SAME role
    // joins the star's heat (swapped in) and the board puts the two on crossing tracks (v12: no on-screen label).
    let pair = null; const S = d.star;
    if (S?.perks?.raceCrossOn && Math.random() * 100 < S.perks.raceCrossPct) {
      const role = d.animals[S.player]?.role; const g = d.genders?.[S.player];
      const cands = d.players.filter((p) => p !== S.player && d.animals[p]?.role === role && role !== 'human' && d.genders?.[p] && d.genders[p] !== g);
      if (cands.length) {
        const partner = cands[Math.floor(Math.random() * cands.length)];
        const hs = heats.findIndex((h) => h.includes(S.player)), hp = heats.findIndex((h) => h.includes(partner));
        const out = hs !== hp ? heats[hs].find((p) => p !== S.player) : null;
        if (out !== null && out !== undefined) { // swap the partner with someone else from the star's heat
          const ix = heats[hp].indexOf(partner); heats[hs][heats[hs].indexOf(out)] = partner; heats[hp][ix] = out;
        }
        pair = [S.player, partner];
      }
    }
    setPlan({ heats, results: [], hasFinal: needsFinal(heats), pair });
    setCur(0); setPlanId((x) => x + 1);
  }
  // the races: each heat, then (if more than one heat) the final with the heat winners
  const races = plan ? [...plan.heats, ...(plan.hasFinal ? [plan.results.length >= plan.heats.length ? plan.results.slice(0, plan.heats.length).map((r) => r.winner) : null] : [])] : [];
  const isFinal = (i) => plan && (plan.hasFinal ? i === plan.heats.length : true);
  const labelOf = (i) => (isFinal(i) ? '👑 Final' : `Heat ${i + 1} / ${plan.heats.length}`);

  function onDone(result) {
    setPlan((p) => ({ ...p, results: [...p.results, result] }));
    setPhase('results'); window.scrollTo(0, 0);
  }
  function next() {
    if (isFinal(cur)) {
      setPhase('champion'); window.scrollTo(0, 0);
      // v12b: EVERY race ends with the 🎡 wheel (shared step): the final ranking goes to the server, which spins it
      // (hosted room → room game_end, the room is ended; plain race → /api/wheel with the start ticket)
      end.finish({ order: plan.results[cur].order.map((o) => o.name), room: game.room || null, ticket: game.ticket || null });
      return;
    }
    window.__nextPressAt = performance.now(); // instant-next-heat measurement (press → first board frame)
    setCur(cur + 1); setPhase('race');
  }
  // Build every upcoming race map in a Web Worker while the players look at the meet / results screens.
  // Maps are queued in race order, so the next heat is always first. Same slot key the board asks for.
  const slotOf = (i) => `${planId}:${i}`;
  useEffect(() => {
    if (!plan || (phase !== 'meet' && phase !== 'results')) return undefined;
    let live = true;
    const from = phase === 'meet' ? 0 : cur + 1;
    const sizes = [...plan.heats.map((h) => h.length), ...(plan.hasFinal ? [plan.heats.length] : [])];
    const id = setTimeout(() => {
      loadBoard(); loadResults(); loadConfetti(); // prefetch the code too → no network during or after a race
      loadMaps().then(({ requestLayout, boardSize }) => {
        if (!live) return; const { w, h } = boardSize();
        for (let i = from; i < sizes.length; i++) requestLayout(slotOf(i), w, h, sizes[i], mode);
      });
    }, 50);
    return () => { live = false; clearTimeout(id); };
  }, [phase, plan?.heats, cur, mode, planId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'setup' || !game) {
    return (
      <>
        <Top />
        <div className="section">
          <div className="row" style={{ alignItems: 'center' }}>
            <div className="label" style={{ margin: 0 }}>Who’s racing?</div>
            <div className="count" style={{ textAlign: 'right' }}>{players.length} / {MAX}</div>
          </div>
          <PlayerRows players={players} setPlayers={setPlayers} missing={missing} onFixed={() => { setMissing([]); setError(''); }} />
        </div>
        {host && <p className="host-note" data-host-note>🎛️ New race room under your login (from your Rooms page). Your session’s ⭐ player is shown to everyone with a badge and a perk list.</p>}
        <div className="mode-pick" role="group" aria-label="Mode">
          <button type="button" className={`mode-btn ${mode === 'normal' ? 'on' : ''}`} data-mode-pick="normal" aria-pressed={mode === 'normal'} onClick={() => pickMode('normal')}>🌞 Normal</button>
          <button type="button" className={`mode-btn ${mode === 'adult' ? 'on' : ''}`} data-mode-pick="adult" aria-pressed={mode === 'adult'} onClick={() => pickMode('adult')}>🌙⛈️ Adult</button>
        </div>
        <div className="race-rules" aria-label="How to play">
          <span>👆 Tap = run</span><span>✋ Stop = 🌿 hide</span><span>🤠🔫 shoots movers</span><span>❤️ 2-3 shots</span><span>💥 🐯×🐑</span><span>💕 = 🐣 shield</span><span>🍺 Last drinks</span>
          {mode === 'adult' && <><span>🌙 🌧️ 💨</span><span>⚡ = ✋</span><span>💫 Too fast</span></>}
        </div>
        <div className="error" role="alert">{error}</div>
        <div className="section">
          <button className="btn btn-primary" data-act="start" disabled={busy} onClick={() => start()}>{busy ? 'Starting…' : 'Race! 🏁'}</button>
        </div>
      </>
    );
  }

  const racersOf = (names) => names.map((n) => ({ name: n, role: game.animals[n]?.role || 'prey', emoji: game.animals[n]?.emoji || '🐾', gender: game.genders?.[n], speed: game.animals[n]?.speed ?? 100, star: game.star?.player === n, boost: game.boost?.[n] || null }));

  if (phase === 'meet') {
    const cnt = (r) => Object.values(game.animals).filter((a) => a.role === r).length;
    return (
      <>
        <Top />
        <div className="reveal-stage" data-reveal-stage>
          <h2 className="reveal-title">🐾 Meet the party animals!</h2>
          <p className="count" style={{ textAlign: 'center' }}>{cnt('predator')} predators · {cnt('prey')} prey{cnt('human') ? ' · 1 Human' : ''}</p>
          <AnimalList players={game.players} animals={game.animals} genders={game.genders} star={game.star} />
          {game.room && <p className="count" style={{ textAlign: 'center' }} data-race-room={game.room.code}>Room {game.room.code} · saved under your login</p>}
          <div className="heat-plan" data-heat-plan={plan.heats.map((h) => h.length).join('+')}>
            {plan.heats.map((h, i) => (
              <div key={i} className="heat-chip" data-heat={i} data-heat-names={h.join(",")}>
                <b>{plan.hasFinal ? `Heat ${i + 1}` : '👑 Final'}</b> {h.map((n) => (game.animals[n]?.role === 'human' ? '🧍' : game.animals[n]?.emoji)).join(' ')}
              </div>
            ))}
            {plan.hasFinal && <div className="heat-chip"><b>👑 Final</b> 🥇 × {plan.heats.length}</div>}
          </div>
          <button className="btn btn-primary" data-act="begin" onClick={() => setPhase('race')}>Let’s race 🏁</button>
          <StarAnnounce star={game.star} />
        </div>
      </>
    );
  }

  if (phase === 'race') {
    const names = races[cur];
    return <RaceBoard key={`race-${cur}-${plan.results.length}`} slot={slotOf(cur)} racers={racersOf(names)} label={labelOf(cur)} onDone={onDone} mode={mode} tune={game.tune} pair={plan.pair && names.includes(plan.pair[0]) && names.includes(plan.pair[1]) ? plan.pair : null} />;
  }

  const res = plan.results[cur];
  if (phase === 'results') {
    return (
      <>
        <Top />
        <RaceResults result={res} animals={game.animals} genders={game.genders} title={labelOf(cur)} star={game.star} />
        <div className="section">
          <button className="btn btn-primary" data-act="next-race" onClick={next}>
            {isFinal(cur) ? '👑 Champion' : isFinal(cur + 1) ? '👑 Final ▶' : `Heat ${cur + 2} ▶`}</button>
        </div>
        <StarAnnounce star={game.star} />
      </>
    );
  }

  // champion
  const champ = res.winner; const a = game.animals[champ];
  return (
    <>
      <Top />
      <div className="champion" data-champion={champ}>
        <div className="crown" aria-hidden="true">👑</div>
        <div className="champ-animal">{a?.role === 'human' ? '🧍' : a?.emoji}</div>
        <div className="champ-name">{champ}{game.star?.player === champ && <StarBadge label={game.star.label} />}</div>
        <div className="champ-title">Party Animal</div>
      </div>
      <div className="drink-call small" data-drink={res.drinkers.join(',')}>
        <div className="drink-icon" aria-hidden="true">🍺</div>
        <div className="drink-names">{res.drinkers.map((n) => <b key={n}>{n}</b>)}</div>
        <div className="drink-word">Drink!</div>
      </div>
      <EndWheel end={end} label={game.star?.label} />
      <Confetti />
      <div className="section row">
        <button className="btn btn-primary" data-act="rematch" disabled={busy}
          onClick={() => { if (game.room || end.wheel) start(); else { newPlan(game); setPhase('meet'); } }}>Again 🔁</button>
        <button className="btn btn-ghost" data-act="new-players" onClick={() => { setGame(null); setPlan(null); setPhase('setup'); }}>Players</button>
      </div>
    </>
  );
}
