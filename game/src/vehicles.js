// vehicles.js — Costa Serena's cars: a box-built factory (sedan, sports,
// van, police), the parked cars that line the streets, arcade driving
// physics for whichever car the player is sitting in, and car collisions.
//
// Every car is a plain object: { group, kind, heading, speed, wheels, ... }.
// The group faces +Z locally; heading is a Y rotation whose forward vector
// is (sin h, 0, cos h) — the same convention the whole game uses.

import * as THREE from 'three';
import { resolveCircle, ROADS, BLOCK_CENTERS, mulberry32 } from './city.js';
import { hitPed } from './pedestrians.js';
import { sfxCrash } from './audio.js';

export const CAR_COLORS = [0xd64541, 0x2e86de, 0xf5f6fa, 0x222f3e, 0xffa502, 0x2ed573, 0xeccc68, 0xa55eea, 0xff6b81, 0x7bed9f, 0x54a0ff, 0xc8d6e5];

const bodyGeo = new THREE.BoxGeometry(1.8, 0.62, 4.3);
const cabinGeo = new THREE.BoxGeometry(1.6, 0.55, 2.1);
const vanBoxGeo = new THREE.BoxGeometry(1.95, 1.5, 4.6);
const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
wheelGeo.rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.95 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x1c2f42, roughness: 0.25, metalness: 0.4 });
const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0xffedb5, emissiveIntensity: 1.8 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x7a1010, emissive: 0xd21f1f, emissiveIntensity: 0.9 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.8 });

function buildMesh(style, colorHex) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.45, metalness: 0.35 });
  const wheels = [];
  const wheelPos = [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]];
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(wheelPos[i][0], 0.36, wheelPos[i][1]);
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    pivot.add(w);
    group.add(pivot);
    wheels.push({ pivot, mesh: w, front: i < 2 });
  }
  const out = { group, wheels, lightMats: null, paint };

  if (style === 'van') {
    const box = new THREE.Mesh(vanBoxGeo, paint); box.position.y = 1.05; group.add(box);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 0.8), paint); nose.position.set(0, 0.62, 2.5); group.add(nose);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.1), glassMat); shield.position.set(0, 1.05, 2.32); group.add(shield);
  } else {
    const body = new THREE.Mesh(bodyGeo, paint); body.position.y = 0.62; group.add(body);
    const cabin = new THREE.Mesh(cabinGeo, style === 'police' ? new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.4 }) : glassMat);
    cabin.position.set(0, 1.16, style === 'sport' ? -0.25 : -0.1);
    group.add(cabin);
    if (style === 'sport') {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.09, 0.5), trimMat);
      wing.position.set(0, 1.12, -2.05); group.add(wing);
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.22, 4.34), trimMat);
      skirt.position.y = 0.3; group.add(skirt);
    }
    if (style === 'police') {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.3, 4.32), new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.5 }));
      stripe.position.y = 0.62; group.add(stripe);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.5), trimMat);
      bar.position.set(0, 1.52, -0.1); group.add(bar);
      const red = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2222, emissiveIntensity: 0.4 });
      const blue = new THREE.MeshStandardMaterial({ color: 0x000055, emissive: 0x2266ff, emissiveIntensity: 0.4 });
      const rl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.4), red); rl.position.set(-0.32, 1.66, -0.1);
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.4), blue); bl.position.set(0.32, 1.66, -0.1);
      group.add(rl, bl);
      out.lightMats = { red, blue };
    }
  }
  // Headlights and tail lights at the +Z (front) and -Z ends.
  for (const sx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), lightMat);
    h.position.set(sx, 0.68, style === 'van' ? 2.92 : 2.16); group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.08), tailMat);
    t.position.set(sx, 0.72, style === 'van' ? -2.32 : -2.16); group.add(t);
  }
  return out;
}

export function makeCar(G, { style = 'sedan', color = 0xcccccc, kind = 'parked', x = 0, z = 0, heading = 0 } = {}) {
  const built = buildMesh(style, color);
  built.group.position.set(x, 0, z);
  built.group.rotation.y = heading;
  G.scene.add(built.group);
  const car = {
    group: built.group, wheels: built.wheels, lightMats: built.lightMats, paint: built.paint,
    style, kind, heading, speed: 0, radius: 1.95,
    driver: null, ai: null, police: null,
    maxSpeed: style === 'sport' ? 41 : style === 'van' ? 27 : 33,
    accel: style === 'sport' ? 17 : 13.5,
    targetCar: false, dead: false, crashCd: 0, flashPhase: Math.random() * 6,
  };
  G.cars.push(car);
  return car;
}

// Parked cars hug the kerbs: on each street, beside each block, a chance of
// one car nose-in-line with the traffic direction of its side.
export function spawnParkedCars(G) {
  const rng = mulberry32(G.seed * 31 + 7);
  const taken = [];
  const spotFree = (x, z) => taken.every(([tx, tz]) => Math.hypot(tx - x, tz - z) > 6);
  const addAt = (x, z, heading) => {
    if (!spotFree(x, z)) return;
    taken.push([x, z]);
    const style = rng() < 0.16 ? 'sport' : rng() < 0.14 ? 'van' : 'sedan';
    makeCar(G, {
      style, kind: 'parked', heading,
      color: CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)],
      x, z,
    });
  };
  for (const rx of ROADS) for (const bz of BLOCK_CENTERS) {
    if (rng() < 0.62) addAt(rx - 6.6, bz + (rng() - 0.5) * 18, Math.PI);       // southbound side
    if (rng() < 0.62) addAt(rx + 6.6, bz + (rng() - 0.5) * 18, 0);             // northbound side
  }
  for (const rz of ROADS) for (const bx of BLOCK_CENTERS) {
    if (rng() < 0.4) addAt(bx + (rng() - 0.5) * 18, rz - 6.6, -Math.PI / 2);
    if (rng() < 0.4) addAt(bx + (rng() - 0.5) * 18, rz + 6.6, Math.PI / 2);
  }
}

