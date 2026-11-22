'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/components/api';
import { compressAvatar } from '@/components/party/compressAvatar';

// v14 MY PROFILE (advanced players + admins): game name (shown in games; NOT the login username, which only the admin
// can change), favourite animal (from the pool), recovery email (password reset by email code), profile picture
// (compressed on this phone to a ~128 px square, <= 15 KB, before upload).
export default function MyProfile() {
  const [p, setP] = useState(undefined);
  const [form, setForm] = useState({ gameName: '', favAnimal: '', email: '' });
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [pic, setPic] = useState(null); // { url, bytes } just uploaded
  const fileRef = useRef(null);
  useEffect(() => {
    api('/api/me/profile').then((d) => { setP(d); setForm({ gameName: d.gameName || '', favAnimal: d.favAnimal || '', email: d.email || '' }); })
      .catch(() => setP(null));
  }, []);
  if (p === undefined) return <p className="count" style={{ marginTop: 30 }}>Loading…</p>;
  if (p === null) return <div className="panel" style={{ marginTop: 30 }}><h3>👤 My profile</h3><p className="count">Advanced players only.</p><Link className="btn btn-primary" href="/login">Login</Link></div>;
  const save = async (e) => {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true);
    try { const d = await api('/api/me/profile', { method: 'PUT', body: form }); setP({ ...p, ...d }); setMsg('Saved ✓'); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const upload = async (file) => {
    setErr(''); setMsg(''); setBusy(true);
    try {
      const blob = await compressAvatar(file);
      const r = await fetch('/api/me/avatar', { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Upload failed');
      setP({ ...p, avatar: d.avatar, avatarBytes: d.avatarBytes }); setPic({ url: d.avatar, bytes: d.avatarBytes }); setMsg(`Picture saved ✓ (${(d.avatarBytes / 1024).toFixed(1)} KB)`);
    } catch (x) { setErr(x.message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const removePic = async () => { setBusy(true); try { await api('/api/me/avatar', { method: 'DELETE' }); setP({ ...p, avatar: null, avatarBytes: 0 }); setPic(null); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  const fav = p.pool.find((a) => a.id === form.favAnimal);
  return (
    <>
      <section className="panel" style={{ marginTop: 30 }} data-section="profile">
        <h3>👤 My profile</h3>
        <p className="count">Login username: <b data-username>{p.username}</b> (only the admin can change it)</p>
        <div className="me-pic-row">
          <div className="me-pic" data-me-pic>{p.avatar ? <img src={p.avatar} alt="My picture" width={96} height={96} decoding="async" data-avatar-img /> : <span aria-hidden="true">{fav?.emoji || '🙂'}</span>}</div>
          <div>
            <label className="btn btn-ghost me-upload">📷 {p.avatar ? 'Change picture' : 'Upload picture'}
              <input ref={fileRef} type="file" accept="image/*" name="avatar" hidden disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
            {p.avatar && <button type="button" className="small-btn" data-act="remove-pic" disabled={busy} onClick={removePic}>Remove</button>}
            <p className="count" data-pic-size>{p.avatar ? `${(p.avatarBytes / 1024).toFixed(1)} KB · shown instead of your animal in games` : 'Cropped to a small square on this phone (≤ 15 KB).'}</p>
          </div>
        </div>
        <form onSubmit={save}>
          <label className="field">Game name (shown to players, 1-24 characters)
            <input name="gameName" maxLength={24} value={form.gameName} onChange={(e) => setForm({ ...form, gameName: e.target.value })} placeholder="e.g. Peter the Great" autoComplete="nickname" />
          </label>
          <p className="count">When you create a room, you join as the first player with this name, your animal and your picture.</p>
          <div className="label">Favourite animal</div>
          <div className="fav-grid" role="radiogroup" aria-label="Favourite animal">
            {p.pool.map((a) => (
              <button type="button" key={a.id} className={`fav-pick ${a.role}`} aria-pressed={form.favAnimal === a.id} data-fav={a.id}
                onClick={() => setForm({ ...form, favAnimal: form.favAnimal === a.id ? '' : a.id })}>
                <span className="e">{a.emoji}</span><small>{a.name}</small>
              </button>
            ))}
          </div>
          <label className="field" style={{ marginTop: 12 }}>Recovery email (for “Forgot password”)
            <input name="email" type="email" maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" autoComplete="email" />
          </label>
          <div className="error" role="alert">{err}</div>
          {msg && <p className="ok" role="status" data-saved>{msg}</p>}
          <button className="btn btn-primary" type="submit" data-act="save-profile" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
        </form>
      </section>
      <div className="section"><Link className="btn btn-ghost" href="/room">← Rooms</Link></div>
    </>
  );
}
