'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/components/api';

export default function Login() {
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { user } = await api('/api/auth/login', { method: 'POST', body: { username, password } });
      router.push(user.role === 'admin' ? '/admin' : '/room');
      router.refresh();
    } catch (err) {
      setError(err.message);
      setP('');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel" onSubmit={submit} style={{ marginTop: 30 }}>
      <h3>🔐 Login</h3>
      <p className="count">For advanced players and admins. Anyone can play without logging in.</p>
      <label className="field">Username
        <input autoComplete="username" value={username} onChange={(e) => setU(e.target.value)} required maxLength={64} name="username" />
      </label>
      <label className="field">Password
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setP(e.target.value)} required maxLength={128} name="password" />
      </label>
      <div className="error" role="alert">{error}</div>
      <button className="btn btn-primary" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