// ------------------------------------------------------------- driving
export function forwardOf(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

export function updatePlayerCar(G, dt, input) {
  const car = G.player.inCar;
  if (!car) return;
  const fwdKey = input.down.has('KeyW') || input.down.has('ArrowUp');
  const backKey = input.down.has('KeyS') || input.down.has('ArrowDown');
  const leftKey = input.down.has('KeyA') || input.down.has('ArrowLeft');
  const rightKey = input.down.has('KeyD') || input.down.has('ArrowRight');
  const brake = input.down.has('Space');

  if (fwdKey) car.speed += car.accel * dt;
  else if (backKey) car.speed -= (car.speed > 0.5 ? 26 : car.accel * 0.7) * dt;
  else car.speed -= car.speed * 0.55 * dt;                       // engine braking / drag
  if (brake) car.speed -= car.speed * 3.2 * dt;
  car.speed = Math.max(-11, Math.min(car.maxSpeed, car.speed));
  if (Math.abs(car.speed) < 0.04 && !fwdKey && !backKey) car.speed = 0;

  const steer = (leftKey ? 1 : 0) - (rightKey ? 1 : 0);
  const grip = Math.min(1, Math.abs(car.speed) / 6);
  car.heading -= steer * dt * 1.55 * grip * (car.speed < 0 ? -1 : 1) * (brake ? 1.5 : 1);
  driveCar(G, car, dt, steer);
  G.player.group.position.copy(car.group.position);
  G.player.heading = car.heading;
}

export function driveCar(G, car, dt, steerVisual = 0) {
  const f = forwardOf(car.heading);
  car.group.position.x += f.x * car.speed * dt;
  car.group.position.z += f.z * car.speed * dt;
  const before = { x: car.group.position.x, z: car.group.position.z };
  resolveCircle(car.group.position, car.radius, G.city.colliders);
  // If a building shoved us sideways/back, bleed the speed that hit it.
  const pushed = Math.hypot(car.group.position.x - before.x, car.group.position.z - before.z);
  if (pushed > 0.02 && Math.abs(car.speed) > 4) {
    if (car.crashCd <= 0) { sfxCrash(); car.crashCd = 0.5; if (car.driver === 'player') G.onCrash(6); }
    car.speed *= 0.35;
  }
  car.crashCd = Math.max(0, car.crashCd - dt);
  car.group.rotation.y = car.heading;
  for (const w of car.wheels) {
    w.mesh.rotation.x += (car.speed * dt) / 0.36;
    if (w.front) w.pivot.rotation.y = steerVisual * 0.42;
  }
  // Running people over is checked here because the car owns the motion.
  if (Math.abs(car.speed) > 3) {
    for (const ped of G.peds) {
      if (ped.state === 'down' || ped.state === 'gone') continue;
      const p = ped.group.position;
      if (Math.abs(p.x - car.group.position.x) < 2 && Math.abs(p.z - car.group.position.z) < 2.4) {
        if (p.distanceTo(car.group.position) < 2.1) hitPed(G, ped, car);
      }
    }
  }
}

// Car-to-car: circles push apart; a fast closing speed is a crash (noise,
// a wanted bump if the player did it, a little health if the player is in
// either car).
export function collideCars(G, dt) {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.dead) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.dead) continue;
      const dx = b.group.position.x - a.group.position.x;
      const dz = b.group.position.z - a.group.position.z;
      const rr = a.radius + b.radius - 0.5;
      const d2 = dx * dx + dz * dz;
      if (d2 > rr * rr || d2 < 1e-5) continue;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, overlap = rr - d;
      const aStatic = a.kind === 'parked' && !a.driver, bStatic = b.kind === 'parked' && !b.driver;
      if (!aStatic) { a.group.position.x -= nx * overlap * 0.5; a.group.position.z -= nz * overlap * 0.5; }
      if (!bStatic) { b.group.position.x += nx * overlap * 0.5; b.group.position.z += nz * overlap * 0.5; }
      const rel = Math.abs(a.speed - b.speed);
      const playerInvolved = a.driver === 'player' || b.driver === 'player';
      if (rel > 5 && (a.crashCd <= 0 && b.crashCd <= 0)) {
        sfxCrash();
        a.crashCd = b.crashCd = 0.6;
        if (playerInvolved) G.onCrash(9);
        else if (Math.random() < 0.5) G.onCrash(0); // distant crash: sound only, no crime
        a.speed *= 0.45; b.speed *= 0.45;
      } else {
        a.speed *= 0.92; b.speed *= 0.92;
      }
    }
  }
}

export function nearestCar(G, pos, maxDist) {
  let best = null, bestD = maxDist;
  for (const car of G.cars) {
    if (car.dead) continue;
    const d = car.group.position.distanceTo(pos);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}
