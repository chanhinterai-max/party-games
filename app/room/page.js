'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { api } from '@/components/api';

// Advanced users land here after login. v10: global editors (race speeds, surprise cards + animal pool), lazy.
// v11: create a NEW Truth or Dare / Animal Race room (tagged with this user; ?host=1) next to opening an existing
// one, and the once-per-login-session ⭐ Party Star popup.
const Lazy = () => <p className="count">Loading…</p>;
const RaceSpeedEditor = dynamic(() => import('@/components/RaceSpeedEditor'), { ssr: false, loading: Lazy });
const SurpriseEditor = dynamic(() => import('@/components/SurpriseEditor'), { ssr: false, loading: Lazy });
const PartyStarPopup = dynamic(() => import('@/components/PartyStarPopup'), { ssr: false });

export default function RoomEntry() {
  const [code, setCode] = useState('');
  const router = useRouter();
  const [role, setRole] = useState(null);
  const [star, setStar] = useState(null); // GET /api/me/party-star
  const [pop, setPop] = useState(false);
  useEffect(() => {
    api('/api/auth/me').then((d) => {
      const r = d.user?.role || ''; setRole(r);
      if (r === 'advanced' || r === 'admin') api('/api/me/party-star').then((s) => { setStar(s); if (!s.session) setPop(true); }).catch(() => {});
    }).catch(() => setRole(''));
  }, []);
  const editor = role === 'advanced' || role === 'admin';
  const sess = star?.session;
  return (
    <>
    {editor && (
      <section className="panel" data-section="create-room" style={{ marginTop: 30 }}>
        <h3>➕ Create a new room</h3>
        <p className="count">Starts the game on this device and saves the room under your name. You join as the first player (game name, animal and picture from <Link href="/me" data-act="my-profile">👤 My profile</Link>).</p>
        <div className="create-grid">
          <Link className="btn btn-primary" href="/play/truth-or-dare?host=1" data-act="create-tod">🎭 New Truth or Dare room</Link>
          <Link className="btn btn-primary" href="/play/animal-race?host=1" data-act="create-race">🏁 New Animal Race room</Link>
        </div>
        {star && (
          <p className="count star-sess" data-star-session>
            ⭐ {star.label} this session: {sess?.match ? <b>name contains “{sess.match}”</b> : <b>none</b>}{' '}
            <button className="small-btn" data-act="star-edit" onClick={() => setPop(true)}>Change</button>
          </p>
        )}
      </section>
    )}
    <form className="panel" style={{ marginTop: editor ? 14 : 30 }} onSubmit={(e) => { e.preventDefault(); const c = code.trim().toUpperCase(); if (c) router.push(`/room/${encodeURIComponent(c)}`); }}>
      <h3>🎛️ Join a room</h3>
      <p className="count">Enter the room code shown on the player’s screen to watch the game live and edit the upcoming questions. Requires an advanced player or admin login.</p>
      <label className="field">Room code
        <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} autoCapitalize="characters" autoComplete="off" placeholder="e.g. K7Q2M" name="code"
          style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '.25em', textTransform: 'uppercase', fontSize: '1.3rem' }} />
      </label>
      <div className="section"><button className="btn btn-primary" type="submit">Open room</button></div>
    </form>
    {editor && (
      <div data-section="global-editors">
        <div className="label" style={{ marginTop: 18 }}>Global game content</div>
        <RaceSpeedEditor open />
        <SurpriseEditor speeds={false} />
      </div>
    )}
    {pop && <PartyStarPopup open data={star} onClose={(s) => { setStar({ ...star, session: s }); setPop(false); }} />}
    </>
  );
}
