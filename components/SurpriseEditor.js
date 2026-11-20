'use client';
import { useState } from 'react';
import { api } from './api';
import { LEVELS } from '@/lib/content';
import RaceSpeedEditor from './RaceSpeedEditor';

// GLOBAL surprise-card content, the predator/prey animal pool and Human items (advanced users + admins). Loads only when opened.
const TYPES = [
  { id: 'match', name: '🐾 Animal Match', hint: 'Use {a} for the PREDATOR and {b} for the PREY, e.g. “{a}, chase {b} once around the table”.' },
  { id: 'virus', name: '🦠 Virus rule (3 turns)', hint: 'A rule everyone follows for the next 3 turns.' },
  { id: 'vote', name: '👉 Group vote', hint: 'Everyone points on 3; most votes drinks.' },
  { id: 'whisper', name: '🤫 Whisper', hint: 'Secret question: the player whispers a name.' },
  { id: 'chooser', name: '☝️ Dare Chooser', hint: 'Fingers on the screen; the chosen one does this.' },
  { id: 'human', name: '🧍 Human', hint: 'Only used when a game has a Human (odd number of players). Surprises: address “Human”. Truth/Dare: served on about 1 in 3 of the Human’s own turns; {who} = another player.' },
];
const HUMAN_KINDS = [['surprise', '✨ Surprise'], ['truth', '🤫 Truth'], ['dare', '🔥 Dare']];
const ROLES = [['predator', '🦷 Predators'], ['prey', '🌿 Prey']];

