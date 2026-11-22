'use client';
import { useState } from 'react';
import Timer from './Timer';
import Chooser from './Chooser';
import PlayerTag from '@/components/party/PlayerTag';

const TITLES = {
  match: '🐾 Animal Match · predator & prey',
  human: '🧍 Human’s turn',
  virus: '🦠 Virus rule · 3 turns',
  vote: '👉 Group vote',
  whisper: '🤫 Whisper',
  chooser: '☝️ Dare Chooser',
};

function VoteCount() {
  const [n, setN] = useState(null);
  const go = () => {
    if (n !== null) return;
    [3, 2, 1, 0].forEach((v, i) => setTimeout(() => setN(v), i * 700));
    setTimeout(() => setN(null), 4200);
  };
  return (
    <button type="button" className="small-btn good" data-act="vote-count" onClick={go} style={{ minWidth: 150 }}>
      {n === null ? 'Count 1 · 2 · 3' : n === 0 ? '👉 POINT!' : n}
    </button>
  );
}

// Body of a surprise card (rendered on the amber back face of the flip card).
export default function SurpriseBody({ sp, players, animals, genders }) { // v13: players = animal emoji + name
  const [peek, setPeek] = useState(false);
  return (
    <>
      <div className="kind" data-surprise-type={sp.type}>✨ Surprise · {TITLES[sp.type] || sp.type}</div>
      {sp.type === 'match' && (
        <div className="match-pair" data-match-pair>
          <span data-match-a>{sp.pair?.[0] ? <><PlayerTag name={sp.pair[0]} animals={animals} genders={genders} /> <small>({animals?.[sp.pair[0]]?.name || sp.a})</small></> : sp.a}</span> <span>🐾</span> <span data-match-b>{sp.pair?.[1] ? <><PlayerTag name={sp.pair[1]} animals={animals} genders={genders} /> <small>({animals?.[sp.pair[1]]?.name || sp.b})</small></> : sp.b}</span>
        </div>
      )}
      {sp.type === 'human' && sp.player && <div className="match-pair" data-human-player><PlayerTag name={sp.player} animals={animals} genders={genders} /></div>}
      {sp.type === 'whisper' ? (
        <>
          <p className="count">{sp.player ? <><PlayerTag name={sp.player} animals={animals} genders={genders} bold />: </> : null}peek privately, then whisper a name to the person on your left. The named person can take a sip to hear the question!</p>
          {peek
            ? <div className="text" data-surprise-text>{sp.text}</div>
            : <button type="button" className="small-btn good" data-act="whisper-peek" onClick={() => setPeek(true)}>👀 Peek at the secret question</button>}
          {peek && <button type="button" className="small-btn" data-act="whisper-hide" onClick={() => setPeek(false)}>Hide</button>}
        </>
      ) : (
        <div className="text" data-surprise-text>{sp.text}</div>
      )}
      {sp.type === 'vote' && <VoteCount />}
      {sp.type === 'chooser' && <Chooser players={players} animals={animals} genders={genders} />}
      {sp.seconds ? <Timer key={sp.id} seconds={sp.seconds} /> : null}
    </>
  );
}
