import { route, json, readJson } from '@/lib/http';
import { requireRole, audit } from '@/lib/auth';
import { listSurprises, listPool, listHuman, surpriseCreate, poolCreate, humanCreate, POOL_MIN } from '@/lib/surprises';

// GLOBAL surprise content, the predator/prey animal pool and Human items: advanced users and admins.
export const GET = route(async (req) => {
  await requireRole(req, ['admin', 'advanced']);
  const [surprises, pool, human] = await Promise.all([listSurprises(), listPool(), listHuman()]);
  return json({ surprises, pool, human, poolMin: POOL_MIN });
});

export const POST = route(async (req) => {
  const user = await requireRole(req, ['admin', 'advanced']);
  const body = await readJson(req, 8 * 1024);
  if (body.kind === 'animal') {
    const animal = await poolCreate(body);
    await audit(user, 'pool_create', animal.id, { role: animal.role, name: animal.name }, req);
    return json({ animal }, 201);
  }
  if (body.kind === 'human') {
    const item = await humanCreate({ ...body, kind: body.humanKind });
    await audit(user, 'human_create', item.id, { kind: item.kind, level: item.level }, req);
    return json({ human: item }, 201);
  }
  const surprise = await surpriseCreate(body);
  await audit(user, 'surprise_create', surprise.id, { type: surprise.type, level: surprise.level }, req);
  return json({ surprise }, 201);
}, { mutation: true });
