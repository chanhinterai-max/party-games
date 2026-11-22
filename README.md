# 🐾 Party Animal

Mobile-first party games for 2–16 players, made for bars and clubs. One phone, passed around the group.
Next.js on Vercel with Postgres (Neon). See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Games
| Game | Status |
| --- | --- |
| Truth or Dare (Newbies / Teen / Adult; internal id `children`) | ✅ Playable |
| 🏁 Animal Race (tap race, heats + final) | ✅ Playable |
| 4 slots | 🔒 Coming soon |

## Roles
- **Anyone**: pick a game, enter names, play. Each game gets a room code.
- **Advanced player** (login): open a room by code, watch live, drag-and-drop edit the upcoming questions.
- **Admin** (login): everything above + manage advanced users (create, rename, disable), enable/disable games, list live rooms, audit log.
- v14 **My profile** (`/me`, advanced): game name, favourite animal, recovery email and a small picture. In rooms they create, they join as player 1 with that name/animal/picture. Forgot password → code by email (needs `RESEND_API_KEY` + `RESET_FROM`).

## Run locally
```bash
npm install
DATABASE_URL=postgres://... ADMIN_SETUP_SECRET=... COOKIE_INSECURE=1 npm run dev
```
`COOKIE_INSECURE=1` is only for plain-http localhost. Tables are created automatically on first request.
Create the first admin once at `/setup` (needs `ADMIN_SETUP_SECRET`).

## Adding a game
Add an entry in `lib/gameSlots.js` (replace a coming-soon slot) and create its page under `app/play/<game-id>/`. The 🎡 end-of-game Party Star wheel is on by default (`wheel: true`): use `components/party/useEndWheel.js` — see "Adding a game" in ARCHITECTURE.md.

## House rules
Drink responsibly: a sip is plenty and water always counts.
