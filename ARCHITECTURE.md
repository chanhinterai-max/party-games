# Architecture

**Party Animal** (repo/project `party-games`) is a single **Next.js 16 (App Router)** app on **Vercel**. The pages run in the
phone's browser, the API runs as Vercel Functions (Node.js), and all state lives in
**Postgres (Neon, via the Vercel Marketplace)**. Nothing secret is stored in the repo.

```mermaid
flowchart LR
  subgraph Browser["📱 Phone / browser"]
    P["Player screen /play/truth-or-dare<br/>open animal list + 🐾 Animals box, 3D flip card, heat meter,<br/>surprise cards, timers, Chicken out 🐔, running party animals, confetti results"]
    A["Advanced player /room/[code]<br/>live view, queue editor, quick categories,<br/>global drinks + surprise cards + Human items + animal pool"]
    RC["🏁 Animal Race /play/animal-race<br/>setup (Normal / Adult mode) + Meet the animals, heats + final,<br/>RaceBoard: 2 canvases (static bg + 1 rAF canvas), random equal-length crossing tracks,<br/>trees/bushes + wandering wild animals with vision cones, crashes 💥 / 💕 babies,<br/>Adult day/night + rain/lightning/wind, ALL race logic on the phone (lib/race/*)"]
    D["Admin /admin<br/>account, users, question bank (heat, timer),<br/>chicken odds + pet-rule target, surprise share, games, rooms, audit"]
  end
  subgraph Vercel["▲ Vercel (Next.js 16 Functions)"]
    R1["/api/rooms/*<br/>create (1:1 predator/prey + Human, surprise schedule),<br/>draw / done / chicken / surprise_done / level / end · idle close · results"]
    R2["/api/rooms/[code]/queue · /api/me/categories<br/>/api/drinks · /api/surprises"]
    R3["/api/auth/* · /api/setup"]
    R5["/api/race/start (stateless)<br/>validate players, game enabled?, assign animals + speed_pct,<br/>wild animals {emoji, speed} — no room, no DB writes"]
    R4["/api/admin/*<br/>account, users, bank, chicken-odds + pet duration,<br/>surprise-rate, games, rooms, audit"]
    L["lib/: animals (shared roles) · race/* (config, heats, geometry, engine — also bundled to the phone) ·<br/>game · results · bank · surprises · settings · categories · auth · db<br/>(seed.js, seed-v5.js, seed-v6.js are server-only)"]
  end
  DB[("🐘 Neon Postgres<br/>users · sessions · rooms · games · audit_log · login_throttle<br/>bank_who · bank_what (heat, seconds) · bank_where (heat)<br/>surprise_items · animal_pool (predator/prey, speed_pct) · human_items<br/>user_categories · settings (drinks, odds, pet, surprise, seed_v5, seed_v6)")]
  P -- "JSON + x-room-token" --> R1
  A -- "httpOnly session cookie" --> R2
  D -- "httpOnly session cookie" --> R4
  RC -- "1 call before the race, none during it" --> R5
  P & A & D --> R3
  R1 & R2 & R3 & R4 & R5 --> L
  L -- "parameterized SQL over TLS (DATABASE_URL)" --> DB
```

## Directory tree

