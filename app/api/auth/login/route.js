import { route, json, readJson, str } from '@/lib/http';
import { login, SESSION_COOKIE, cookieOptions } from '@/lib/auth';

export const POST = route(async (req) => {
  const body = await readJson(req, 4096);
  const username = str(body.username, { min: 1, max: 64, name: 'Username' });
  const password = typeof body.password === 'string' ? body.password.slice(0, 256) : '';
  const { token, maxAge, user } = await login(req, username, password);
  const res = json({ user });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(maxAge));
  return res;
}, { mutation: true });