export default function SurpriseEditor({ speeds = true }) {
  const [data, setData] = useState(null);
  const [type, setType] = useState('match');
  const [level, setLevel] = useState('adult');
  const [edit, setEdit] = useState(null);
  const [add, setAdd] = useState({ text: '', seconds: '' });
  const [hkind, setHkind] = useState('surprise');
  const [animal, setAnimal] = useState({ predator: { name: '', emoji: '' }, prey: { name: '', emoji: '' } });
  const [msg, setMsg] = useState('');
  const load = () => api('/api/surprises').then(setData).catch((e) => setMsg(e.message));
  async function run(fn, ok) {
    setMsg('');
    try { await fn(); setMsg(ok); setEdit(null); await load(); } catch (e) { setMsg(e.message); }
  }
  const isHuman = type === 'human';
  const list = !data ? [] : isHuman ? data.human.filter((x) => x.kind === hkind && x.level === level) : data.surprises.filter((x) => x.type === type && x.level === level);
  const t = TYPES.find((x) => x.id === type);
  const secs = (v) => (v === '' || v == null ? null : Number(v));
  return (
    <details className="panel" data-section="surprises" onToggle={(e) => { if (e.currentTarget.open && !data) load(); }}>
      <summary style={{ fontWeight: 800 }}>✨ Surprise cards, Human items & animal pool (global)</summary>
      {!data ? <p className="count">{msg || 'Loading…'}</p> : (
        <>
          <p className="count">Edits apply to every room. The admin sets how often surprises appear.</p>
          <div className="tabs" style={{ flexWrap: 'wrap' }}>
            {TYPES.map((x) => <button key={x.id} aria-pressed={type === x.id} data-sp-type={x.id} onClick={() => { setType(x.id); setEdit(null); }}>{x.name}</button>)}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <select className="input" name="sp-level" value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.emoji} {l.name}</option>)}
            </select>
            {isHuman && (
              <select className="input" name="human-kind" value={hkind} onChange={(e) => { setHkind(e.target.value); setEdit(null); }}>
                {HUMAN_KINDS.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select>
            )}
          </div>
          <p className="count">{t.hint}</p>
          {msg && <p className="count" data-sp-msg>{msg}</p>}
          <ul className="history">
            {list.map((x) => (
              <li key={x.id} data-sp-item={x.id} style={x.enabled ? undefined : { opacity: 0.5 }}>
                {edit?.id === x.id ? (
                  <>
                    <textarea className="input" style={{ width: '100%' }} name="sp-edit-text" value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
                    <div className="row">
                      <input className="input secs-input" type="number" min={3} max={300} placeholder="⏱ sec" name="sp-edit-seconds" value={edit.seconds ?? ''} onChange={(e) => setEdit({ ...edit, seconds: e.target.value })} />
                      <button className="small-btn good" data-act="sp-save" onClick={() => run(() => api(`/api/surprises/${x.id}`, { method: 'PATCH', body: { text: edit.text, seconds: secs(edit.seconds) } }), 'Saved ✓')}>Save</button>
                      <button className="small-btn" onClick={() => setEdit(null)}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <div className="row" style={{ alignItems: 'center' }}>
                    <span>{x.text}{x.seconds ? <span className="count"> · ⏱{x.seconds}s</span> : null}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>
                      <button className="small-btn" data-act="sp-toggle" onClick={() => run(() => api(`/api/surprises/${x.id}`, { method: 'PATCH', body: { enabled: !x.enabled } }), x.enabled ? 'Disabled' : 'Enabled ✓')}>{x.enabled ? 'On' : 'Off'}</button>{' '}
                      <button className="small-btn" data-act="sp-edit" onClick={() => setEdit({ id: x.id, text: x.text, seconds: x.seconds })}>Edit</button>{' '}
                      <button className="small-btn danger" data-act="sp-del" onClick={() => confirm('Delete this surprise?') && run(() => api(`/api/surprises/${x.id}`, { method: 'DELETE' }), 'Deleted ✓')}>✕</button>
                    </span>
                  </div>
                )}
              </li>
            ))}
            {!list.length && <li className="count">No {t.name} {isHuman ? hkind : ''} cards for this level yet.</li>}
          </ul>
          <textarea className="input" style={{ width: '100%', marginTop: 8 }} name="sp-add-text" placeholder={type === 'match' ? '{a} (predator), … {b} (prey) …' : isHuman ? (hkind === 'surprise' ? 'Human, you’re the zookeeper: …' : hkind === 'dare' ? 'Tame {who} …' : 'Which predator here …') : 'New surprise text'} value={add.text} onChange={(e) => setAdd({ ...add, text: e.target.value })} />
          <div className="row">
            <input className="input secs-input" type="number" min={3} max={300} placeholder="⏱ sec" name="sp-add-seconds" value={add.seconds} onChange={(e) => setAdd({ ...add, seconds: e.target.value })} />
            <button className="small-btn good" data-act="sp-add" onClick={() => run(async () => { await api('/api/surprises', { method: 'POST', body: isHuman ? { kind: 'human', humanKind: hkind, level, text: add.text, seconds: secs(add.seconds) } : { type, level, text: add.text, seconds: secs(add.seconds) } }); setAdd({ text: '', seconds: '' }); }, 'Added ✓')}>{isHuman ? 'Add Human item' : 'Add surprise'}</button>
          </div>

          <div className="label" style={{ marginTop: 16 }}>🐾 Animal pool</div>
          <p className="count">Each game splits players 1:1 into predators and prey at random (odd count: one Human). Animals are unique per game. Keep at least {data.poolMin} on each side. Tap an animal to rename it. Race speeds have their own sliders below (⚡).</p>
          {ROLES.map(([deck, title]) => (
            <div key={deck} data-deck={deck} style={{ marginTop: 8 }}>
              <strong>{title}</strong> <span className="count">({data.pool.filter((d) => d.role === deck).length})</span>
              <div className="chips">
                {data.pool.filter((d) => d.role === deck).map((d) => (
                  <span key={d.id} className="chip" data-animal={d.id}>
                    {edit?.id === d.id ? (
                      <>
                        <input className="input" style={{ minHeight: 30, width: 44 }} name="deck-edit-emoji" value={edit.emoji} onChange={(e) => setEdit({ ...edit, emoji: e.target.value })} />
                        <input className="input" style={{ minHeight: 30, width: 96 }} name="deck-edit-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                        <button className="small-btn good" data-act="deck-save" onClick={() => run(() => api(`/api/surprises/${d.id}`, { method: 'PATCH', body: { name: edit.name, emoji: edit.emoji } }), 'Saved ✓')}>✓</button>
                      </>
                    ) : (
                      <>
                        <span onClick={() => setEdit({ id: d.id, name: d.name, emoji: d.emoji })}>{d.emoji} {d.name}{(d.speed ?? 100) !== 100 && <small className="speed-tag" data-speed={d.speed}> ⚡{d.speed}%</small>}</span>
                        <button className="x" aria-label={`Delete ${d.name}`} onClick={() => run(() => api(`/api/surprises/${d.id}`, { method: 'DELETE' }), 'Deleted ✓')}>✕</button>
                      </>
                    )}
                  </span>
                ))}
              </div>
              <div className="row">
                <input className="input" style={{ maxWidth: 70 }} placeholder="🦊" name={`deck-${deck}-emoji`} value={animal[deck].emoji} onChange={(e) => setAnimal({ ...animal, [deck]: { ...animal[deck], emoji: e.target.value } })} />
                <input className="input" placeholder="Animal name" name={`deck-${deck}-name`} value={animal[deck].name} onChange={(e) => setAnimal({ ...animal, [deck]: { ...animal[deck], name: e.target.value } })} />
                <button className="small-btn good" data-act={`deck-add-${deck}`} onClick={() => run(async () => { await api('/api/surprises', { method: 'POST', body: { kind: 'animal', role: deck, ...animal[deck] } }); setAnimal({ ...animal, [deck]: { name: '', emoji: '' } }); }, 'Added ✓')}>Add</button>
              </div>
            </div>
          ))}
          {speeds ? <RaceSpeedEditor pool={data.pool} /> : <p className="count">⚡ Race speeds: see the Animal Race speeds panel.</p>}
        </>
      )}
    </details>
  );
}
