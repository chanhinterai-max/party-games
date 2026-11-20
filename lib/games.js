import { q } from './db.js';

// Home-page game slots. Add a real game by replacing a coming-soon entry.
export const GAME_SLOTS = [
  { id: 'truth-or-dare', name: 'Truth or Dare', emoji: '🍸', description: 'Spill a secret or take the dare. Children, Teen or Adult.', minPlayers: 2, maxPlayers: 16, href: '/play/truth-or-dare', featured: true },
  { id: 'animal-race', name: 'Animal Race', emoji: '🏁', description: 'Tap to race to the middle. Freeze when wild animals come!', minPlayers: 2, maxPlayers: 16, href: '/play/animal-race' },
  { id: 'coming-soon-2', comingSoon: true, emoji: '🃏', name: 'Coming Soon', description: 'A new game is on the way.' },
  { id: 'coming-soon-3', comingSoon: true, emoji: '🍾', name: 'Coming Soon', description: 'A new game is on the way.' },
  { id: 'coming-soon-4', comingSoon: true, emoji: '🎤', name: 'Coming Soon', description: 'A new game is on the way.' },
  { id: 'coming-soon-5', comingSoon: true, emoji: '🪩', name: 'Coming Soon', description: 'A new game is on the way.' },
];

export async function gamesWithStatus() {
  const r = await q('SELECT id, enabled FROM games');
  const m = new Map(r.rows.map((x) => [x.id, x.enabled]));
  return GAME_SLOTS.map((g) => ({ ...g, enabled: m.has(g.id) ? m.get(g.id) : true }));
}

export async function isGameEnabled(id) {
  const r = await q('SELECT enabled FROM games WHERE id=$1', [id]);
  return r.rows.length ? r.rows[0].enabled : true;
}
