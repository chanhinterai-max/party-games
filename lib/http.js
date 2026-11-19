import { NextResponse } from 'next/server';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200, headers = {}) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export function clientIp(req) {
  const xf = req.headers.get('x-forwarded-for');
  return (xf ? xf.split(',')[0].trim() : req.headers.get('x-real-ip')) || 'unknown';
}

// CSRF defence for state-changing requests: SameSite=Lax cookies + strict Origin check.
export function assertSameOrigin(req) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (!origin || !host) throw new HttpError(403, 'Missing origin');
  let o;
  try { o = new URL(origin); } catch { throw new HttpError(403, 'Bad origin'); }
  if (o.host !== host) throw new HttpError(403, 'Cross-origin request blocked');
}

export async function readJson(req, maxBytes = 64 * 1024) {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request too large');
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v;
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

// Wrap a route handler: origin check on mutations, uniform error handling, no leaking internals.
export function route(handler, { mutation = false } = {}) {
  return async (req, ctx) => {
    try {
      if (mutation) assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error('API error:', e?.message || e);
      return json({ error: 'Server error' }, 500);
    }
  };
}

export function str(v, { min = 0, max = 200, name = 'value', pattern } = {}) {
  if (typeof v !== 'string') throw new HttpError(400, `${name} is required`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw new HttpError(400, `${name} must be ${min}-${max} characters`);
  if (pattern && !pattern.test(s)) throw new HttpError(400, `${name} has invalid characters`);
  return s;
}
