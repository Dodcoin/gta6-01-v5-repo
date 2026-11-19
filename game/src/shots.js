// shots.js — the screenshot director. With ?shot=<name>&seed=7 the game
// boots straight past the menu into a staged, deterministic scene, and
// main.js sets window.__shotReady once it has rendered. Each scene uses
// the real systems (traffic, police, missions) so the frame is honest
// gameplay, just arranged:
//
//   cover   — hero shot: the player beside a sports car on the coast road,
//             city skyline behind, golden-hour light.
//   chase   — the player driving with two police cars in pursuit, 3 stars.
//   foot    — on foot in a busy street: pedestrians, traffic, minimap.
//   mission — mission 1 live: objective pillar on the target car, banner up.

import * as THREE from 'three';
import { makeCar } from './vehicles.js';
import { showBanner, showPhone } from './hud.js';

export function setupShot(G, name) {
  const P = G.player;
  if (name === 'cover') {
    // Staged on the casino lot paving (off the traffic lanes, so passing
    // cars cannot wander into the hero frame), angled toward the skyline.
    const car = makeCar(G, { style: 'sport', color: 0xd63031, kind: 'parked', x: 237.5, z: 129.5, heading: 0.8 });
    P.group.position.set(235.4, 0, 132.6);
    P.heading = -0.9;
    P.group.rotation.y = P.heading;
    G.camYaw = 2.2;
    G.shotCam = { pos: new THREE.Vector3(243.2, 2.6, 138.8), look: new THREE.Vector3(236.5, 1.2, 129) };
    return;
  }

  if (name === 'chase') {
    const car = makeCar(G, { style: 'sedan', color: 0x0984e3, kind: 'traffic', x: -23.4, z: -30, heading: 0 });
    car.speed = 15;
    car.driver = 'player';
    P.inCar = car;
    P.health = 100000;               // the shot must not end in a wasted screen
    const cop1 = makeCar(G, { style: 'police', color: 0xf2f4f6, kind: 'police', x: -25.6, z: -48, heading: 0 });
    cop1.speed = 15.5; cop1.maxSpeed = 37.5;
    cop1.police = { officer: null, shootCd: 99, side: 1 };
    const cop2 = makeCar(G, { style: 'police', color: 0xf2f4f6, kind: 'police', x: -19.8, z: -60, heading: 0 });
    cop2.speed = 16; cop2.maxSpeed = 37.5;
    cop2.police = { officer: null, shootCd: 99, side: -1 };
    G.wanted.stars = 3;
    G.wanted.lastSeenAt = 0;
    G.shotDrive = car;               // main keeps this car rolling north
    G.shotFollow = true;             // camera rides with it…
    G.shotCamFront = true;           // …from the front, so the cops show
    return;
  }

  if (name === 'foot') {
    P.group.position.set(-13.5, 0, -6);
    P.heading = 2.75;
    P.group.rotation.y = P.heading;
    // Pull a crowd onto this block so the street feels lived-in.
    let moved = 0;
    for (const ped of G.peds) {
      if (ped.role !== 'civilian' || moved >= 7) continue;
      ped.group.position.set(-26 + moved * 2.6, 0, -13 + (moved % 3) * 5.5);
      moved++;
    }
    G.shotCam = { pos: new THREE.Vector3(-8.2, 3.1, 1.8), look: new THREE.Vector3(-14.5, 1.1, -7) };
    return;
  }

  // mission (and any unknown name): mission 1, target car in frame.
  const car = G.missionCar;
  P.group.position.set(car.group.position.x - 5.5, 0, car.group.position.z + 7.5);
  P.heading = Math.atan2(car.group.position.x - P.group.position.x, car.group.position.z - P.group.position.z);
  P.group.rotation.y = P.heading;
  G.shotCam = {
    pos: new THREE.Vector3(car.group.position.x - 11, 3.6, car.group.position.z + 13),
    look: new THREE.Vector3(car.group.position.x, 1.6, car.group.position.z),
  };
  // Re-issue the intro with long durations: the screenshot may be taken
  // many (virtual) seconds after boot, past a normal banner's lifetime.
  showBanner('FIRST WHEELS', 'A job from Marina Sol', 60000);
  showPhone('Marina Sol', 'There is an orange Comet parked on the 60-street with your name on it. Take it, bring it to my garage at the docks.', 60000);
}
