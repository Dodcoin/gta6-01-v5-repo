// police.js — Costa Serena PD. At one star and up, patrol cars spawn at
// the city edge and hunt the player: they steer freely (no lane discipline
// — they are the law), ram a driven player, and park up to let an officer
// out when the player is on foot. At three stars they open fire. An
// officer (or a bumper) kept close to an on-foot player fills the BUSTED
// meter; fill it and the run ends at the station with a fine.

import * as THREE from 'three';
import { ROADS, segmentBlocked } from './city.js';
import { makeCar, driveCar } from './vehicles.js';
import { makePed } from './pedestrians.js';
import { animateWalk } from './player.js';
import { enemyShoot } from './combat.js';
import { starDisplay } from './wanted.js';

const OFFICER_DRESS = { shirt: 0x1e40af, pants: 0x1f2937, skin: 0xe0ac69, hat: 0x1e3a8a };

export function initPolice(G) {
  G.police = { spawnTimer: 0, officerCd: 0 };
  G.bustedMeter = 0;
  G.sirenLevel = 0;
}

function desiredUnits(G) {
  const s = starDisplay(G);
  if (s <= 0) return 0;
  return Math.min(2 + s, 6);
}

function spawnCopCar(G) {
  const pp = G.player.group.position;
  // Spawn on a road near a map edge, at least ~95 m from the player.
  let best = null, bestScore = -1;
  for (let tries = 0; tries < 12; tries++) {
    const edge = Math.floor(Math.random() * 4);
    const along = ROADS[Math.floor(Math.random() * ROADS.length)];
    const c = edge === 0 ? { x: along, z: -292 } : edge === 1 ? { x: along, z: 292 }
      : edge === 2 ? { x: -292, z: along } : { x: 292, z: along };
    const d = Math.hypot(c.x - pp.x, c.z - pp.z);
    const score = Math.min(d, 200) + Math.random() * 30;
    if (d > 80 && score > bestScore) { bestScore = score; best = c; }
  }
  if (!best) best = { x: -292, z: -292 };
  const heading = Math.atan2(pp.x - best.x, pp.z - best.z);
  const car = makeCar(G, { style: 'police', color: 0xf2f4f6, kind: 'police', x: best.x, z: best.z, heading });
  car.maxSpeed = 37.5;
  car.police = { officer: null, shootCd: 1.5 + Math.random() * 1.5, stuckAt: 0, side: Math.random() < 0.5 ? -1 : 1 };
  return car;
}

function removeCar(G, car) {
  G.scene.remove(car.group);
  car.dead = true;
  const i = G.cars.indexOf(car);
  if (i >= 0) G.cars.splice(i, 1);
}

function releaseOfficer(G, ped) {
  ped.state = 'gone';
  ped.group.visible = false;
}

