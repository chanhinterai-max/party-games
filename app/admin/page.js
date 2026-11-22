'use client';
import { LEVELS } from '@/lib/content';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/components/api';
import AccountPanel from '@/components/admin/AccountPanel';
import dynamic from 'next/dynamic';

// v9: the heavy admin panels load on demand (after the account panel) → faster first paint of /admin
const Lazy = () => <section className="panel" aria-busy="true" style={{ minHeight: 80 }} />;
// v10: all per-game settings live in the "Game settings" section (a tab per game)
const GameSettings = dynamic(() => import('@/components/admin/GameSettings'), { ssr: false, loading: Lazy });

export default function Admin() {
  const [me, setMe] = useState(undefined);
  const [users, setUsers] = useState([]);
  const [games, setGames] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [audit, setAudit] = useState([]);
  const [newUser, setNewUser] = useState('');
  const [newPw, setNewPw] = useState('');
  const [reveal, setReveal] = useState(null); // { username, password }
  const [error, setError] = useState('');
  const [code, setCode] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [u, g, r, a] = await Promise.all([
        api('/api/admin/users'), api('/api/admin/games'), api('/api/admin/rooms'), api('/api/admin/audit'),
      ]);
      setUsers(u.users); setGames(g.games); setRooms(r.rooms); setAudit(a.entries);
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => {
    api('/api/auth/me').then((d) => { setMe(d.user); if (d.user?.role === 'admin') refresh(); }).catch(() => setMe(null));
  }, [refresh]);

  if (me === undefined) return <p className="count" style={{ marginTop: 30 }}>Loading…</p>;
  if (!me || me.role !== 'admin') {
    return <div className="panel" style={{ marginTop: 30 }}><h3>Admins only</h3><Link className="btn btn-primary" href="/login">Login</Link></div>;
  }

  async function run(fn) {
    setError('');
    try { await fn(); await refresh(); } catch (e) { setError(e.message); }
  }
  const createUser = (e) => {
    e.preventDefault();
    run(async () => {
      const d = await api('/api/admin/users', { method: 'POST', body: { username: newUser, ...(newPw ? { password: newPw } : {}) } });
      setReveal(d.password ? { username: d.user.username, password: d.password } : null);
      setNewUser(''); setNewPw('');
    });
  };
  const toggleUser = (u) => run(() => api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { enabled: !u.enabled } }));
  const resetPw = (u) => run(async () => {
    if (!confirm(`Reset password for ${u.username}? Their sessions will be signed out.`)) return;
    const d = await api(`/api/admin/users/${u.id}/password`, { method: 'POST', body: {} });
    setReveal({ username: u.username, password: d.password });
  });
  const deleteUser = (u) => run(async () => {
    if (!confirm(`Permanently delete ${u.username}? Their sessions and categories are removed. This cannot be undone.`)) return;
    await api(`/api/admin/users/${u.id}`, { method: 'DELETE' });
  });
  const toggleGame = (g) => run(() => api('/api/admin/games', { method: 'PATCH', body: { id: g.id, enabled: !g.enabled } }));

  return (
    <>
      <h2 style={{ marginTop: 14 }}>🛡️ Admin</h2>
      {error && <p className="error" role="alert">{error}</p>}

      <section className="panel">
        <h3>Open a room</h3>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (code.trim()) location.href = `/room/${encodeURIComponent(code.trim().toUpperCase())}`; }}>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Room code" maxLength={8} />
          <button className="small-btn good" type="submit" style={{ flex: '0 0 auto', minHeight: 50 }}>Open</button>
        </form>
      </section>

      <AccountPanel me={me} onChanged={(u) => { setMe(u); refresh(); }} />

      <section className="panel" data-section="users">
        <h3>Advanced users</h3>
        {reveal && (
          <div style={{ marginBottom: 12 }}>
            <p className="count">Password for <strong>{reveal.username}</strong> (shown once, copy it now):</p>
            <div className="secret" data-revealed-password>{reveal.password}</div>
            <button className="small-btn" style={{ marginTop: 6 }} onClick={() => setReveal(null)}>Hide</button>
          </div>
        )}
        <table className="table">
          <tbody>
            {users.map((u) => (
              <tr key={u.id} data-user={u.username}>
                <td><strong>{u.username}</strong><div className="count">{u.role}{u.locked ? ' · locked' : ''}</div></td>
                <td>{u.enabled ? <span className="ok">enabled</span> : <span className="error">disabled</span>}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {u.id !== me.id && <button className={`small-btn ${u.enabled ? 'danger' : 'good'}`} data-act="toggle-user" onClick={() => toggleUser(u)}>{u.enabled ? 'Disable' : 'Enable'}</button>}{' '}
                  <button className="small-btn" data-act="reset-pw" onClick={() => resetPw(u)}>Reset pw</button>
                  {u.role === 'advanced' && <>{' '}<button className="small-btn danger" data-act="delete-user" onClick={() => deleteUser(u)}>Delete</button></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={createUser} style={{ marginTop: 12 }}>
          <div className="label">Create advanced user</div>
          <input className="input" style={{ width: '100%' }} placeholder="username (3-32: letters, numbers, . _ -)" value={newUser} onChange={(e) => setNewUser(e.target.value)} name="new-username" required />
          <input className="input" style={{ width: '100%', marginTop: 8 }} type="password" placeholder="password (blank = generate a strong one)" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" name="new-password" />
          <button className="btn btn-primary" style={{ marginTop: 10 }} type="submit" data-act="create-user">Create user</button>
        </form>
      </section>

      <section className="panel" data-section="games">
        <h3>Games on the home page</h3>
        {games.map((g) => (
          <div className="toggle" key={g.id} data-game-toggle={g.id}>
            <span>{g.emoji} {g.name} <span className="count">({g.id})</span></span>
            <button className={`small-btn ${g.enabled ? 'good' : 'danger'}`} onClick={() => toggleGame(g)}>{g.enabled ? 'Shown' : 'Hidden'}</button>
          </div>
        ))}
      </section>

      <GameSettings />

      <section className="panel" data-section="rooms">
        <h3>Live rooms (active, played in the last hour) <button className="small-btn" onClick={refresh}>↻</button></h3>
        {rooms.length === 0 && <p className="count">No live rooms.</p>}
        <table className="table"><tbody>
          {rooms.map((r) => (
            <tr key={r.code}>
              <td><Link href={`/room/${r.code}`}><strong style={{ fontFamily: 'ui-monospace, monospace' }}>{r.code}</strong></Link></td>
              <td>{LEVELS.find((l) => l.id === r.level)?.name || r.level} · {r.players.length} players<div className="count">now: {r.current} · {r.turns} turns · {r.questionsLeft} left</div></td>
              <td className="count">{new Date(r.lastActivity || r.updatedAt).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody></table>
      </section>

      <section className="panel">
        <h3>Audit log</h3>
        <ul className="history">
          {audit.map((a) => (
            <li key={a.id}><div className="meta">{new Date(a.created_at).toLocaleString()} · {a.username || 'anonymous'}</div>{a.action} {a.target ? `→ ${a.target}` : ''}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
