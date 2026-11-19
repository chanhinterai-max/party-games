'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RoomEntry() {
  const [code, setCode] = useState('');
  const router = useRouter();
  return (
    <form className="panel" style={{ marginTop: 30 }} onSubmit={(e) => { e.preventDefault(); const c = code.trim().toUpperCase(); if (c) router.push(`/room/${encodeURIComponent(c)}`); }}>
      <h3>🎛️ Join a room</h3>
      <p className="count">Enter the room code shown on the player's screen to watch the game live and edit the upcoming questions. Requires an advanced player or admin login.</p>
      <label className="field">Room code
        <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} autoCapitalize="characters" autoComplete="off" placeholder="e.g. K7Q2M" name="code"
          style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '.25em', textTransform: 'uppercase', fontSize: '1.3rem' }} />
      </label>
      <div className="section"><button className="btn btn-primary" type="submit">Open room</button></div>
    </form>
  );
}