export function updatePolice(G, dt) {
  const stars = starDisplay(G);
  const P = G.player;
  const pp = P.group.position;
  const cops = G.cars.filter((c) => c.kind === 'police' && !c.dead);
  let nearest = Infinity;

  // Spawning / clean-up.
  G.police.spawnTimer -= dt;
  if (stars > 0 && cops.length < desiredUnits(G) && G.police.spawnTimer <= 0) {
    spawnCopCar(G);
    G.police.spawnTimer = 2.2;
  }
  for (const car of cops) {
    const d = car.group.position.distanceTo(pp);
    nearest = Math.min(nearest, d);
    if ((stars === 0 && d > 130) || d > 420) {
      if (car.police.officer) releaseOfficer(G, car.police.officer);
      removeCar(G, car);
    }
  }

  // Eyes on the player?
  let seen = false;
  for (const car of G.cars) {
    if (car.kind !== 'police') continue;
    const cp = car.group.position;
    if (cp.distanceTo(pp) < 58 && !segmentBlocked(cp, pp, G.city.colliders)) { seen = true; break; }
  }
  if (!seen) for (const ped of G.peds) {
    if (ped.role === 'officer' && ped.state === 'officer' && ped.group.position.distanceTo(pp) < 40) { seen = true; break; }
  }
  if (seen) G.wanted.lastSeenAt = G.time;
  G.sirenLevel = stars > 0 ? Math.max(0, 1 - nearest / 75) : 0;

  // Drive the pursuit.
  for (const car of G.cars) {
    if (car.kind !== 'police' || car.dead || car.driver === 'player') continue;
    const cp = car.group.position;
    // Flash the light bar.
    if (car.lightMats) {
      const ph = Math.sin(G.time * 9 + car.flashPhase) > 0;
      car.lightMats.red.emissiveIntensity = ph ? 3.2 : 0.1;
      car.lightMats.blue.emissiveIntensity = ph ? 0.1 : 3.2;
    }
    const dist = cp.distanceTo(pp);
    const lead = P.inCar ? Math.min(1, dist / 40) : 0;
    const tx = pp.x + (P.inCar ? Math.sin(P.inCar.heading) * P.inCar.speed * lead * 0.5 : 0);
    const tz = pp.z + (P.inCar ? Math.cos(P.inCar.heading) * P.inCar.speed * lead * 0.5 : 0);
    const want = Math.atan2(tx - cp.x, tz - cp.z);
    let dh = want - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, dh * 1.7));
    car.heading += steer * dt * 1.5 * Math.min(1, Math.abs(car.speed) / 5 + 0.3);

    let target = car.maxSpeed;
    if (Math.abs(dh) > 0.5) target = 13;
    if (!P.inCar && dist < 9) target = 0;                    // park up: officer's job now
    else if (!P.inCar && dist < 20) target = Math.min(target, 8);
    if (P.inCar && dist < 5.5) target = Math.min(target, Math.abs(P.inCar.speed) + 2);
    const accel = target > car.speed ? 15 : 30;
    car.speed += Math.max(-accel * dt, Math.min(accel * dt, target - car.speed));
    driveCar(G, car, dt, steer);

    // Officer drop-off.
    const pol = car.police;
    if (!P.inCar && dist < 15 && Math.abs(car.speed) < 1.2 && !pol.officer && stars >= 1) {
      const off = makePed(G, { x: cp.x + 1.6, z: cp.z, role: 'officer', dress: OFFICER_DRESS, hp: 100 });
      off.state = 'officer';
      pol.officer = off;
    }
    if (pol.officer && (P.inCar || pol.officer.state === 'down' || pol.officer.state === 'gone')) {
      if (pol.officer.state === 'officer') releaseOfficer(G, pol.officer);
      pol.officer = null;
    }
    // Car gunner at 3+ stars.
    if (stars >= 3 && dist < 46 && G.state === 'playing') {
      pol.shootCd -= dt;
      if (pol.shootCd <= 0 && !segmentBlocked(cp, pp, G.city.colliders)) {
        enemyShoot(G, cp, 0.52);
        pol.shootCd = 1.1 + Math.random() * 0.9;
      }
    }
  }

  // Officers on foot.
  for (const ped of G.peds) {
    if (ped.role !== 'officer' || ped.state !== 'officer') continue;
    const p = ped.group.position;
    const d = p.distanceTo(pp);
    if (P.inCar || d > 60) { releaseOfficer(G, ped); continue; }
    const want = Math.atan2(pp.x - p.x, pp.z - p.z);
    let dh = want - ped.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    ped.heading += Math.max(-7 * dt, Math.min(7 * dt, dh));
    if (d > 1.6) {
      p.x += Math.sin(ped.heading) * 5.4 * dt;
      p.z += Math.cos(ped.heading) * 5.4 * dt;
      ped.walkPhase += dt * 11;
    }
    ped.group.rotation.y = ped.heading;
    animateWalk(ped.parts, ped.walkPhase, 1.1);
    if (stars >= 3) {
      ped.shootCd -= dt;
      if (ped.shootCd <= 0 && d < 38 && d > 4) {
        enemyShoot(G, p, 0.5);
        ped.shootCd = 1.3 + Math.random() * 0.8;
      }
    }
  }

  // The BUSTED meter.
  if (G.state === 'playing') {
    let pressure = 0;
    if (!P.inCar) {
      for (const ped of G.peds) {
        if (ped.role === 'officer' && ped.state === 'officer' && ped.group.position.distanceTo(pp) < 4.2) pressure = Math.max(pressure, 0.5);
      }
      for (const car of G.cars) {
        if (car.kind === 'police' && car.group.position.distanceTo(pp) < 5.6) pressure = Math.max(pressure, 0.3);
      }
    } else if (Math.abs(P.inCar.speed) < 1) {
      for (const car of G.cars) {
        if (car.kind === 'police' && car.group.position.distanceTo(P.inCar.group.position) < 8) pressure = Math.max(pressure, 0.3);
      }
    }
    G.bustedMeter = Math.max(0, Math.min(1, G.bustedMeter + (pressure > 0 ? pressure * dt : -dt * 0.45)));
    if (G.bustedMeter >= 1) G.onBusted();
  }
}
