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
      <p className="count">A visible special player. An advanced user sets a name match once per login (popup on their
        Rooms page); in rooms they create, the first matching player becomes the {d.label}. Everyone sees an
        announcement with the active perks, a ⭐ badge, and “⭐ {d.label}’s pick” on everything a perk produces.</p>
      <label className="field">Role name shown to players (default “{d.labelDefault}”)
        <input className="input" name="star-label" maxLength={24} value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
      </label>
      <div className="label" style={{ marginTop: 12 }}>Default perks (advanced users can tweak them per session)</div>
      <StarPerksForm value={d.perks} onChange={(perks) => setD({ ...d, perks })} prefix="admin-star" />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn btn-primary" data-act="save-party-star" onClick={() => save({ label: d.label, perks: d.perks }, 'Saved ✓')}>Save</button>
        <button className="btn btn-ghost" data-act="reset-party-star" onClick={() => save({ reset: true }, 'Reset to defaults ✓')}>Reset to defaults</button>
      </div>
      {msg && <p className="count" data-star-msg>{msg}</p>}
    </section>
  );
}
