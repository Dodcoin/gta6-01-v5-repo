// savegame.js — Costa Serena progress in localStorage.
//
// We persist the things a player would be annoyed to lose: cash, how far the
// story chain has advanced, and where the player was standing. Everything
// else (wanted level, health, traffic) is session flavour and resets.

const KEY = 'costa-serena-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: Math.max(0, Math.floor(data.cash || 0)),
      storyIndex: Math.min(4, Math.max(0, Math.floor(data.storyIndex || 0))),
      pos: Array.isArray(data.pos) && data.pos.length === 3 ? data.pos : null,
    };
  } catch {
    return null; // private mode / corrupt JSON: just start fresh
  }
}

export function writeSave(G) {
  try {
    const p = G.player.group.position;
    localStorage.setItem(KEY, JSON.stringify({
      cash: G.cash,
      storyIndex: G.storyIndex,
      pos: [Math.round(p.x * 10) / 10, 0, Math.round(p.z * 10) / 10],
    }));
  } catch { /* storage unavailable: playing without saving is fine */ }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
