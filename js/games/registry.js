// Game registry: the home page renders one tile per entry, in order.
// To add a new game:
//   1. Create js/games/<your-game>/game.js exporting `mount(container, { goHome })`.
//   2. Replace one of the "coming-soon" entries below with a real entry:
//      { id, name, emoji, description, minPlayers, maxPlayers, load: () => import('./<your-game>/game.js') }
// Entries with `comingSoon: true` render as locked teaser tiles.

export const games = [
  {
    id: 'truth-or-dare',
    name: 'Truth or Dare',
    emoji: '🍸',
    description: 'Spill a secret or take the dare. Mild, Flirty or Spicy.',
    minPlayers: 2,
    maxPlayers: 16,
    featured: true,
    load: () => import('./truth-or-dare/game.js'),
  },
  { id: 'coming-soon-1', comingSoon: true, emoji: '🎲', name: 'Coming Soon', description: 'A new game is on the way.' },
  { id: 'coming-soon-2', comingSoon: true, emoji: '🃏', name: 'Coming Soon', description: 'A new game is on the way.' },
  { id: 'coming-soon-3', comingSoon: true, emoji: '🍾', name: 'Coming Soon', description: 'A new game is on the way.' },
  { id: 'coming-soon-4', comingSoon: true, emoji: '🎤', name: 'Coming Soon', description: 'A new game is on the way.' },
  { id: 'coming-soon-5', comingSoon: true, emoji: '🪩', name: 'Coming Soon', description: 'A new game is on the way.' },
];
