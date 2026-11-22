// Home-page game slots (CLIENT-SAFE: no DB import; lib/games.js adds the admin on/off switch).
// Add a real game by replacing a coming-soon entry.
//
// v12b 🎡 END-OF-GAME WHEEL — every game gets it unless its slot says `wheel: false`:
//   wheel      default true. At the end of every game a spinning wheel picks the next ⭐ Party Star.
//   wheelFrom  'ranking' (default): the game page reports its final ranking (winner first) through
//              components/party/useEndWheel.js → finish({ order }) — stateless games get a signed ticket
//              from POST /api/wheel, room games use the room action game_end.
//              'room': the server scores it from the room's own stats (Truth or Dare: dares done / chicken-outs).
// Home-page game slots. Add a real game by replacing a coming-soon entry.
export const GAME_SLOTS = [
  { id: 'truth-or-dare', name: 'Truth or Dare', emoji: '🍸', description: 'Spill a secret or take the dare. Newbies, Teen or Adult.', minPlayers: 2, maxPlayers: 16, href: '/play/truth-or-dare', featured: true, wheelFrom: 'room' },
  { id: 'animal-race', name: 'Animal Race', emoji: '🏁', description: 'Tap to race to the middle. Hide in the bushes when hunters come!', minPlayers: 2, maxPlayers: 16, href: '/play/animal-race' },
  { id: 'coming-soon-2', comingSoon: true, emoji: '🃏', name: 'Coming Soon', description: 'A new game is on the way.' },
  { id: 'coming-soon-3', comingSoon: true, emoji: '🍾', name: 'Coming Soon', description: 'A new game is on the way.' },
  { id: 'coming-soon-4', comingSoon: true, emoji: '🎤', name: 'Coming Soon', description: 'A new game is on the way.' },
  { id: 'coming-soon-5', comingSoon: true, emoji: '🪩', name: 'Coming Soon', description: 'A new game is on the way.' },
];

const slot = (id) => GAME_SLOTS.find((g) => g.id === id && !g.comingSoon);
export const wheelOn = (id) => !!slot(id) && slot(id).wheel !== false;
export const wheelFrom = (id) => slot(id)?.wheelFrom || 'ranking';
