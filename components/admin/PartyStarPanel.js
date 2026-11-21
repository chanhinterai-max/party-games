'use client';
import { useEffect, useState } from 'react';
import { api } from '../api';
import StarPerksForm from '../StarPerksForm';

// v11 Admin: the VISIBLE special-player role. Rename the label (always shown, cannot be hidden) and set the default
// perks advanced users start from in their once-per-login popup.
export default function PartyStarPanel() {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { api('/api/admin/party-star').then(setD).catch((e) => setMsg(e.message)); }, []);
  if (!d) return <section className="panel"><h3>⭐ Party Star</h3><p className="count">{msg || 'Loading…'}</p></section>;
  const save = async (body, ok) => {
    setMsg('');
    try { setD(await api('/api/admin/party-star', { method: 'PUT', body })); setMsg(ok); } catch (e) { setMsg(e.message); }
  };
  return (
    <section className="panel" data-section="party-star">
      <h3>⭐ {d.label}</h3>
      <p className="count">An advanced user sets a name once per login (popup on their Rooms page). In rooms they create,
        the first matching player is <b>blessed</b>: quiet luck for the whole room (drinks, luck re-roll, race strides,
        never the Human, gentler hunters/weather). The {d.label} gets ALL perks incl. the pairing perks, a ⭐ badge and
        a collapsed perk list everyone can open. Game 1: the blessed player is the {d.label}; after each game a 🎡 wheel
        picks the next one.</p>
      <label className="field">Role name shown to players (default “{d.labelDefault}”)
        <input className="input" name="star-label" maxLength={24} value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
      </label>
      <div className="label" style={{ marginTop: 12 }}>Default perks (advanced users can tweak them per session)</div>
      <StarPerksForm value={d.perks} onChange={(perks) => setD({ ...d, perks })} prefix="admin-star" />
      <div className="label" style={{ marginTop: 12 }}>🎡 Next-star wheel weights</div>
      <p className="count">Slice = base + bonus. Truth or Dare: most dares done get the biggest bonus; the most chicken-outs
        get the smallest slice. Animal Race: podium bonus. The blessed player’s slice is a bit bigger.</p>
      <div className="star-perks" data-section="wheel-weights">
        {d.wheelFields.map((v) => (
          <label key={v.key} className="star-val">{v.label}
            <input className="input" type="number" inputMode="decimal" min={v.min} max={v.max} step={v.step} name={`wheel-${v.key}`}
              value={d.wheel[v.key]} onChange={(e) => setD({ ...d, wheel: { ...d.wheel, [v.key]: e.target.value === '' ? '' : Number(e.target.value) } })} />
          </label>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn btn-primary" data-act="save-party-star" onClick={() => save({ label: d.label, perks: d.perks, wheel: d.wheel }, 'Saved ✓')}>Save</button>
        <button className="btn btn-ghost" data-act="reset-party-star" onClick={() => save({ reset: true }, 'Reset to defaults ✓')}>Reset to defaults</button>
      </div>
      {msg && <p className="count" data-star-msg>{msg}</p>}
    </section>
  );
}
