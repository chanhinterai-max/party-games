import Link from 'next/link';
import { gamesWithStatus, GAME_SLOTS } from '@/lib/games';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let games;
  try {
    games = (await gamesWithStatus()).filter((g) => g.enabled);
  } catch (e) {
    console.error('home: games status unavailable', e?.message);
    games = GAME_SLOTS;
  }
  return (
    <>
      <header className="hero">
        <h1>Party Animal</h1>
        <p className="tagline">Small sips, big secrets. Pass the phone and bring the vibe.</p>
        <span className="pill">👥 2–16 players · one phone</span>
      </header>
      <section className="grid" aria-label="Games">
        {games.length === 0 && <p className="note">No games are available right now. Check back soon!</p>}
        {games.map((g) =>
          g.comingSoon ? (
            <div key={g.id} className="tile locked" aria-disabled="true">
              <div className="emoji">{g.emoji}</div>
              <div>
                <div className="name">{g.name}</div>
                <div className="desc">{g.description}</div>
              </div>
              <span className="soon">Locked</span>
            </div>
          ) : (
            <Link key={g.id} href={g.href} className={`tile ${g.featured ? 'featured' : ''}`} data-game={g.id}>
              <div className="emoji">{g.emoji}</div>
              <div>
                <div className="name">{g.name}</div>
                <div className="desc">{g.description} · {g.minPlayers}–{g.maxPlayers} players</div>
              </div>
              <span className="play">▶ Play</span>
            </Link>
          )
        )}
      </section>
      <aside className="note">
        <strong>House rules:</strong> drink responsibly. A sip is plenty and water always counts. Keep it fun, keep it classy.
      </aside>
      <p className="footer">Legal drinking age only · Never drink and drive 🚕</p>
    </>
  );
}
