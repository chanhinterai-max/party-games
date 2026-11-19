'use client';
import { useState } from 'react';
import { api } from '@/components/api';

export default function Setup() {
  const [f, setF] = useState({ secret: '', username: 'admin', password: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setError(''); setMsg('');
    try {
      await api('/api/setup', { method: 'POST', body: f });
      setMsg('Admin created. You can now log in.');
      setF({ secret: '', username: '', password: '' });
    } catch (err) { setError(err.message); }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="panel" onSubmit={submit} style={{ marginTop: 30 }}>
      <h3>First-time admin setup</h3>
      <p className="count">Only works once, and only with the server setup secret.</p>
      <label className="field">Setup secret<input type="password" value={f.secret} onChange={set('secret')} required autoComplete="off" /></label>
      <label className="field">Admin username<input value={f.username} onChange={set('username')} required /></label>
      <label className="field">Password (12+ characters)<input type="password" value={f.password} onChange={set('password')} required minLength={12} autoComplete="new-password" /></label>
      <div className="error" role="alert">{error}</div>
      {msg && <p className="ok">{msg}</p>}
      <button className="btn btn-primary" type="submit">Create admin</button>
    </form>
  );
}
