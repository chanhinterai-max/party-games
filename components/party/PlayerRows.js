'use client';
import GenderDot from '@/components/GenderDot';
import { MIN, MAX, blank } from './store';

// SHARED player entry (Truth or Dare + Animal Race): name, Male/Female, remove, add.
// v13: onFixed() fires once every row flagged "missing gender" has one → the page clears its error message.
export default function PlayerRows({ players, setPlayers, missing = [], onFixed }) {
  const update = (i, patch) => {
    const next = players.map((p, j) => (j === i ? { ...p, ...patch } : p));
    setPlayers(next);
    if (patch.gender && missing.length && onFixed && missing.every((k) => next[k]?.gender || !next[k]?.name.trim())) onFixed();
  };
  return (
    <>
      <div className="players" style={{ marginTop: 10 }}>
        {players.map((p, i) => (
          // v13: the error highlight clears as soon as this row has a gender (no need to press Start again)
          <div className={`player-row ${missing.includes(i) && !p.gender ? 'missing' : ''}`} key={i} data-row={i}>
            <input type="text" autoComplete="off" autoCapitalize="words" maxLength={20} placeholder={`Player ${i + 1}`}
              value={p.name} aria-label={`Player ${i + 1} name`} data-idx={i}
              onChange={(e) => update(i, { name: e.target.value })} />
            <div className="gender-pick" role="group" aria-label={`Player ${i + 1} gender`}>
              <button type="button" className="male" aria-pressed={p.gender === 'male'} aria-label={`Player ${i + 1}: male`} data-gender={`${i}-male`} onClick={() => update(i, { gender: 'male' })}>
                <GenderDot gender="male" />M</button>
              <button type="button" className="female" aria-pressed={p.gender === 'female'} aria-label={`Player ${i + 1}: female`} data-gender={`${i}-female`} onClick={() => update(i, { gender: 'female' })}>
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
    </>
  );
}
