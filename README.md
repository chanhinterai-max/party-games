# 🍸 Party Games

Mobile-first party games for 2–16 players, made for bars and clubs. One phone, passed around the group. Plain static HTML/CSS/JS — no build step.

## Games
| Game | Status |
| --- | --- |
| Truth or Dare (Mild / Flirty / Spicy) | ✅ Playable |
| 5 slots | 🔒 Coming soon |

## Run locally
```bash
npx serve .        # or: python3 -m http.server 8000
```

## Adding a game
1. Create `js/games/<game-id>/game.js` that exports `mount(container, { goHome })`.
2. In `js/games/registry.js`, replace a `comingSoon` entry with:
   ```js
   { id: '<game-id>', name: 'My Game', emoji: '🎉', description: '...', minPlayers: 2, maxPlayers: 16,
     load: () => import('./<game-id>/game.js') }
   ```
The home page renders tiles straight from the registry, and `#/<game-id>` deep-links to the game.

## Truth or Dare
- Cards live in `js/games/truth-or-dare/cards.js` (42 truths + 42 dares per level). `{other}` is replaced with a random other player.
- Fair rotation: everyone gets one turn per round in random order, never the same player twice in a row.
- No repeat cards until a deck is exhausted. Player names and level are saved in `localStorage`.

## House rules
Drink responsibly — a sip is plenty and water always counts. Anyone can skip any card. Consent first: ask before any touch.
