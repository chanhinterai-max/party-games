'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { api } from '@/components/api';

// v10: advanced users land here after login, so the global editors (race speeds, surprise cards + animal pool) live
// here too (lazy: their code loads only for signed-in advanced users / admins).
const Lazy = () => <p className="count">Loading…</p>;
const RaceSpeedEditor = dynamic(() => import('@/components/RaceSpeedEditor'), { ssr: false, loading: Lazy });
const SurpriseEditor = dynamic(() => import('@/components/SurpriseEditor'), { ssr: false, loading: Lazy });

export default function RoomEntry() {
  const [code, setCode] = useState('');
  const router = useRouter();
  const [role, setRole] = useState(null);
  useEffect(() => { api('/api/auth/me').then((d) => setRole(d.user?.role || '')).catch(() => setRole('')); }, []);
  const editor = role === 'advanced' || role === 'admin';
  return (
    <>
    <form className="panel" style={{ marginTop: 30 }} onSubmit={(e) => { e.preventDefault(); const c = code.trim().toUpperCase(); if (c) router.push(`/room/${encodeURIComponent(c)}`); }}>
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
    </>
  );
}
