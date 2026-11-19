'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from './api';

export default function AuthButton() {
  const [user, setUser] = useState(undefined);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    api('/api/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null));
    setOpen(false);
  }, [pathname]);

  if (user === undefined) return <span style={{ width: 70 }} />;
  if (!user) return <Link className="auth-btn" href="/login">🔐 Login</Link>;

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    setOpen(false);
    router.push('/');
    router.refresh();
  }
  return (
    <>
      <button className="auth-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        👤 {user.username}
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="who">Signed in as {user.role === 'admin' ? 'Admin' : 'Advanced player'}</div>
          <Link href="/room">🎛️ Rooms & queue editor</Link>
          {user.role === 'admin' && <Link href="/admin">🛡️ Admin dashboard</Link>}
          <button onClick={logout}>🚪 Log out</button>
        </div>
      )}
    </>
  );
}
