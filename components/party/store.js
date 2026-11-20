// SHARED Party Animal setup storage: the last players on this phone are remembered for every game.
export const STORE_PLAYERS = 'partygames.tod.players.v3'; // (name kept so existing phones keep their players)
export const MIN = 2, MAX = 16;
export const blank = () => ({ name: '', gender: '' });
export const load = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
export const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
export function loadPlayers() {
  let p = load(STORE_PLAYERS, null);
  if (!Array.isArray(p)) {
    const old = load('partygames.tod.players', []);
    p = Array.isArray(old) ? old.filter((x) => typeof x === 'string').map((name) => ({ name, gender: '' })) : [];
  }
  p = p.filter((x) => x && typeof x.name === 'string').map((x) => ({ name: x.name, gender: x.gender === 'male' || x.gender === 'female' ? x.gender : '' }));
  return p.length >= MIN ? p.slice(0, MAX) : null;
}
// Same checks as the server (validatePlayers): returns { filled } or { error, missing }.
export function checkPlayers(players) {
  const filled = players.map((p) => ({ ...p, name: p.name.trim() })).filter((p) => p.name);
  if (filled.length < MIN) return { error: `Add at least ${MIN} player names.` };
  const seen = new Set();
  for (const p of filled) {
    if (seen.has(p.name.toLowerCase())) return { error: `"${p.name}" is entered twice. Make each name unique.` };
    seen.add(p.name.toLowerCase());
  }
  const missing = players.map((p, i) => (p.name.trim() && !p.gender ? i : -1)).filter((i) => i >= 0);
  if (missing.length) return { error: 'Pick Male or Female for every player.', missing };
  return { filled };
}