```
party-games/
├── app/                              ── UI pages (browser) + API routes (server)
│   ├── layout.js                     Site shell + "Party Animal" title/metadata/brand; Login button (AuthButton.js)
│   ├── page.js                       Home ("Party Animal"): game tiles, hides games disabled by the admin
│   ├── globals.css                   Neon/dark mobile-first styles (+ gender dots, chicken modal, animals)
│   ├── play/truth-or-dare/page.js    PLAYER SCREEN: names + Male/Female, level, room code, OPEN animal list after
│   │                                 Start (name, gender dot, emoji, animal, Predator/Prey/Human) + collapsible
│   │                                 🐾 Animals box (native <details>, no server call), heat meter, virus banner,
│   │                                 3D flip card (Truth cyan / Dare pink / Surprise amber, shimmer while the
│   │                                 single draw request is in flight), timers, Chicken out 🐔, running animals =
│   │                                 the players' own animals (Human = 🏃), "🧍 Human card" label,
│   │                                 End game, results + confetti
│   ├── play/animal-race/page.js      🏁 ANIMAL RACE: setup (shared PlayerRows) → Meet the animals (shared
│   │                                 AnimalList + heat plan chips) → heats → final → champion; remembers players
│   ├── login/page.js                 Login form (advanced players + admins)
│   ├── setup/page.js                 One-time first-admin form (needs ADMIN_SETUP_SECRET)
│   ├── room/page.js                  Enter a room code
│   ├── room/[code]/page.js           ADVANCED: live view + queue editor (components/QueueEditor.js)
│   ├── admin/page.js                 ADMIN PAGE: my account, users (create/enable/reset/delete), question
│   │                                 bank, chicken odds + hidden rule, drinks, games, live rooms, audit
│   └── api/
│       ├── games/route.js            GET enabled games (public)
│       ├── race/start/route.js       ANIMAL RACE START (POST, stateless): game enabled? players valid? → animals
│       │                             (1:1 predator/prey + Human) + wild emojis from unused pool animals
│       ├── rooms/route.js            POST create room (players with gender) → code + host token + public animals
│       ├── rooms/[code]/route.js     GET public room state (no odds / rule ever exposed)
│       ├── rooms/[code]/action/route.js  POST draw | done | chicken {petted:[{id,elapsedMs}]} | surprise_done | level | end
│       │                                 (host token; response = new state, no history → no refetch)
│       ├── rooms/[code]/queue/route.js   GET/PUT hidden question queues (advanced/admin)
│       ├── me/categories/…           QUICK CATEGORIES: GET/POST, PATCH/DELETE [id] (own only)
│       ├── config/route.js           GET public UI config (petted duration seconds)
│       ├── drinks/route.js           DRINK OPTIONS: GET/PUT global chicken-out drinks (advanced/admin)
│       ├── surprises/route.js        SURPRISE CONTENT + ANIMAL POOL + HUMAN ITEMS: GET all / POST surprise,
│       │                             {kind:'animal', role} or {kind:'human', humanKind} (advanced/admin, GLOBAL)
│       ├── surprises/[id]/route.js   PATCH / DELETE a surprise (sp-…), pool animal (an-…, min 8 per side) or Human item (hu-…)
│       ├── auth/login|logout|me/route.js  Session login/logout/current user
│       ├── setup/route.js            One-time admin bootstrap (refuses once an admin exists)
│       └── admin/
│           ├── account/route.js      POST change own username and/or password (current password required)
│           ├── users/route.js        GET list / POST create advanced user
│           ├── users/[id]/route.js   PATCH enable/disable · DELETE advanced user (cascades sessions+categories)
│           ├── users/[id]/password/route.js  POST reset password (revokes sessions)
│           ├── bank/route.js         QUESTION BANK: GET all / POST add WHO|WHAT|WHERE
│           ├── bank/[kind]/[id]/route.js  PATCH edit / DELETE bank entry
│           ├── chicken-odds/route.js ANIMAL RULE: GET/PUT odds, hidden rule (target any-prey | any-predator | human |
│           │                         pool animal id), petted duration (3-300 s); GET returns the target list
│           ├── surprise-rate/route.js SURPRISE SHARE: GET/PUT surprise cards as % of total questions (admin, 0-50, default 10)
│           ├── games/route.js        GET/PATCH home-page game toggles
│           ├── rooms/route.js        GET live rooms (last 12h)
│           └── audit/route.js        GET last 100 audit entries
├── components/
│   ├── AuthButton.js                 Login / user menu (top-right)
│   ├── QueueEditor.js                Drag-and-drop WHO/WHAT/WHERE editor + category filter
│   ├── CategoryManager.js            Add/edit/delete own quick categories
│   ├── DrinksEditor.js               Global chicken-out drink options
│   ├── GenderDot.js                  Blue (male) / pink (female) solid circle next to names
│   ├── Results.js                    End-of-game results (awards, titles, pairs) for players + advanced view
│   ├── RunningAnimals.js             CSS-animated animals (in a game: the players' animals, up to 16 lanes; setup:
│   │                                 generic babies); tap = petted 20 s (reduced-motion aware); they run
│   │                                 BEHIND the UI (z-index -1) so they never block a button but stay tappable
│   ├── SurpriseEditor.js             Surprise cards (type/level/text/on-off/timer), 🧍 Human tab (surprise/truth/
│   │                                 dare) + predator/prey animal pool
│   │                                 (advanced room view + admin page; loads only when opened);
│   │                                 pool chips: tap → edit name/emoji + ⚡ race speed 80–120% (⚡N% tag)
│   ├── party/store.js                SHARED setup: remembered players (localStorage key shared by both games),
│   │                                 min/max, blank row, checkPlayers
│   ├── party/PlayerRows.js           SHARED name + Male/Female rows + add/remove (Truth or Dare + Animal Race)
│   ├── party/useNoSelect.js          NO SELECTABLE TEXT in both games (every phase): html.no-select class
│   │                                 (user-select none, -webkit-touch-callout none) + blocks contextmenu /
│   │                                 selectstart / dragstart except inside inputs (player names still editable)
│   ├── party/AnimalList.js           SHARED "Meet the animals" list (name, gender dot, emoji, Predator/Prey/Human)
│   ├── race/RaceBoard.js             RACE BOARD (v8 canvas): static background canvas (tracks, trees/bushes,
│   │                                 puddles, goal; drawn once) + ONE dynamic canvas redrawn per rAF (racers,
│   │                                 wild animals + 🔭 vision cones, ❓/‼️/😋, 💥/💕 fx, babies, night mask with
│   │                                 light around racers, rain/wind/lightning, next-weather cue). Emoji sprite
│   │                                 cache, DPR ≤ 2. DOM only for the rotated tap buttons (native pointerdown,
│   │                                 4 touches), countdown and finish label. window.__race = test hook
│   ├── race/RaceResults.js           Heat/final podium (medals, distance bars) + 🍺 Drink! callout for last place
│   ├── play/Timer.js                 Countdown (Start/Pause + Reset), runs only on the phone
│   ├── play/Confetti.js              Hand-rolled CSS confetti (36 spans, after first paint, reduced-motion off)
│   ├── play/SurpriseBody.js          Surprise face: Animal Match (predator + prey, with player names), Human,
│   │                                 Virus, Group vote (1-2-3), Whisper (peek), Chooser
│   ├── play/Chooser.js               Dare Chooser: multi-touch finger pick + tap-to-join fallback
│   ├── admin/AccountPanel.js         Change own username / password
│   ├── admin/BankPanel.js            Manage WHO / WHAT (+ heat 1-3, timer seconds) / WHERE (+ heat) bank
│   ├── admin/SurpriseRatePanel.js    Surprise cards as a share of total questions (admin only)
│   ├── admin/OddsPanel.js            Chicken odds + hidden rule (pet-rule target select)
│   └── api.js                        fetch helper
├── lib/                              ── server-side logic
│   ├── content.js                    CLIENT-SAFE constants only (levels, private-part blocklist, running
│   │                                 animals, pet-duration limits, drink categories, default drinks/odds)
│   ├── seed.js                       SERVER-ONLY first-run bank seed (WHO, WHERE incl. thigh, WHAT templates,
│   │                                 "Flirty default" category); moved out of content.js to shrink phone JS
│   ├── seed-v5.js                    SERVER-ONLY v5 seed: 40 Adult items, pick-a-partner + two-player dares,
│   │                                 timed items, surprise cards for every type × level, female/male decks,
│   │                                 one-time heat/seconds guesses for existing rows
│   ├── seed-v6.js                    SERVER-ONLY v6 seed: 20-animal pool (10 predators / 10 prey), predator-plays-
│   │                                 with-prey Animal Match texts, v5→v6 match rewrites, Human surprise/truth/dare
│   ├── bank.js                       QUESTION BANK (DB): load (10 s per-instance cache, invalidated on writes;
│   │                                 also carries enabled Human truth/dare items)
│   │                                 + validated CRUD for bank_who/what/where incl. heat + seconds; {partner}
│   ├── settings.js                   SETTINGS: drink options, odds + pet-rule target (ruleHit), petted duration,
│   │                                 surprise share (settings table); server-side drink pick + petted-window check
│   ├── surprises.js                  SURPRISE CONTENT + ANIMAL POOL + HUMAN ITEMS (surprise_items, animal_pool,
│   │                                 human_items): validated CRUD; atomic "keep ≥ 8 per side" delete
│   ├── categories.js                 QUICK CATEGORIES (user_categories table), per-user seeding
│   ├── game.js                       ROOM/QUEUE LOGIC: codes, genders, queues (players × 10, heat-ordered mild →
│   │                                 hot + jitter), question budget, turns, draw/done/chicken/surprise_done/level/
│   │                                 end, surprise schedule fixed at Start + 3-turn virus, 1:1 predator/prey
│   │                                 assignment (+ Human on odd counts), Human Truth/Dare draws (1 in 3),
│   │                                 idle close (inside the action transaction), per-turn stats
│   ├── results.js                    STATS/RESULTS LOGIC: state.stats shape, awards, ties, funny titles, pairs
│   ├── auth.js                       SESSION/AUTH LOGIC: Argon2id, login + lockout, IP throttling,
│   │                                 session tokens (SHA-256 in DB), roles, audit log
│   ├── db.js                         DATABASE SCHEMA + idempotent additive migrations + first-run seeding +
│   │                                 one-time `seed_v5` / `seed_v6` (inserts only missing rows; never wipes edits)
│   ├── animals.js                    SHARED ANIMAL ROLES: shuffle, 1:1 predator/prey + 🧍 Human on odd counts,
│   │                                 public animal view (used by game.js and the race start API)
│   ├── race/config.js                🏁 RACE TUNABLES (ONE file, every number): steps, tap cap, track length
│   │                                 factor/samples/crossing zone, crash distance + love cooldown, covers per
│   │                                 track + roam, wild caps (18 wild / 6 babies), vision cone (34°, 112 px day /
│   │                                 165 px night), ❓/approach/sprint, penalty 900+1000+700 ms, speed clamp
│   │                                 80–120, and `adult` (90 steps, longer tracks, spells, puddles, lightning,
│   │                                 gusts, trip threshold, rain-drop cap); modeCfg(mode), clampSpeed()
│   ├── race/heats.js                 Heat sizes (≤4, balanced) + predator/prey mixing; final when >1 heat
│   ├── race/geometry.js              RANDOM CURVY TRACKS: one random sine-series curve from the bottom-left
│   │                                 corner forced through two vias on the centre lines, MIRRORED for the other
│   │                                 corners → every track exactly the same arc length + curvature and crosses
│   │                                 its neighbours; 240 equal-arc samples; keep-off grid (tracks, goal,
│   │                                 buttons, edges); trees/bushes placed per progress band and mirrored onto
│   │                                 every track with their roam points (fair); landscape = rotated portrait
│   ├── race/engine.js                Pure race state machine: taps × speed, idle hide, racer crashes (predator/
│   │                                 prey → both home; same role + opposite gender → 💕 baby, 10 s cooldown;
│   │                                 else pass; Human passes), wild animals (cover → wander → back, cone-gated
│   │                                 ❓ → approach → sprint, never on a track), Adult weather timeline (night,
│   │                                 rain + puddles + lightning freeze, wind gusts, trips), equal penalties,
│   │                                 ranking + drinkers (client-side; unit-tested in node)
│   ├── games.js                      Home-page game slots registry (add new games here; Animal Race = slot 2)
│   └── http.js                       JSON responses, Origin (CSRF) check, input validation, errors
├── next.config.mjs                   Security headers (HSTS, nosniff, frame deny, …)
├── .env.example                      Names of required env vars (no real values)
├── ARCHITECTURE.md                   This file
└── README.md
```

