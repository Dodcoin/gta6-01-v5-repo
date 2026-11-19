// pedestrians.js — the people of Costa Serena. Low-poly figures stroll the
// sidewalks along the street grid, choosing a new direction at each corner.
// They run from gunfire and from cars that mount the kerb, and if a car
// actually connects they tip over, lie still, fade out, and are quietly
// replaced across town so the streets never empty.
//
// Guards (mission muscle) and police officers reuse the same body/factory
// but carry role flags; their behaviour lives in missions.js / police.js.

import * as THREE from 'three';
import { makeHumanoid, animateWalk } from './player.js';
import { resolveCircle, ROADS, mulberry32 } from './city.js';
import { sfxThud } from './audio.js';

const SHIRTS = [0xf6e58d, 0xff6b81, 0x7bed9f, 0x70a1ff, 0xeccc68, 0xff9f43, 0x48dbfb, 0x1dd1a1, 0xf368e0, 0x5f27cd];
const PANTS = [0x2f3542, 0x57606f, 0x747d8c, 0x3b3b98, 0x82589f];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const SIDEWALK = 10.6;   // distance from road centre to the walking line

function dressRandom(rng) {
  return {
    shirt: SHIRTS[Math.floor(rng() * SHIRTS.length)],
    pants: PANTS[Math.floor(rng() * PANTS.length)],
    skin: SKINS[Math.floor(rng() * SKINS.length)],
  };
}

export function makePed(G, { x, z, role = 'civilian', dress = null, hp = 100 } = {}) {
  const rng = Math.random;
  const { group, parts } = makeHumanoid(dress || dressRandom(rng));
  group.position.set(x, 0, z);
  G.scene.add(group);
  const ped = {
    group, parts, role, hp,
    heading: rng() * Math.PI * 2,
    walkPhase: rng() * 6,
    state: 'walk',                 // walk | flee | guard | down | gone
    target: null,                  // current corner waypoint {x, z}
    threat: null, threatUntil: 0,
    downAt: 0, shootCd: 1 + rng() * 1.5,
    speedMul: 0.8 + rng() * 0.45,
    ci: 0, cj: 0,                  // current intersection indices into ROADS
  };
  snapIntersection(ped);
  ped.target = pickCornerTarget(ped);
  G.peds.push(ped);
  return ped;
}

function snapIntersection(ped) {
  const p = ped.group.position;
  let bi = 0, bj = 0, bd = Infinity;
  ROADS.forEach((r, i) => { const d = Math.abs(r - p.x); if (d < bd) { bd = d; bi = i; } });
  bd = Infinity;
  ROADS.forEach((r, j) => { const d = Math.abs(r - p.z); if (d < bd) { bd = d; bj = j; } });
  ped.ci = bi; ped.cj = bj;
}

// Peds walk corner to corner: pick a neighbouring intersection, then aim
// at the corner of it that faces the ped. Because the corner offset uses
// the approach side on both axes, consecutive targets line up along the
// sidewalk of one street, and a turn composes onto the crossing street's
// sidewalk the same way.
function pickCornerTarget(ped) {
  const p = ped.group.position;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .filter(([di, dj]) => ped.ci + di >= 0 && ped.ci + di < ROADS.length && ped.cj + dj >= 0 && ped.cj + dj < ROADS.length);
  const [di, dj] = dirs[Math.floor(Math.random() * dirs.length)];
  ped.ci += di; ped.cj += dj;
  const ix = ROADS[ped.ci], iz = ROADS[ped.cj];
  return {
    x: ix + (p.x < ix ? -SIDEWALK : SIDEWALK),
    z: iz + (p.z < iz ? -SIDEWALK : SIDEWALK),
  };
}

export function spawnPedestrians(G, count = 26) {
  const rng = mulberry32(G.seed * 17 + 3);
  for (let i = 0; i < count; i++) {
    const vertical = rng() < 0.5;
    const road = ROADS[Math.floor(rng() * ROADS.length)];
    const along = -280 + rng() * 560;
    const side = rng() < 0.5 ? -SIDEWALK : SIDEWALK;
    const x = vertical ? road + side : along;
    const z = vertical ? along : road + side;
    makePed(G, { x, z, dress: dressRandom(rng) });
  }
}

