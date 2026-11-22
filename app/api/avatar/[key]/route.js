import { avatarByKey } from '@/lib/profile';

// v14 profile pictures, by opaque key (changes on every upload) → cached forever by browsers and the CDN.
export async function GET(req, { params }) {
  try {
    const { key } = await params;
    const a = await avatarByKey(key);
    if (!a) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } });
    return new Response(a.avatar, { status: 200, headers: {
      'Content-Type': a.avatar_type, 'Content-Length': String(a.avatar.length), 'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, s-maxage=86400, immutable', 'Content-Security-Policy': "default-src 'none'",
    } });
  } catch (e) {
    console.error('avatar error', e?.message);
    return new Response('Server error', { status: 500 });
  }
}