## Where things live

| Thing | Location |
|---|---|
| Question bank (live) | Postgres `bank_who`, `bank_what` (+ `heat` 1-3, `seconds`), `bank_where` (+ `heat`) (edited on /admin; seeded once from `lib/seed.js` + `lib/seed-v5.js`) |
| Surprise cards | `surprise_items` table (type match/virus/vote/whisper/chooser, level, text, enabled, seconds); GLOBAL, edited by advanced players + admins |
| **Animal pool (v6)** | `animal_pool` table (id `an-…`, role predator/prey, name, emoji, sort, **`speed_pct` INT default 100 (v8, 80–120, server-clamped)**); 10 + 10 seeded; GLOBAL, edited by advanced players + admins; deletes blocked below 8 per side. (The v5 `animal_deck` table is kept but unused.) |
| **Human items (v6)** | `human_items` table (id `hu-…`, kind surprise/truth/dare, level, text, enabled, seconds); GLOBAL, same editors |
| Animals per room | `rooms.state.animals` (player → {id, role predator/prey/human, name, emoji}); PUBLIC in the room state, shown on the reveal list, the 🐾 Animals box, the running animals and results |
| Surprise share | `settings` row `surprise` = `{rate}` = % of total questions (admin only, 0-50, default 10 → 1 per 10 questions) |
| Surprise schedule per room | `rooms.state.surpriseAt` (finished-turn numbers, fixed at Start, never sent to the phone) + `state.turnsDone` |
| Open surprise / virus | `rooms.state.surprise` (`pair` = [predator player, prey player] for Animal Match), `rooms.state.virus` `{text, turnsLeft}` |
| Seed markers | `settings` rows `seed_v5`, `seed_v6` (each one-time; deleted items are not re-added; v6 rewrote only unchanged v5 match texts and switched the pet rule 'kitten' → 'any-prey' only if it was still the default) |
| Quick categories | `user_categories` table (one row per category, per user; `who_rule`, `what_ids`, `where_list`) |
| Chicken-out drink options | `settings` row `drinks` (global; edited by advanced players and admins) |
| Chicken odds + hidden animal rule | `settings` row `odds` (admin only; `rule.animal` = any-prey (default) / any-predator / human / pool id; outcome picked server-side in `lib/settings.js`) |
| Player genders | `rooms.genders` JSONB (name → male/female) |
| Petted duration (= secret-rule window) | `settings` row `pet` = `{seconds}` (default 20, 3-300) |
| Room lifecycle | `rooms.status` (active / ended / closed), `closed_reason` (complete / host / idle), `ended_at`, `last_activity` (last Truth/Dare pick) |
| Per-turn stats | `rooms.state.stats` (per player: truths, dares, done, chicken, drinks by category; pair interaction counts) + `rooms.history` (each turn with resolved WHO `target`, result, drink) |
| Account + password schema | `users` table in `lib/db.js` (`password_hash` = Argon2id) |
| **Passwords** | Only as Argon2id hashes in the Postgres `users` table. There is no password file in the repo. |
| Sessions | `sessions` table: SHA-256 of a random 256-bit token; the raw token is only in an httpOnly cookie `pg_session` (Secure, SameSite=Lax, 12h) |
| Rooms, queues, history | `rooms` table (`truth_queue`, `dare_queue`, `history`, `state` as JSONB) |
| Game on/off switches | `games` table (missing row = enabled); `animal-race` uses the same switch |
| **Animal Race rules + timing (v8)** | `lib/race/config.js` (`RACE`): stepsToGoal 45 (Adult 90), stopMs 350, maxTapsPerSec 14, track length 1.5× straight (Adult 1.85×), crashDist 22, loveCooldownMs 10000, covers 2 per track (Adult 3), maxWild 18, maxBabies 6, cone 34° / 112 px (night 165 px), ❓ 700 / approach 1100 / sprint 400 ms, penalty 900 + 1000 + 700 = 2600 ms for every outcome, `adult.*` weather numbers. Code constants (no admin UI) |
| **Per-animal race speed (v8)** | `animal_pool.speed_pct` (advanced players + admins, pool editor ⚡); sent by `/api/race/start` for racers and wild animals; distance per tap and wild walking speed × speed/100 |
| **Race mode** | localStorage `partygames.race.mode` (normal / adult), picked on the race setup screen |
| **Animal Race state** | Only in the phone's memory during a race (no room, no DB row, nothing sent to the server); players remembered in localStorage `partygames.tod.players.v3` (shared with Truth or Dare) |
| Animal Race animals | Same `animal_pool` table; roles dealt by `lib/animals.js`; wild animals = pool animals not dealt to players |
| Audit trail | `audit_log` table (who, action, target, IP, time) |
| Login rate limiting | `login_throttle` table (per IP) + `users.failed_attempts` / `locked_until` (5 fails → 15 min lock) |

