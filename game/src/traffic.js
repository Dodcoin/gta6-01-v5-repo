// traffic.js — the cars that drive themselves. Each traffic car follows
// the street grid intersection to intersection, offset into the correct
// lane for its heading (the offset comes from the heading's right vector,
// so lanes stay on the right side of the road through every turn). Cars
// brake for anything in front of them, crawl around corners, and either
// stop dead or bolt when the player starts shooting nearby.

import { ROADS, mulberry32 } from './city.js';
import { makeCar, driveCar, CAR_COLORS } from './vehicles.js';

const LANE = 3.4;

function rightOf(heading) {
  return { x: -Math.cos(heading), z: Math.sin(heading) };
}

// Waypoint for a car travelling with `heading` toward intersection index
// (ci, cj): the point on its lane, one car-length past the junction centre.
function lanePoint(car, ci, cj) {
  const r = rightOf(car.heading);
  return {
    x: ROADS[ci] + r.x * LANE + Math.sin(car.heading) * 6,
    z: ROADS[cj] + r.z * LANE + Math.cos(car.heading) * 6,
  };
}

function pickNext(car) {
  // Current intersection indices from the car's own route state.
  const { ci, cj } = car.ai;
  const options = [];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [di, dj] of dirs) {
    const ni = ci + di, nj = cj + dj;
    if (ni < 0 || nj < 0 || ni >= ROADS.length || nj >= ROADS.length) continue;
    const heading = Math.atan2(di, dj);
    // No U-turns unless the street ends (grid edges handled by bounds).
    let dh = Math.abs(heading - car.heading) % (Math.PI * 2);
    if (dh > Math.PI) dh = Math.PI * 2 - dh;
    if (dh > Math.PI * 0.99 && Math.random() < 0.9) continue;
    options.push({ ni, nj, heading });
  }
  const pick = options[Math.floor(Math.random() * options.length)] || { ni: ci, nj: cj, heading: car.heading };
  car.ai.ci = pick.ni; car.ai.cj = pick.nj;
  car.ai.targetHeading = pick.heading;
  car.ai.target = lanePoint({ heading: pick.heading }, pick.ni, pick.nj);
}

export function spawnTraffic(G, count = 11) {
  const rng = mulberry32(G.seed * 43 + 11);
  for (let i = 0; i < count; i++) {
    const ci = Math.floor(rng() * ROADS.length);
    const cj = Math.floor(rng() * ROADS.length);
    const heading = [0, Math.PI / 2, Math.PI, -Math.PI / 2][Math.floor(rng() * 4)];
    const r = rightOf(heading);
    const along = (rng() - 0.5) * 60;
    const x = ROADS[ci] + r.x * LANE + Math.sin(heading) * along;
    const z = ROADS[cj] + r.z * LANE + Math.cos(heading) * along;
    const style = rng() < 0.12 ? 'sport' : rng() < 0.16 ? 'van' : 'sedan';
    const car = makeCar(G, {
      style, kind: 'traffic', heading,
      color: CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)],
      x, z,
    });
    car.speed = 6 + rng() * 4;
    car.ai = { ci, cj, target: null, targetHeading: heading, panicUntil: 0, cruise: 8.5 + rng() * 4.5 };
    pickNext(car);
  }
}

// Something ahead? Scan cars, the player and peds against a point a few
// metres in front of the bumper.
function blockedAhead(G, car, lookDist) {
  const fx = car.group.position.x + Math.sin(car.heading) * lookDist;
  const fz = car.group.position.z + Math.cos(car.heading) * lookDist;
  for (const other of G.cars) {
    if (other === car || other.dead) continue;
    const p = other.group.position;
    if (Math.abs(p.x - fx) < 2.4 && Math.abs(p.z - fz) < 2.4) return true;
  }
  const pp = G.player.group.position;
  if (!G.player.inCar && Math.abs(pp.x - fx) < 1.6 && Math.abs(pp.z - fz) < 1.6) return true;
  for (const ped of G.peds) {
    if (ped.state === 'down' || ped.state === 'gone') continue;
    const p = ped.group.position;
    if (Math.abs(p.x - fx) < 1.4 && Math.abs(p.z - fz) < 1.4) return true;
  }
  return false;
}

export function updateTraffic(G, dt) {
  const chaosRecent = G.time - G.chaos.time < 2;
  for (const car of G.cars) {
    if (car.kind !== 'traffic' || car.driver === 'player' || car.dead) continue;
    const ai = car.ai;
    if (!ai) continue;
    const p = car.group.position;

    if (chaosRecent && p.distanceTo(G.chaos.pos) < 26) ai.panicUntil = G.time + 2.5 + Math.random() * 2;
    const panicking = G.time < ai.panicUntil;

    // Reached the junction waypoint? Choose the next street.
    if (Math.hypot(ai.target.x - p.x, ai.target.z - p.z) < 7) pickNext(car);

    // Steer toward the waypoint; slow down while the nose is off-line.
    const want = Math.atan2(ai.target.x - p.x, ai.target.z - p.z);
    let dh = want - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, dh * 1.6));
    car.heading += steer * dt * 1.35 * Math.min(1, Math.abs(car.speed) / 5 + 0.25);

    let targetSpeed = panicking ? ai.cruise * 1.7 : ai.cruise;
    if (Math.abs(dh) > 0.35) targetSpeed = Math.min(targetSpeed, 4.5);
    if (blockedAhead(G, car, 6.5)) targetSpeed = 0;
    else if (blockedAhead(G, car, 11)) targetSpeed = Math.min(targetSpeed, 3.5);

    const accel = targetSpeed > car.speed ? 7 : 22;
    car.speed += Math.max(-accel * dt, Math.min(accel * dt, targetSpeed - car.speed));
    driveCar(G, car, dt, steer);
  }
}
