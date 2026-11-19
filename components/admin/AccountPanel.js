'use client';
import { useState } from 'react';
import { api } from '../api';

// Admin changes own username and/or password (current password required).
export default function AccountPanel({ me, onChanged }) {
  const [username, setUsername] = useState(me.username);
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState('');
  async function submit(e) {
    e.preventDefault();
    setMsg('');
    if (pw && pw !== pw2) return setMsg('New passwords do not match');
    const body = { currentPassword: cur };
    if (username.trim() && username.trim() !== me.username) body.newUsername = username.trim();
    if (pw) body.newPassword = pw;
    if (!body.newUsername && !body.newPassword) return setMsg('Nothing to change');
    try {
      const d = await api('/api/admin/account', { method: 'POST', body });
      setCur(''); setPw(''); setPw2('');
      setMsg(`Saved ✓${body.newPassword ? ' (other sessions signed out)' : ''}`);
      onChanged?.(d.user);
    } catch (err) { setMsg(err.message); }
  }
  return (
    <section className="panel" data-section="account">
      <h3>My account</h3>
      <form onSubmit={submit}>
        <label className="field">Username
          <input className="input" name="acct-username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" maxLength={32} />
        </label>
        <label className="field">New password <span className="count">(leave blank to keep)</span>
          <input className="input" type="password" name="acct-new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </label>
        {pw && (
          <label className="field">Repeat new password
            <input className="input" type="password" name="acct-new-password2" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
          </label>
        )}
        <label className="field">Current password (required)
          <input className="input" type="password" name="acct-current" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required />
        </label>
        <button className="btn btn-primary" style={{ marginTop: 10 }} type="submit" data-act="save-account">Save account</button>
        {msg && <p className="count" data-account-msg>{msg}</p>}
      </form>
    </section>
  );
}
