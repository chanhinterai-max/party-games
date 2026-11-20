'use client';
import GenderDot from '@/components/GenderDot';
import { RACE } from '@/lib/race/config';

const MEDAL = ['🥇', '🥈', '🥉', '4'];
// Heat / final podium. Last place (ties all) drinks — the only drinking rule in Animal Race.
export default function RaceResults({ result, animals, genders, title }) {
  return (
    <div className="race-results" data-race-results>
      <h2 className="reveal-title">{title}</h2>
      <ol className="podium">
        {result.order.map((o) => {
          const a = animals[o.name];
          const pct = o.pct ?? (o.steps === Infinity || o.steps === null ? 100 : Math.round((o.steps / RACE.stepsToGoal) * 100));
          return (
            <li key={o.name} className={`podium-row place-${o.place}`} data-place={o.place} data-podium={o.name}>
              <span className="medal">{MEDAL[o.place - 1] || o.place}</span>
              <span className="animal-emoji">{a?.role === 'human' ? '🧍' : a?.emoji}</span>
              <span className="animal-who"><b><GenderDot gender={genders[o.name]} />{o.name}</b>
                <span className="dist"><i style={{ width: `${pct}%` }} /></span></span>
            </li>
          );
        })}
      </ol>
      <div className="drink-call" data-drink={result.drinkers.join(',')}>
        <div className="drink-icon" aria-hidden="true">🍺</div>
        <div className="drink-names">{result.drinkers.map((n) => <b key={n}><GenderDot gender={genders[n]} />{n}</b>)}</div>
        <div className="drink-word">Drink!</div>
      </div>
    </div>
  );
}
