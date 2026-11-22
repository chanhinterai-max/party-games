import { route, json, readJson } from '@/lib/http';
import { resetEnabled, requestReset } from '@/lib/reset';

// v14: GET → is reset-by-email set up? POST { id: username or recovery email } → generic answer (never says if it exists)
export const GET = route(async () => json({ enabled: resetEnabled() }));
export const POST = route(async (req) => json(await requestReset(req, await readJson(req, 1024))), { mutation: true });