## Environment variables (Vercel project settings only)

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (pooled), added by the Neon Marketplace integration `party-games-db`. Fallbacks if renamed: `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_URL_NON_POOLING` |
| `PGHOST`, `PGHOST_UNPOOLED`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Also added by Neon; not used by the app directly |
| `ADMIN_SETUP_SECRET` | Long random secret required by `/api/setup` to create the first admin (one time) |

## Request flow

1. **Player** (no login): picks a game → enters names + level → `POST /api/rooms`. The server makes a
   5-character room code, a random host token (only its hash is stored), and hidden queues of upcoming
   Truth and Dare questions (WHO + WHAT, plus WHERE for Adult touch dares).
2. Each Truth/Dare press calls `POST /api/rooms/[code]/action` → the server serves the **next item of that type
   from the current queue**, so edits made by an advanced player apply on the very next question.
3. **Advanced player / admin** logs in → opens `/room/[code]` → sees the live turn, card and history (polled every
   3 s) and drags WHO/WHAT/WHERE chips or whole questions; every change is saved with `PUT /api/rooms/[code]/queue`
   (validated server-side, audit-logged).
4. **Chicken out 🐔**: the player screen sends `{action:'chicken', petted:[animal ids]}`; the server picks the drink
   category with the configured odds (switching to the rule odds only if the target animal was petted less than the
   configured petted duration ago, + 2 s tolerance; the client sends elapsed ms, so device clocks don't matter) and a random
   option text. Only the result comes back; odds and the rule are never sent to players.
5. **Questions per room** = players × 10. Each queue (truth, dare) is built with that many items on creation and on a
   level change; the game ends automatically once that many questions have been played, or when the host taps End game.
6. **Idle timeout**: room reads/polls run `closeIfIdle`; player actions check `last_activity` inside their own
   transaction (one fewer round trip per tap). The admin live-rooms list closes all idle rooms. No cron.
7. **Results** are computed from `state.stats` (`lib/results.js`) whenever a room is not active, and shown to the
   player device and in the advanced room view.
8. **Admin** manages own account, advanced users, the question bank, odds/rule, games and live rooms at `/admin`.
9. **Instant feel (v5)**: a Truth/Dare tap flips the card in the same frame and sends ONE draw request; the face shows
   a shimmer until the response arrives (no prefetch, no cached cards; the server queue stays the source of truth).
   Next / Chicken / surprise Done flip back immediately. Every action button is disabled while its request is in
   flight (double-tap guard), and the action response is the new state (no refetch except after a 409).
10. **Surprises (v6)**: at Start the server fixes `count = round(total × share%)` (min 1 when share > 0) and picks one
   random finished-turn slot per equal stretch of turns 1 … total-1 (`state.surpriseAt`): never before the first
   question, never two in a row. When a slot is reached it picks a type among the enabled surprise items for the
   level (+ `human` items when the game has a Human). A surprise is its own turn (`surprise_done`), consumes no queue
   question and does not count toward players × 10. Animal Match always calls one PREDATOR ({a}) and one PREY ({b}),
   shown with player names. Virus sets a rule shown for the next 3 turns.
11. **Party animals (v6)**: at Start the players are shuffled; on an odd count one becomes the 🧍 Human; the rest
   split half predators / half prey (gender ignored) with unique pool animals. On about 1 in 3 of the Human's own
   Truth/Dare picks (`HUMAN_SHARE_DEN` in `lib/game.js`) a Human item is served instead of the queue head: the queue
   is not consumed or reordered, but the card counts toward players × 10. Chicken-out's hidden rule resolves petted
   running-animal ids through the room's animal roles (any-prey / any-predator / human / a specific animal).
12. **Heat (v5)**: new queues are sorted by WHAT heat (+ WHERE heat) with random jitter (initial order only); the heat
   meter shows turns played / total.

13. **Animal Race (v7)**: setup → `POST /api/race/start` (stateless; 403 when the admin disabled the game) →
   Meet the animals → heats of ≤4 (balanced, predators and prey mixed) → a final for heat winners when there is more
   than one heat. During a race everything runs on the phone: a tap moves the animal one step; with no tap for
   350 ms prey hide in a bush, predators sleep and the Human crouches. Every lane gets the same number of wild
   animals at shared times (+ small per-lane jitter); they live in a strip beside the lane that never crosses any
   lane. If the racer moves: ❓ → slow approach → sprint → contact; stopping first makes the wild animal leave.
   On contact the racer goes back to the start after the same penalty (eaten / feast + rest / caught / distracted
   all = 2600 ms). First to the goal wins; the rest rank by distance; last place (ties too) drinks.

14. **Animal Race (v8)**: every race draws new random curvy tracks (one per racer, from its corner to the shared
   goal), all exactly the same length and each crossing another. Racers meeting at a crossing (both moving):
   predator + prey → both go home (2600 ms); same role + opposite gender → 💕 and a baby (a small wild animal of a
   parent's species, max 6 per race), then that pair has a 10 s cooldown; otherwise (and always for the Human)
   they pass through. Wild animals live in random trees/bushes placed the same way beside every track; they come
   out, wander, go back and come out again; each has a visible vision cone and only a MOVING racer it cares about
   inside the cone triggers ❓ → approach → sprint (stopping or leaving the cone makes it lose interest). Adult
   mode: longer tracks + a shared weather timeline with a cue icon before every change — night (dark screen,
   light around racers, longer cones), rain (puddles slide racers back; lightning warning → freeze; tapping in
   the freeze = same zap for anyone), wind (gusts push everyone back equally); tapping too fast at night or in
   rain trips the animal. Text in both games can't be selected or long-pressed (useNoSelect).

## Security summary

- Argon2id (m=19 MiB, t=2, p=1) password hashes; plaintext is never stored or logged.
- Random session tokens; only their SHA-256 is stored; httpOnly + Secure + SameSite=Lax cookies; 12 h expiry.
- Lockout after 5 failed logins (15 min) + per-IP throttle (20 failures / 15 min); constant-time handling of unknown users.
- CSRF: SameSite=Lax cookies + strict `Origin` check on every POST/PUT/PATCH.
- Role checks on every protected API route on the server; disabling a user or resetting a password deletes their sessions.
- Parameterized SQL only; all inputs validated (names, levels, queue items, WHERE limited to an allow-list).
- Admin account changes (username/password) require the current password; a password change signs out other sessions.
- First admin only via `ADMIN_SETUP_SECRET`, and only while no admin exists.
