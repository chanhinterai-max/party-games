'use client';
import GenderDot from './GenderDot';

const AWARDS = [
  ['truths', '🤫', 'Most truths'],
  ['dares', '🔥', 'Most dares'],
  ['alcohol', '🍺', 'Most alcohol'],
  ['sparkling', '🥂', 'Most sparkling'],
  ['water', '💧', 'Most water'],
  ['chicken', '🐔', 'Most chicken-outs'],
];
const REASON = { complete: 'All questions played! 🎉', host: 'Game ended by the host', idle: 'Room closed after 1 hour without play' };

function Names({ names, genders }) {
  return names.map((n, i) => (
    <span key={n}>{i > 0 && (i === names.length - 1 ? ' & ' : ', ')}<GenderDot gender={genders[n]} />{n}</span>
  ));
}

export default function Results({ room }) {
  const r = room.results;
  if (!r) return null;
  const g = room.genders || {};
  const pairBlock = (key, emoji, label) => {
    const p = r.pairs[key];
    if (!p) return null;
    return (
      <div className="award" data-pair={key}>
        <div className="aw-label">{emoji} {label}</div>
        <div className="aw-who">{p.pairs.map(([a, b], i) => <div key={i}><Names names={[a, b]} genders={g} /></div>)}</div>
        <div className="count">{p.count} interaction{p.count === 1 ? '' : 's'}{p.pairs.length > 1 ? ' · tie!' : ''}</div>
      </div>
    );
  };
  return (
    <div className="results" data-results>
      <h2 className="results-title">🏆 Results</h2>
      <p className="count" style={{ textAlign: 'center' }} data-closed-reason={room.closedReason}>{REASON[room.closedReason] || 'Game over'}</p>
      <div className="awards">
        {AWARDS.map(([k, e, label]) => {
          const a = r.awards[k];
          if (!a || !a.names.length) return k === 'sparkling' ? null : (
            <div className="award" key={k} data-award={k}><div className="aw-label">{e} {label}</div><div className="aw-who count">Nobody 🤷</div></div>
          );
          return (
            <div className="award" key={k} data-award={k}>
              <div className="aw-label">{e} {label}</div>
              <div className="aw-who"><Names names={a.names} genders={g} /></div>
              <div className="count">{a.count}{a.names.length > 1 ? ' each · tie!' : ''}</div>
            </div>
          );
        })}
        {pairBlock('couple', '💞', 'Hottest pair')}
        {pairBlock('buddies', '🤜🤛', 'Best buddies')}
        {pairBlock('sisters', '👯‍♀️', 'Best sisters')}
      </div>
      {r.animals && Object.keys(r.animals).length > 0 && (
        <>
          <div className="label" style={{ marginTop: 18 }}>🐾 Party animals</div>
          <div className="scores" data-animals style={{ marginTop: 0 }}>
            {room.players.map((p) => r.animals[p] && <span key={p} data-animal-for={p}><GenderDot gender={g[p]} />{p} · {r.animals[p].emoji} {r.animals[p].name}{['predator', 'prey'].includes(r.animals[p].role) ? ` (${r.animals[p].role})` : ''}</span>)}
          </div>
        </>
      )}
      <div className="label" style={{ marginTop: 18 }}>Everyone’s title</div>
      <ul className="titles">
        {room.players.map((p) => {
          const t = r.titles[p];
          const s = r.perPlayer[p] || {};
          return (
            <li key={p} data-title-for={p}>
              <div className="t-head"><GenderDot gender={g[p]} /><strong>{p}</strong> <span className="t-name">{t.emoji} {t.title}</span></div>
              <div className="t-line">{t.line}</div>
              <div className="count">🤫 {s.truths || 0} · 🔥 {s.dares || 0} · ✓ {s.done || 0} · 🐔 {s.chicken || 0}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
