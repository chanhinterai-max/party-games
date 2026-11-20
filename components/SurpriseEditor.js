'use client';
import { useState } from 'react';
import { api } from './api';
import { LEVELS } from '@/lib/content';

// GLOBAL surprise-card content + Animal Match decks (advanced users + admins). Loads only when opened.
const TYPES = [
  { id: 'match', name: '🐾 Animal Match', hint: 'Use {a} and {b} for the two secret animals.' },
  { id: 'virus', name: '🦠 Virus rule (3 turns)', hint: 'A rule everyone follows for the next 3 turns.' },
  { id: 'vote', name: '👉 Group vote', hint: 'Everyone points on 3; most votes drinks.' },
  { id: 'whisper', name: '🤫 Whisper', hint: 'Secret question: the player whispers a name.' },
  { id: 'chooser', name: '☝️ Dare Chooser', hint: 'Fingers on the screen; the chosen one does this.' },
];

export default function SurpriseEditor() {
  const [data, setData] = useState(null);
  const [type, setType] = useState('match');
  const [level, setLevel] = useState('adult');
  const [edit, setEdit] = useState(null);
  const [add, setAdd] = useState({ text: '', seconds: '' });
  const [animal, setAnimal] = useState({ female: { name: '', emoji: '' }, male: { name: '', emoji: '' } });
  const [msg, setMsg] = useState('');
  const load = () => api('/api/surprises').then(setData).catch((e) => setMsg(e.message));
  async function run(fn, ok) {
    setMsg('');
    try { await fn(); setMsg(ok); setEdit(null); await load(); } catch (e) { setMsg(e.message); }
  }
  const list = data ? data.surprises.filter((x) => x.type === type && x.level === level) : [];
  const t = TYPES.find((x) => x.id === type);
  const secs = (v) => (v === '' || v == null ? null : Number(v));
  return (
    <details className="panel" data-section="surprises" onToggle={(e) => { if (e.currentTarget.open && !data) load(); }}>
      <summary style={{ fontWeight: 800 }}>✨ Surprise cards &amp; animal decks (global)</summary>
      {!data ? <p className="count">{msg || 'Loading…'}</p> : (
        <>
          <p className="count">Edits apply to every room. The admin sets how often surprises appear.</p>
          <div className="tabs" style={{ flexWrap: 'wrap' }}>
            {TYPES.map((x) => <button key={x.id} aria-pressed={type === x.id} data-sp-type={x.id} onClick={() => { setType(x.id); setEdit(null); }}>{x.name}</button>)}
          </div>
          <select className="input" name="sp-level" value={level} onChange={(e) => setLevel(e.target.value)} style={{ marginTop: 8 }}>
            {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.emoji} {l.name}</option>)}
          </select>
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
            {!list.length && <li className="count">No {t.name} cards for this level yet.</li>}
          </ul>
          <textarea className="input" style={{ width: '100%', marginTop: 8 }} name="sp-add-text" placeholder={type === 'match' ? '{a} and {b}: …' : 'New surprise text'} value={add.text} onChange={(e) => setAdd({ ...add, text: e.target.value })} />
          <div className="row">
            <input className="input secs-input" type="number" min={3} max={300} placeholder="⏱ sec" name="sp-add-seconds" value={add.seconds} onChange={(e) => setAdd({ ...add, seconds: e.target.value })} />
            <button className="small-btn good" data-act="sp-add" onClick={() => run(async () => { await api('/api/surprises', { method: 'POST', body: { type, level, text: add.text, seconds: secs(add.seconds) } }); setAdd({ text: '', seconds: '' }); }, 'Added ✓')}>Add surprise</button>
          </div>

          <div className="label" style={{ marginTop: 16 }}>🐾 Animal Match decks</div>
          <p className="count">Women draw a secret animal from the female deck, men from the male deck.</p>
          {['female', 'male'].map((deck) => (
            <div key={deck} data-deck={deck} style={{ marginTop: 8 }}>
              <strong>{deck === 'female' ? '♀ Female deck' : '♂ Male deck'}</strong> <span className="count">({data.decks.filter((d) => d.deck === deck).length})</span>
              <div className="chips">
                {data.decks.filter((d) => d.deck === deck).map((d) => (
                  <span key={d.id} className="chip" data-animal={d.id}>
                    {edit?.id === d.id ? (
                      <>
                        <input className="input" style={{ minHeight: 30, width: 44 }} name="deck-edit-emoji" value={edit.emoji} onChange={(e) => setEdit({ ...edit, emoji: e.target.value })} />
                        <input className="input" style={{ minHeight: 30, width: 96 }} name="deck-edit-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                        <button className="small-btn good" data-act="deck-save" onClick={() => run(() => api(`/api/surprises/${d.id}`, { method: 'PATCH', body: { name: edit.name, emoji: edit.emoji } }), 'Saved ✓')}>✓</button>
                      </>
                    ) : (
                      <>
                        <span onClick={() => setEdit({ id: d.id, name: d.name, emoji: d.emoji })}>{d.emoji} {d.name}</span>
                        <button className="x" aria-label={`Delete ${d.name}`} onClick={() => run(() => api(`/api/surprises/${d.id}`, { method: 'DELETE' }), 'Deleted ✓')}>✕</button>
                      </>
                    )}
                  </span>
                ))}
              </div>
              <div className="row">
                <input className="input" style={{ maxWidth: 70 }} placeholder="🦊" name={`deck-${deck}-emoji`} value={animal[deck].emoji} onChange={(e) => setAnimal({ ...animal, [deck]: { ...animal[deck], emoji: e.target.value } })} />
                <input className="input" placeholder="Animal name" name={`deck-${deck}-name`} value={animal[deck].name} onChange={(e) => setAnimal({ ...animal, [deck]: { ...animal[deck], name: e.target.value } })} />
                <button className="small-btn good" data-act={`deck-add-${deck}`} onClick={() => run(async () => { await api('/api/surprises', { method: 'POST', body: { kind: 'animal', deck, ...animal[deck] } }); setAnimal({ ...animal, [deck]: { name: '', emoji: '' } }); }, 'Added ✓')}>Add</button>
              </div>
            </div>
          ))}
        </>
      )}
    </details>
  );
}