function steerToward(ped, tx, tz, dt, turnRate = 6) {
  const p = ped.group.position;
  const target = Math.atan2(tx - p.x, tz - p.z);
  let d = target - ped.heading;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  ped.heading += Math.max(-turnRate * dt, Math.min(turnRate * dt, d));
  return Math.hypot(tx - p.x, tz - p.z);
}

export function updatePedestrians(G, dt) {
  const chaosRecent = G.time - G.chaos.time < 2.5;
  for (const ped of G.peds) {
    if (ped.state === 'gone' || ped.role !== 'civilian') continue;
    const p = ped.group.position;

    if (ped.state === 'down') {
      // Tip over fast, lie a while, fade, then respawn across town.
      ped.group.rotation.x = Math.max(-Math.PI / 2, ped.group.rotation.x - dt * 7);
      const age = G.time - ped.downAt;
      if (age > 3) {
        const fade = Math.min(1, (age - 3) / 2);
        ped.group.traverse((o) => { if (o.isMesh) { o.material.transparent = true; o.material.opacity = 1 - fade; } });
      }
      if (age > 5.2) respawnPed(G, ped);
      continue;
    }

    // Panic: gunfire nearby, or a car bearing down off the road line.
    if (chaosRecent && p.distanceTo(G.chaos.pos) < 30) {
      ped.state = 'flee'; ped.threat = G.chaos.pos; ped.threatUntil = G.time + 3.5;
    }
    if (ped.state === 'flee') {
      if (G.time > ped.threatUntil) { ped.state = 'walk'; ped.target = pickCornerTarget(ped); }
      else {
        const away = Math.atan2(p.x - ped.threat.x, p.z - ped.threat.z);
        steerToward(ped, p.x + Math.sin(away) * 10, p.z + Math.cos(away) * 10, dt, 8);
        movePed(G, ped, dt, 4.6);
        continue;
      }
    }

    if (!ped.target || steerToward(ped, ped.target.x, ped.target.z, dt) < 1.2) {
      ped.target = pickCornerTarget(ped);
    }
    movePed(G, ped, dt, 1.5 * ped.speedMul);
  }
}

function movePed(G, ped, dt, speed) {
  const p = ped.group.position;
  p.x += Math.sin(ped.heading) * speed * dt;
  p.z += Math.cos(ped.heading) * speed * dt;
  resolveCircle(p, 0.4, G.city.colliders);
  ped.group.rotation.y = ped.heading;
  ped.walkPhase += dt * speed * 2.1;
  animateWalk(ped.parts, ped.walkPhase, ped.state === 'flee' ? 1.25 : 0.8);
}

function respawnPed(G, ped) {
  const rng = Math.random;
  const road = ROADS[Math.floor(rng() * ROADS.length)];
  const along = -280 + rng() * 560;
  const side = rng() < 0.5 ? -SIDEWALK : SIDEWALK;
  if (rng() < 0.5) ped.group.position.set(road + side, 0, along);
  else ped.group.position.set(along, 0, road + side);
  ped.group.rotation.set(0, ped.heading, 0);
  ped.group.traverse((o) => { if (o.isMesh) { o.material.transparent = false; o.material.opacity = 1; } });
  ped.state = 'walk'; ped.hp = 100;
  snapIntersection(ped);
  ped.target = pickCornerTarget(ped);
}

// A car connects: the ped goes down. If the player was driving, that is a
// crime the wanted system hears about (witnessed unless nobody is near).
export function hitPed(G, ped, car) {
  if (ped.state === 'down' || ped.state === 'gone') return;
  ped.state = 'down';
  ped.downAt = G.time;
  ped.hp = 0;
  sfxThud();
  const p = ped.group.position;
  G.chaos.time = G.time; G.chaos.pos.set(p.x, 0, p.z);
  if (car && car.driver === 'player') G.onPedHit(ped);
  if (ped.role === 'guard' || ped.role === 'officer') G.onGuardDown(ped);
}

// Gun damage from combat.js. Returns true if this shot killed.
export function damagePed(G, ped, amount) {
  if (ped.state === 'down' || ped.state === 'gone') return false;
  ped.hp -= amount;
  if (ped.hp <= 0) {
    ped.state = 'down';
    ped.downAt = G.time;
    if (ped.role === 'guard' || ped.role === 'officer') G.onGuardDown(ped);
    return true;
  }
  // Survivors run from the shooter.
  ped.state = 'flee';
  ped.threat = G.player.group.position;
  ped.threatUntil = G.time + 4;
  return false;
}
