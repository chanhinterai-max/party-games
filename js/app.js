import { games } from './games/registry.js';

const app = document.getElementById('app');

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderHome() {
  window.scrollTo(0, 0);
  const tiles = games
    .map((g) => {
      if (g.comingSoon) {
        return `
          <div class="tile locked" aria-disabled="true" role="img" aria-label="Coming soon">
            <div class="emoji">${g.emoji}</div>
            <div>
              <div class="name">${escapeHtml(g.name)}</div>
              <div class="desc">${escapeHtml(g.description)}</div>
            </div>
            <span class="soon">Locked</span>
          </div>`;
      }
      return `
        <button class="tile ${g.featured ? 'featured' : ''}" data-game="${g.id}">
          <div class="emoji">${g.emoji}</div>
          <div>
            <div class="name">${escapeHtml(g.name)}</div>
            <div class="desc">${escapeHtml(g.description)} · ${g.minPlayers}–${g.maxPlayers} players</div>
          </div>
          <span class="play">▶ Play</span>
        </button>`;
    })
    .join('');

  app.innerHTML = `
    <header class="hero">
      <h1>Party Games</h1>
      <p class="tagline">Small sips, big secrets. Pass the phone and bring the vibe.</p>
      <span class="pill">👥 2–16 players · one phone</span>
    </header>
    <section class="grid" aria-label="Games">${tiles}</section>
    <aside class="note">
      <strong>House rules:</strong> drink responsibly — a sip is plenty, and water always counts.
      Anyone can skip any card, no questions asked. <strong>Consent first</strong>: ask before any touch, and a “no” is always respected.
    </aside>
    <p class="footer">Legal drinking age only · Never drink and drive 🚕</p>
  `;

  app.querySelectorAll('[data-game]').forEach((el) => {
    el.addEventListener('click', () => openGame(el.dataset.game));
  });
}

async function openGame(id) {
  const game = games.find((g) => g.id === id && !g.comingSoon);
  if (!game) return renderHome();
  if (location.hash !== `#/${id}`) history.pushState(null, '', `#/${id}`);
  try {
    const mod = await game.load();
    window.scrollTo(0, 0);
    mod.mount(app, { goHome });
  } catch (err) {
    console.error(err);
    app.innerHTML = `<p class="error">Couldn't load the game. Please refresh.</p>`;
  }
}

function goHome() {
  if (location.hash) history.pushState(null, '', location.pathname + location.search);
  renderHome();
}

function route() {
  const m = location.hash.match(/^#\/([\w-]+)/);
  if (m) openGame(m[1]);
  else renderHome();
}

window.addEventListener('popstate', route);
route();
