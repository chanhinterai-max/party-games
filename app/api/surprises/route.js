import { route, json, readJson } from '@/lib/http';
import { requireRole, audit } from '@/lib/auth';
import { listSurprises, listDecks, surpriseCreate, deckCreate } from '@/lib/surprises';

// GLOBAL surprise content + Animal Match decks: advanced users and admins can read and edit.
export const GET = route(async (req) => {
  await requireRole(req, ['admin', 'advanced']);
  const [surprises, decks] = await Promise.all([listSurprises(), listDecks()]);
  return json({ surprises, decks });
});

export const POST = route(async (req) => {
  const user = await requireRole(req, ['admin', 'advanced']);
  const body = await readJson(req, 8 * 1024);
  if (body.kind === 'animal') {
    const animal = await deckCreate(body);
    await audit(user, 'deck_create', animal.id, { deck: animal.deck, name: animal.name }, req);
    return json({ animal }, 201);
  }
  const surprise = await surpriseCreate(body);
  await audit(user, 'surprise_create', surprise.id, { type: surprise.type, level: surprise.level }, req);
  return json({ surprise }, 201);
}, { mutation: true });
