// wanted.js — Costa Serena's heat. Stars are a float from 0 to 5 (the HUD
// rounds up). Crimes push the level up; the police keep it pinned while
// they can see the player; hide from every unit long enough and it drains
// away, one star roughly every 25 seconds of being unseen.

export function createWanted() {
  return {
    stars: 0,
    lastSeenAt: -99,     // last time any police unit had eyes on the player
    lastCrimeAt: -99,
    crimeCooldowns: {},  // per-crime-type throttle so one pile-up ≠ 5 stars
  };
}

// amount is in "stars". witnessed crimes count in full; an unwitnessed one
// still smells (a third) — somebody always phones it in eventually.
export function addCrime(G, type, amount, witnessed = true) {
  const W = G.wanted;
  const now = G.time;
  const cd = { crash: 2.5, pedHit: 1, carTheft: 0, gunfire: 1.5, murder: 0, mission: 0 }[type] ?? 1;
  if (now - (W.crimeCooldowns[type] || -99) < cd) return;
  W.crimeCooldowns[type] = now;
  W.stars = Math.min(5, W.stars + amount * (witnessed ? 1 : 0.34));
  W.lastCrimeAt = now;
  if (witnessed) W.lastSeenAt = now;   // they know exactly who did it
}

export function setWanted(G, stars) {
  G.wanted.stars = Math.max(G.wanted.stars, Math.min(5, stars));
  G.wanted.lastSeenAt = G.time;
}

export function clearWanted(G) {
  G.wanted.stars = 0;
  G.wanted.lastSeenAt = -99;
}

export function updateWanted(G, dt) {
  const W = G.wanted;
  if (W.stars <= 0) return;
  // Police.js refreshes lastSeenAt while any unit is close with line of
  // sight. Decay only starts after a clean break of several seconds.
  if (G.time - W.lastSeenAt > 9) {
    W.stars = Math.max(0, W.stars - dt / 25);
  }
}

export function starDisplay(G) {
  return Math.ceil(G.wanted.stars - 1e-6);
}
