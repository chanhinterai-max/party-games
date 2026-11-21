'use client';
import { useEffect, useState } from 'react';
import { api } from './api';
import StarPerksForm from './StarPerksForm';

// v11: once per LOGIN SESSION (the session row remembers the answer; logout clears it). The advanced user enters
// the Party Star name match and may tweak the perks for this session. Applies only to rooms they create from this
// page during this session. Everything it does is announced to the players.
export default function PartyStarPopup({ open, onClose, data }) {
  const [match, setMatch] = useState('');
  const [perks, setPerks] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (data) { setMatch(data.session?.match || ''); setPerks(data.session?.perks || data.defaults); } }, [data]);
  if (!open || !data || !perks) return null;
  const save = async (m) => {
    setMsg('');
    try { const r = await api('/api/me/party-star', { method: 'PUT', body: { match: m, perks } }); onClose(r.session); } catch (e) { setMsg(e.message); }
  };
  return (
    <div className="modal-back" data-star-popup>
      <div className="modal panel star-modal" role="dialog" aria-modal="true" aria-labelledby="star-pop-h">
        <h3 id="star-pop-h">⭐ {data.label} for this session</h3>
        <p className="count">Type part of a player’s name (not case-sensitive). In rooms you create from this page until you
          log out, the first player whose name contains it becomes the {data.label}. Everyone sees it announced when the game
          starts, with these perks, and a ⭐ next to their name.</p>
        <label className="field">Name contains
          <input className="input" name="star-match" maxLength={20} autoComplete="off" value={match} onChange={(e) => setMatch(e.target.value)} placeholder="e.g. mia" />
        </label>
        <details className="star-tweak"><summary>Perks for this session</summary>
          <StarPerksForm value={perks} onChange={setPerks} prefix="sess-star" />
        </details>
        {msg && <p className="error" data-star-pop-msg>{msg}</p>}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" data-act="star-save" disabled={!match.trim()} onClick={() => save(match)}>Set {data.label}</button>
          <button className="btn btn-ghost" data-act="star-skip" onClick={() => save('')}>No {data.label}</button>
        </div>
      </div>
    </div>
  );
}
