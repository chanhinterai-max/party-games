'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/components/api';
import PlayerRows from '@/components/party/PlayerRows';
import AnimalList from '@/components/party/AnimalList';
import { STORE_PLAYERS, MAX, blank, save, loadPlayers, checkPlayers } from '@/components/party/store';
import RaceBoard from '@/components/race/RaceBoard';
import RaceResults from '@/components/race/RaceResults';
import Confetti from '@/components/play/Confetti';
import { makeHeats, needsFinal } from '@/lib/race/heats';

// ANIMAL RACE page: setup → meet the animals → heats → final → champion. One server call (start), then the
// whole game runs on this phone.
const Top = ({ right }) => (
  <div className="topbar" style={{ marginTop: 8 }}>
    <Link className="icon-btn" href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>← Games</Link>
    <h2>🏁 Animal Race</h2>
    {right || <span style={{ width: 44 }} />}
  </div>
);

export default function AnimalRace() {
  const [players, setPlayers] = useState([blank(), blank()]);
  const [missing, setMissing] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [game, setGame] = useState(null);   // { players, genders, animals, wild }
  const [plan, setPlan] = useState(null);   // { heats: [[names]], results: [], final: null|{...} }
  const [phase, setPhase] = useState('setup'); // setup | meet | race | results | champion
  const [cur, setCur] = useState(0);        // index of the race being run (heats..., then final)

  useEffect(() => { const p = loadPlayers(); if (p) setPlayers(p); }, []);

  async function start() {
    setError(''); setMissing([]);
    const c = checkPlayers(players);
    if (c.error) { setError(c.error); setMissing(c.missing || []); return; }
    setBusy(true);
    try {
      const d = await api('/api/race/start', { method: 'POST', body: { players: c.filled } });
      save(STORE_PLAYERS, c.filled); setPlayers(c.filled);
      setGame(d); newPlan(d); setPhase('meet'); window.scrollTo(0, 0);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function newPlan(d) {
    const heats = makeHeats(d.players, d.animals, 4);
    setPlan({ heats, results: [], hasFinal: needsFinal(heats) });
    setCur(0);
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
    if (isFinal(cur)) { setPhase('champion'); window.scrollTo(0, 0); return; }
    setCur(cur + 1); setPhase('race');
  }

  if (phase === 'setup' || !game) {
    return (
      <>
        <Top />
        <div className="section">
          <div className="row" style={{ alignItems: 'center' }}>
            <div className="label" style={{ margin: 0 }}>Who’s racing?</div>
            <div className="count" style={{ textAlign: 'right' }}>{players.length} / {MAX}</div>
          </div>
          <PlayerRows players={players} setPlayers={setPlayers} missing={missing} />
        </div>
        <div className="race-rules" aria-label="How to play">
          <span>👆 Tap = run</span><span>✋ Stop = 🌳 / 💤</span><span>❓ = freeze!</span><span>🍺 Last drinks</span>
        </div>
        <div className="error" role="alert">{error}</div>
        <div className="section">
          <button className="btn btn-primary" data-act="start" disabled={busy} onClick={start}>{busy ? 'Starting…' : 'Race! 🏁'}</button>
        </div>
      </>
    );
  }

  const racersOf = (names) => names.map((n) => ({ name: n, role: game.animals[n]?.role || 'prey', emoji: game.animals[n]?.emoji || '🐾' }));

  if (phase === 'meet') {
    const cnt = (r) => Object.values(game.animals).filter((a) => a.role === r).length;
    return (
      <>
        <Top />
        <div className="reveal-stage" data-reveal-stage>
          <h2 className="reveal-title">🐾 Meet the party animals!</h2>
          <p className="count" style={{ textAlign: 'center' }}>{cnt('predator')} predators · {cnt('prey')} prey{cnt('human') ? ' · 1 Human' : ''}</p>
          <AnimalList players={game.players} animals={game.animals} genders={game.genders} />
          <div className="heat-plan" data-heat-plan={plan.heats.map((h) => h.length).join('+')}>
            {plan.heats.map((h, i) => (
              <div key={i} className="heat-chip" data-heat={i}>
                <b>{plan.hasFinal ? `Heat ${i + 1}` : '👑 Final'}</b> {h.map((n) => (game.animals[n]?.role === 'human' ? '🧍' : game.animals[n]?.emoji)).join(' ')}
              </div>
            ))}
            {plan.hasFinal && <div className="heat-chip"><b>👑 Final</b> 🥇 × {plan.heats.length}</div>}
          </div>
          <button className="btn btn-primary" data-act="begin" onClick={() => setPhase('race')}>Let’s race 🏁</button>
        </div>
      </>
    );
  }

  if (phase === 'race') {
    const names = races[cur];
    return <RaceBoard key={`race-${cur}-${plan.results.length}`} racers={racersOf(names)} wild={game.wild} label={labelOf(cur)} onDone={onDone} />;
  }

  const res = plan.results[cur];
  if (phase === 'results') {
    return (
      <>
        <Top />
        <RaceResults result={res} animals={game.animals} genders={game.genders} title={labelOf(cur)} />
        <div className="section">
          <button className="btn btn-primary" data-act="next-race" onClick={next}>
            {isFinal(cur) ? '👑 Champion' : isFinal(cur + 1) ? '👑 Final ▶' : `Heat ${cur + 2} ▶`}</button>
        </div>
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
        <div className="champ-name">{champ}</div>
        <div className="champ-title">Party Animal</div>
      </div>
      <div className="drink-call small" data-drink={res.drinkers.join(',')}>
        <div className="drink-icon" aria-hidden="true">🍺</div>
        <div className="drink-names">{res.drinkers.map((n) => <b key={n}>{n}</b>)}</div>
        <div className="drink-word">Drink!</div>
      </div>
      <Confetti />
      <div className="section row">
        <button className="btn btn-primary" data-act="rematch" onClick={() => { newPlan(game); setPhase('meet'); }}>Again 🔁</button>
        <button className="btn btn-ghost" data-act="new-players" onClick={() => { setGame(null); setPlan(null); setPhase('setup'); }}>Players</button>
      </div>
    </>
  );
}
