import { route, json } from '@/lib/http';
import { logout, SESSION_COOKIE, cookieOptions } from '@/lib/auth';

export const POST = route(async (req) => {
  await logout(req);
  const res = json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', cookieOptions(0));
  return res;
}, { mutation: true });
