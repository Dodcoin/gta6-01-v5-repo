// player.js — the on-foot player: a low-poly humanoid built from boxes,
// WASD movement relative to the camera, a walk cycle that swings the limbs,
// and the health/damage plumbing the rest of the game hits.
//
// makeHumanoid is shared: pedestrians, guards and police officers are all
// dressed-up calls to the same factory, with named parts so combat can
// tell a head from a torso and the animators can swing arms and legs.

import * as THREE from 'three';
import { resolveCircle } from './city.js';
import { sfxThud } from './audio.js';

export function makeHumanoid({ shirt = 0xe74c3c, pants = 0x2c3e50, skin = 0xe8b08a, hat = null } = {}) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });

  const mk = (geo, mat, x, y, z, part) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.userData.part = part;
    group.add(m);
    return m;
  };
  const torso = mk(new THREE.BoxGeometry(0.52, 0.62, 0.3), shirtMat, 0, 1.08, 0, 'body');
  const head = mk(new THREE.BoxGeometry(0.3, 0.32, 0.3), skinMat, 0, 1.58, 0, 'head');
  if (hat !== null) mk(new THREE.BoxGeometry(0.36, 0.1, 0.36), new THREE.MeshStandardMaterial({ color: hat, roughness: 0.9 }), 0, 1.78, 0, 'head');
  // Arms and legs pivot at the shoulder/hip so the walk cycle can swing them.
  const limb = (geo, mat, x, y, z, part) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = -geo.parameters.height / 2;
    m.userData.part = part;
    pivot.add(m);
    group.add(pivot);
    return pivot;
  };
  const armGeo = new THREE.BoxGeometry(0.15, 0.58, 0.15);
  const legGeo = new THREE.BoxGeometry(0.18, 0.72, 0.18);
  const armL = limb(armGeo, shirtMat, -0.34, 1.36, 0, 'body');
  const armR = limb(armGeo, shirtMat, 0.34, 1.36, 0, 'body');
  const legL = limb(legGeo, pantsMat, -0.13, 0.74, 0, 'body');
  const legR = limb(legGeo, pantsMat, 0.13, 0.74, 0, 'body');
  return { group, parts: { torso, head, armL, armR, legL, legR } };
}

// Swing the limbs for a walker at `phase`; amp scales with speed.
export function animateWalk(parts, phase, amp = 1) {
  const s = Math.sin(phase) * 0.55 * amp;
  parts.legL.rotation.x = s;
  parts.legR.rotation.x = -s;
  parts.armL.rotation.x = -s * 0.8;
  parts.armR.rotation.x = s * 0.8;
}

export function createPlayer(G, spawnPos) {
  const { group, parts } = makeHumanoid({ shirt: 0xff6b35, pants: 0x27324a, skin: 0xc98a5e });
  group.position.copy(spawnPos);
  G.scene.add(group);
  G.player = {
    group, parts,
    heading: Math.PI,           // face the city centre at spawn
    walkPhase: 0,
    inCar: null,
    health: 100,
    lastDamageAt: -99,
    aim: false,
    dead: false,
  };
  return G.player;
}

const WALK_SPEED = 4.4, RUN_SPEED = 8.2;

export function updatePlayer(G, dt, input) {
  const P = G.player;
  if (P.inCar || G.state !== 'playing') return;
  const p = P.group.position;

  // Movement is relative to the camera yaw: W walks away from the camera.
  let mx = 0, mz = 0;
  if (input.down.has('KeyW') || input.down.has('ArrowUp')) mz += 1;
  if (input.down.has('KeyS') || input.down.has('ArrowDown')) mz -= 1;
  if (input.down.has('KeyA') || input.down.has('ArrowLeft')) mx -= 1;
  if (input.down.has('KeyD') || input.down.has('ArrowRight')) mx += 1;
  const moving = (mx !== 0 || mz !== 0);
  const running = input.down.has('ShiftLeft') || input.down.has('ShiftRight');
  const speed = running ? RUN_SPEED : WALK_SPEED;

  if (moving) {
    const len = Math.hypot(mx, mz);
    const sy = Math.sin(G.camYaw), cy = Math.cos(G.camYaw);
    const wx = (mx * cy - mz * sy) / len;   // camera-right / camera-forward mix
    const wz = (-mz * cy - mx * sy) / len;
    // Face the way we walk (or keep facing the camera while aiming).
    if (!P.aim) {
      const target = Math.atan2(wx, wz);
      let d = target - P.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      P.heading += d * Math.min(1, dt * 14);
    }
    p.x += wx * speed * dt;
    p.z += wz * speed * dt;
    P.walkPhase += dt * speed * 1.9;
  } else {
    P.walkPhase += dt * 2;
  }
  if (P.aim) P.heading = G.camYaw + Math.PI;

  resolveCircle(p, 0.45, G.city.colliders);
  // Cars are solid to a pedestrian: get pushed out of their footprint.
  for (const car of G.cars) {
    const cp = car.group.position;
    const dx = p.x - cp.x, dz = p.z - cp.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 2.1 * 2.1 && d2 > 1e-5) {
      const d = Math.sqrt(d2);
      p.x = cp.x + (dx / d) * 2.1;
      p.z = cp.z + (dz / d) * 2.1;
    }
  }
  P.group.rotation.y = P.heading;
  animateWalk(P.parts, P.walkPhase, moving ? 1 : 0.12);

  // Slow recovery once the shooting stops.
  if (P.health > 0 && P.health < 100 && G.time - P.lastDamageAt > 6) {
    P.health = Math.min(100, P.health + dt * 2.5);
  }
}

export function damagePlayer(G, amount) {
  const P = G.player;
  if (!P || P.health <= 0 || G.state !== 'playing') return;
  P.health -= amount;
  P.lastDamageAt = G.time;
  sfxThud();
  if (P.health <= 0) {
    P.health = 0;
    G.onWasted();
  }
}
