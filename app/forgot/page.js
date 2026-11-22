'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/components/api';

// v14 FORGOT PASSWORD (advanced players): username or recovery email → 6-digit code by email (15 min) → new password.
// If the email provider isn't configured, it says so (no fake "sent" message).
export default function Forgot() {
  const [enabled, setEnabled] = useState(undefined);
  const [step, setStep] = useState(1);
  const [id, setId] = useState(''); const [code, setCode] = useState(''); const [pw, setPw] = useState('');
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { api('/api/auth/forgot').then((d) => setEnabled(!!d.enabled)).catch(() => setEnabled(false)); }, []);
  const send = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const d = await api('/api/auth/forgot', { method: 'POST', body: { id } }); setMsg(d.message); setStep(2); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const reset = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api('/api/auth/reset', { method: 'POST', body: { id, code, password: pw } }); setStep(3); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <section className="panel" style={{ marginTop: 30 }} data-section="forgot">
      <h3>🔑 Forgot password</h3>
      {enabled === undefined && <p className="count">Loading…</p>}
      {enabled === false && (
        <p className="count" data-reset-off>Password reset by email isn’t set up yet. Ask the admin to reset your password.</p>
      )}
      {enabled && step === 1 && (
        <form onSubmit={send}>
          <label className="field">Username or recovery email
            <input name="id" value={id} onChange={(e) => setId(e.target.value)} required maxLength={254} autoComplete="username" />
          </label>
          <div className="error" role="alert">{err}</div>
          <button className="btn btn-primary" type="submit" disabled={busy} data-act="send-code">{busy ? 'Sending…' : 'Email me a code'}</button>
        </form>
      )}
      {enabled && step === 2 && (
        <form onSubmit={reset}>
          <p className="count" data-reset-sent>{msg}</p>
          <label className="field">6-digit code
            <input name="code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" required />
          </label>
          <label className="field">New password (12+ characters)
            <input name="password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={12} maxLength={128} autoComplete="new-password" required />
          </label>
          <div className="error" role="alert">{err}</div>
          <button className="btn btn-primary" type="submit" disabled={busy} data-act="reset-pw">{busy ? 'Saving…' : 'Set new password'}</button>
        </form>
      )}
      {step === 3 && <p className="ok" data-reset-done>Password changed ✓ — you can sign in now.</p>}
      <div className="section"><Link className="btn btn-ghost" href="/login">← Login</Link></div>
    </section>
  );
}
