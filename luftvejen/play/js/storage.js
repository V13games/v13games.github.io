// Save data lives in localStorage. Every access is guarded because storage
// can be blocked (private windows, previews); the game then just runs
// without remembering anything.
//
// One browser can hold several players. Each keeps its own record and
// coins, and its own line on the shared leaderboard.

// The game used to be called Svingkongen; the keys keep that name so
// nobody loses their players.
const KEY = 'svingkongen-save-v2';
const OLD_KEY = 'svingkongen-save-v1';

const DEFAULTS = {
  players: [], // { id, name, best, coins, runs }
  current: null,
  muted: false,
  beauty: false, // beauty-shop mode: products on the road instead of coins
  season: null,  // leaderboard season these players' stats belong to
};

export function newPlayerId() {
  return 'p' + Math.random().toString(36).slice(2, 10);
}

export function makePlayer(name) {
  return { id: newPlayerId(), name, best: 0, coins: 0, runs: 0 };
}

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function loadSave() {
  const save = structuredClone(DEFAULTS);
  const data = read(KEY);
  if (data) {
    if (Array.isArray(data.players)) {
      save.players = data.players
        .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string')
        .map((p) => ({ id: p.id, name: p.name, best: +p.best || 0, coins: +p.coins || 0, runs: +p.runs || 0 }));
    }
    save.current = save.players.some((p) => p.id === data.current) ? data.current : save.players[0]?.id ?? null;
    save.muted = !!data.muted;
    save.beauty = !!data.beauty;
    save.season = typeof data.season === 'string' ? data.season : null;
    return save;
  }
  // Carry over the single player from the previous version of the game.
  const old = read(OLD_KEY);
  if (old && typeof old.name === 'string' && old.name.trim()) {
    const p = makePlayer(old.name.trim());
    p.best = +old.best || 0;
    p.coins = +old.coins || 0;
    save.players.push(p);
    save.current = p.id;
    save.muted = !!old.muted;
  }
  return save;
}

export function writeSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Ignore: progress just won't persist in this browser.
  }
}
