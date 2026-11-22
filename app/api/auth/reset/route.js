import { route, json, readJson } from '@/lib/http';
import { confirmReset } from '@/lib/reset';

// v14: POST { id, code, password } → new password (one-time 15-min code; signs out every session of that account)
export const POST = route(async (req) => json(await confirmReset(req, await readJson(req, 2048))), { mutation: true });
