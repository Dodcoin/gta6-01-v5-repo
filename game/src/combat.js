// combat.js — gunplay. The player's pistol is a hitscan ray from the
// camera through the crosshair: it tests the character meshes first (a
// head hit part means a headshot), then checks the building AABBs so a
// wall between the muzzle and the target eats the bullet. Tracers and a
// muzzle flash sell the shot; enemies fire back with a probabilistic
// model — a tracer, a crack, and a dice roll weighted by distance.

import * as THREE from 'three';
import { segmentBlocked } from './city.js';
import { damagePed } from './pedestrians.js';
import { damagePlayer } from './player.js';
import { addCrime } from './wanted.js';
import { sfxGunshot, sfxEnemyShot } from './audio.js';

const tracers = [];
const raycaster = new THREE.Raycaster();
raycaster.far = 110;

export function initCombat(G) {
  // Muzzle flash: a small additive sprite at the gun, flashed per shot.
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const grad = c.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,240,190,1)');
  grad.addColorStop(0.4, 'rgba(255,180,60,0.8)');
  grad.addColorStop(1, 'rgba(255,120,20,0)');
  c.fillStyle = grad; c.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  G.combat = {
    flash: new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })),
    fireCd: 0,
  };
  G.combat.flash.scale.set(0.7, 0.7, 1);
  G.combat.flash.visible = false;
  G.scene.add(G.combat.flash);
}

function addTracer(G, from, to, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  G.scene.add(line);
  tracers.push({ line, life: 0.07 });
}

export function updateCombat(G, dt) {
  if (G.combat) G.combat.fireCd = Math.max(0, G.combat.fireCd - dt);
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
    if (t.life <= 0) {
      G.scene.remove(t.line);
      t.line.geometry.dispose(); t.line.material.dispose();
      tracers.splice(i, 1);
    }
  }
  if (G.combat && G.combat.flash.visible && Math.random() < 0.5) G.combat.flash.visible = false;
}

// Fire the player's pistol. Aim direction comes from the camera (the
// crosshair is honest); the muzzle sits at the player's hand.
export function playerShoot(G) {
  const C = G.combat;
  if (!C || C.fireCd > 0 || G.state !== 'playing' || G.player.inCar) return;
  C.fireCd = 0.23;
  sfxGunshot();
  const P = G.player;
  const pp = P.group.position;
  G.chaos.time = G.time;
  G.chaos.pos.set(pp.x, 0, pp.z);

  // Any ped or police unit within earshot-and-eyeshot makes it witnessed.
  const witnessed = G.peds.some((pd) => pd.state !== 'down' && pd.state !== 'gone' && pd.group.position.distanceTo(pp) < 34)
    || G.cars.some((car) => car.kind === 'police' && car.group.position.distanceTo(pp) < 45);
  addCrime(G, 'gunfire', 0.6, witnessed);

  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3();
  G.camera.getWorldPosition(origin);
  G.camera.getWorldDirection(dir);
  if (!P.aim) { // hip fire: a little honest spread
    dir.x += (Math.random() - 0.5) * 0.05;
    dir.y += (Math.random() - 0.5) * 0.05;
    dir.normalize();
  }
  raycaster.set(origin, dir);

  // Character meshes: heads ride in userData via their owner ped.
  const meshes = [];
  for (const ped of G.peds) {
    if (ped.state === 'down' || ped.state === 'gone') continue;
    ped.group.traverse((o) => { if (o.isMesh) { o.userData.ownerPed = ped; meshes.push(o); } });
  }
  const hits = raycaster.intersectObjects(meshes, false);
  const muzzle = new THREE.Vector3(pp.x + Math.sin(P.heading) * 0.4, 1.32, pp.z + Math.cos(P.heading) * 0.4);
  C.flash.position.copy(muzzle);
  C.flash.visible = true;

  let end = origin.clone().add(dir.clone().multiplyScalar(90));
  if (hits.length) {
    const hit = hits[0];
    const ped = hit.object.userData.ownerPed;
    const blockedAt = segmentBlocked(origin, hit.point, G.city.colliders);
    if (!blockedAt && ped) {
      const headshot = hit.object.userData.part === 'head';
      end = hit.point.clone();
      const killed = damagePed(G, ped, headshot ? 100 : 34);
      if (killed) addCrime(G, 'murder', ped.role === 'civilian' ? 1 : 0.7, witnessed);
    }
  }
  addTracer(G, muzzle, end, 0xffe9a8);
}

// An enemy (officer, guard, police gunner) fires at the player.
export function enemyShoot(G, fromPos, accuracy = 0.5) {
  sfxEnemyShot();
  const target = G.player.group.position.clone();
  target.y = 1.1;
  const from = fromPos.clone(); from.y = 1.35;
  const dist = from.distanceTo(target);
  const blocked = segmentBlocked(from, target, G.city.colliders);
  const hitChance = blocked ? 0 : Math.max(0.06, accuracy - dist * 0.006);
  const end = target.clone();
  if (Math.random() < hitChance) {
    damagePlayer(G, 5 + Math.random() * 6);
  } else {
    end.x += (Math.random() - 0.5) * 3;
    end.z += (Math.random() - 0.5) * 3;
    end.y += (Math.random() - 0.5) * 1.5;
  }
  addTracer(G, from, end, 0xff7b6b);
  G.wanted.lastSeenAt = G.time;   // they are literally looking at the player
}
