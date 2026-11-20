# 🐾 Party Animal

Mobile-first party games for 2–16 players, made for bars and clubs. One phone, passed around the group.
Next.js on Vercel with Postgres (Neon). See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Games
| Game | Status |
| --- | --- |
| Truth or Dare (Children / Teen / Adult) | ✅ Playable |
| 🏁 Animal Race (tap race, heats + final) | ✅ Playable |
| 4 slots | 🔒 Coming soon |

## Roles
- **Anyone**: pick a game, enter names, play. Each game gets a room code.
- **Advanced player** (login): open a room by code, watch live, drag-and-drop edit the upcoming questions.
- **Admin** (login): everything above + manage advanced users, enable/disable games, list live rooms, audit log.

## Run locally
```bash
npm install
DATABASE_URL=postgres://... ADMIN_SETUP_SECRET=... COOKIE_INSECURE=1 npm run dev
```
`COOKIE_INSECURE=1` is only for plain-http localhost. Tables are created automatically on first request.
Create the first admin once at `/setup` (needs `ADMIN_SETUP_SECRET`).

## Adding a game
Add an entry in `lib/games.js` (replace a coming-soon slot) and create its page under `app/play/<game-id>/`.

## House rules
Drink responsibly: a sip is plenty and water always counts.
