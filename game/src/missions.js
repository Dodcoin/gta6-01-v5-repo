// missions.js — Marina Sol's story. Four chained jobs phoned in by the
// fixer, each with a gold pillar marker and a minimap blip, plus repeatable
// side gigs offered in the breathing room between story missions (press G
// to take one) and endlessly after the story is done.
//
//   1. First Wheels    — steal the marked Comet, deliver it to the docks.
//   2. Hot Package     — a timed run across town while the heat rises.
//   3. Dockside Trouble— a firefight on the pier for a case of cash.
//   4. Getaway         — rob the casino van, then lose four stars.

import * as THREE from 'three';
import { makeCar } from './vehicles.js';
import { makePed } from './pedestrians.js';
import { animateWalk } from './player.js';
import { enemyShoot } from './combat.js';
import { addCrime, setWanted } from './wanted.js';
import { showBanner, showPhone } from './hud.js';
import { sfxChime, sfxJingle, sfxFail } from './audio.js';
import { writeSave } from './savegame.js';
import { ROADS } from './city.js';

const MARINA = 'Marina Sol';
const DOCK = new THREE.Vector3(258, 0, -222);
const PIER_END = new THREE.Vector3(318, 0, -222);

let marker = null, markerRing = null;

function makeMarker(scene) {
  marker = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 16, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  marker.position.y = 8;
  markerRing = new THREE.Mesh(
    new THREE.RingGeometry(1.7, 2.3, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
  );
  markerRing.rotation.x = -Math.PI / 2;
  markerRing.position.y = 0.15;
  const g = new THREE.Group();
  g.add(marker, markerRing);
  g.visible = false;
  scene.add(g);
  return g;
}

function propBox(scene, color, emissive, x, z, s = 0.55) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(s, s, s),
    new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 1.2, roughness: 0.4 }),
  );
  m.position.set(x, s / 2 + 0.4, z);
  scene.add(m);
  return m;
}

export function initMissions(G) {
  G.missions = {
    mode: 'story',           // story | between | gig
    stage: 'boot',
    betweenTimer: 0,
    guards: [],
    props: {},
    gig: null,
    wantedBumpAt: null,
  };
  G.missionTimer = null;
  G.objective = { pos: null, text: '' };
  G.markerGroup = makeMarker(G.scene);
  // The M1 target: a loud orange sports car parked up on the 60-street.
  G.missionCar = makeCar(G, { style: 'sport', color: 0xff7f11, kind: 'parked', x: 66.6, z: -60, heading: Math.PI });
  G.missionCar.targetCar = true;
}

export function beginMissions(G) {
  if (G.storyIndex < 4) startStory(G, G.storyIndex);
  else enterBetween(G, 4);
}

function setObjective(G, pos, text) {
  G.objective.pos = pos ? (G.objective.pos ? G.objective.pos.copy(pos) : pos.clone()) : null;
  G.objective.text = text;
}

function reward(G, amount, title = 'MISSION COMPLETE') {
  G.cash += amount;
  sfxJingle();
  showBanner(title, `+$${amount.toLocaleString('en-US')}`);
  writeSave(G);
}

function enterBetween(G, seconds) {
  const M = G.missions;
  M.mode = 'between';
  M.stage = 'between';
  M.betweenTimer = seconds;
  setObjective(G, null, '');
  if (G.storyIndex < 4) {
    showPhone(MARINA, 'Got a side gig if you want it — press G. Otherwise sit tight, next job soon.');
  } else {
    showPhone(MARINA, 'Story done, money keeps moving. Press G whenever you want another gig.');
  }
}

// ------------------------------------------------------------- story
function startStory(G, idx) {
  const M = G.missions;
  M.mode = 'story';
  if (idx === 0) {
    M.stage = 'm1-steal';
    showBanner('FIRST WHEELS', 'A job from Marina Sol');
    showPhone(MARINA, 'New in Serena? Good. There is an orange Comet parked on the 60-street with your name on it. Take it, bring it to my garage at the docks. Do not scratch it.');
  } else if (idx === 1) {
    M.stage = 'm2-pickup';
    const pk = propBox(G.scene, 0x8e44ad, 0x5e1a80, -249, -249);
    M.props.package = pk;
    showBanner('HOT PACKAGE', 'A job from Marina Sol');
    showPhone(MARINA, 'A package is sitting on the south-west corner, by the water tower streets. Pick it up and bring it to the café by the hospital. And friend — it is hot. Move.');
  } else if (idx === 2) {
    M.stage = 'm3-go';
    showBanner('DOCKSIDE TROUBLE', 'A job from Marina Sol');
    showPhone(MARINA, 'The dock buyers double-crossed me. Their cash case is on the pier. Go take it back — expect manners to be short.');
  } else if (idx === 3) {
    M.stage = 'm4-go';
    const van = makeCar(G, { style: 'van', color: 0xf5c542, kind: 'parked', x: 236, z: 140, heading: Math.PI / 2 });
    M.props.van = van;
    showBanner('GETAWAY', 'The last job');
    showPhone(MARINA, 'Final play: the casino cash van, beachfront lot. Take it and lose the heat — all of it. Then we are rich and even.');
  }
}

function completeStory(G, amount, title) {
  reward(G, amount, title);
  G.storyIndex = Math.min(4, G.storyIndex + 1);
  writeSave(G);
  enterBetween(G, G.storyIndex >= 4 ? 6 : 16);
}

function failTimed(G, what) {
  sfxFail();
  showBanner(what, 'Marina is not pleased');
  showPhone(MARINA, 'That one got away from us. Forget it — regroup, I will find us another angle.');
  G.missionTimer = null;
  if (G.missions.mode === 'gig') { G.missions.gig = null; enterBetween(G, 8); }
  else startStory(G, G.storyIndex);   // story jobs simply re-offer
}

// ------------------------------------------------------------- gigs
function startGig(G) {
  const M = G.missions;
  M.mode = 'gig';
  if (Math.random() < 0.5) {
    const candidates = G.cars.filter((c) => c.kind === 'parked' && !c.targetCar && c !== (M.props && M.props.van));
    const car = candidates[Math.floor(Math.random() * candidates.length)];
    M.gig = { type: 'car', car };
    M.stage = 'gig-steal';
    showPhone(MARINA, 'Gig: a buyer wants that marked car. Steal it, drop it at my dock garage. Easy money.');
  } else {
    const corner = () => {
      const rx = ROADS[Math.floor(Math.random() * ROADS.length)];
      const rz = ROADS[Math.floor(Math.random() * ROADS.length)];
      return new THREE.Vector3(rx + 10.6, 0, rz + 10.6);
    };
    const from = corner(); let to = corner();
    if (from.distanceTo(to) < 150) to = corner();
    M.gig = { type: 'package', from, to };
    M.props.gigPackage = propBox(G.scene, 0x2980b9, 0x1a5276, from.x, from.z);
    M.stage = 'gig-pickup';
    showPhone(MARINA, 'Gig: package run. Pick it up, drop it at the gold marker, clock is running.');
  }
}

function completeGig(G, amount) {
  reward(G, amount, 'GIG COMPLETE');
  G.missions.gig = null;
  enterBetween(G, G.storyIndex >= 4 ? 5 : 10);
}

// ------------------------------------------------------------- update
export function updateMissions(G, dt) {
  const M = G.missions;
  if (!M || G.state !== 'playing') return;
  const P = G.player;
  const pp = P.group.position;

  // Marker follows the objective.
  const mg = G.markerGroup;
  if (G.objective.pos) {
    mg.visible = true;
    mg.position.set(G.objective.pos.x, 0, G.objective.pos.z);
    marker.rotation.y += dt * 1.5;
    marker.material.opacity = 0.26 + Math.sin(G.time * 4) * 0.08;
  } else mg.visible = false;
  for (const k of ['package', 'gigPackage']) {
    const prop = M.props[k];
    if (prop) { prop.rotation.y += dt * 2; prop.position.y = 0.7 + Math.sin(G.time * 3) * 0.12; }
  }
  if (M.props.case) { M.props.case.rotation.y += dt * 1.2; }

  if (M.mode === 'between') {
    M.betweenTimer -= dt;
    if (G.gigRequested) { G.gigRequested = false; startGig(G); }
    else if (M.betweenTimer <= 0) {
      if (G.storyIndex < 4) startStory(G, G.storyIndex);
      else startGig(G);
    }
    return;
  }

  const distTo = (v) => Math.hypot(pp.x - v.x, pp.z - v.z);
  const inCar = (car) => P.inCar === car;

  switch (M.stage) {
    // ---- M1
    case 'm1-steal': {
      const car = G.missionCar;
      setObjective(G, car.group.position, 'Steal the orange Comet');
      if (inCar(car)) {
        M.stage = 'm1-deliver';
        showPhone(MARINA, 'That is my car now. Dock garage, north-east pier. Bring her home.');
        addCrime(G, 'mission', 0.5, false);
      }
      break;
    }
    case 'm1-deliver': {
      const car = G.missionCar;
      if (inCar(car)) {
        setObjective(G, DOCK, 'Deliver the Comet to the dock garage');
        if (distTo(DOCK) < 7.5) completeStory(G, 750);
      } else setObjective(G, car.group.position, 'Get back in the Comet');
      break;
    }
    // ---- M2
    case 'm2-pickup': {
      const pk = M.props.package;
      setObjective(G, pk.position, 'Pick up the package (south-west corner)');
      if (distTo(pk.position) < 4) {
        G.scene.remove(pk); M.props.package = null;
        M.stage = 'm2-deliver';
        G.missionTimer = 150;
        M.wantedBumpAt = 75;
        setWanted(G, 2);
        sfxChime();
        showPhone(MARINA, 'You have it. Café by the hospital — GO. The whole city is about to notice you.');
      }
      break;
    }
    case 'm2-deliver': {
      const dest = new THREE.Vector3(146, 0, 52);
      setObjective(G, dest, 'Deliver the package to the café');
      G.missionTimer -= dt;
      if (M.wantedBumpAt && G.missionTimer < M.wantedBumpAt) { setWanted(G, 3); M.wantedBumpAt = null; showPhone(MARINA, 'Heat is rising — do not stop for anything!'); }
      if (G.missionTimer <= 0) { G.missionTimer = null; failTimed(G, 'TOO SLOW'); }
      else if (distTo(dest) < 5.5) { G.missionTimer = null; completeStory(G, 1200); }
      break;
    }
    // ---- M3
    case 'm3-go': {
      setObjective(G, PIER_END, 'Reach the pier at the docks');
      if (distTo(PIER_END) < 30) {
        M.stage = 'm3-fight';
        const spots = [[286, -214], [296, -230], [306, -214], [276, -228]];
        M.guards = spots.map(([x, z]) => {
          const g = makePed(G, { x, z, role: 'guard', dress: { shirt: 0x7b241c, pants: 0x1c1c1e, skin: 0xc68642 }, hp: 100 });
          g.state = 'guard';
          return g;
        });
        showBanner('DOCKSIDE TROUBLE', 'They are armed — drop them');
        showPhone(MARINA, 'They are shooting! Drop them and take the case!');
        addCrime(G, 'mission', 0.5, false);
      }
      break;
    }
    case 'm3-fight': {
      let alive = 0;
      for (const g of M.guards) {
        if (g.state === 'down' || g.state === 'gone') continue;
        alive++;
        updateGuard(G, g, dt);
      }
      setObjective(G, PIER_END, `Clear the dock guards (${4 - alive}/4)`);
      if (alive === 0) {
        M.stage = 'm3-case';
        M.props.case = propBox(G.scene, 0xf5c542, 0xb8860b, PIER_END.x, PIER_END.z, 0.7);
        showPhone(MARINA, 'Pier is clear. The gold case — grab it and go.');
      }
      break;
    }
    case 'm3-case': {
      setObjective(G, PIER_END, 'Grab the cash case');
      if (distTo(PIER_END) < 3.4) {
        G.scene.remove(M.props.case); M.props.case = null;
        setWanted(G, Math.max(2, G.wanted.stars));
        addCrime(G, 'mission', 1, true);
        completeStory(G, 2000);
      }
      break;
    }
    // ---- M4
    case 'm4-go': {
      const van = M.props.van;
      setObjective(G, van.group.position, 'Steal the casino cash van');
      if (inCar(van)) {
        M.stage = 'm4-escape';
        G.wanted.stars = Math.max(G.wanted.stars, 4);
        G.wanted.lastSeenAt = G.time;
        showBanner('GETAWAY', 'Lose the heat — all four stars');
        showPhone(MARINA, 'That van is LOUD, friend. Lose every star and the money is ours.');
      }
      break;
    }
    case 'm4-escape': {
      setObjective(G, null, 'Lose the police — reach 0 stars');
      if (G.wanted.stars <= 0.01) {
        showPhone(MARINA, 'Clean. You beautiful ghost. Drinks are on me — forever.');
        completeStory(G, 3000, 'STORY COMPLETE');
      }
      break;
    }
    // ---- gigs
    case 'gig-steal': {
      const car = M.gig.car;
      setObjective(G, car.group.position, 'Gig: steal the marked car');
      if (inCar(car)) M.stage = 'gig-deliver';
      break;
    }
    case 'gig-deliver': {
      const car = M.gig.car;
      if (inCar(car)) {
        setObjective(G, DOCK, 'Gig: deliver the car to the dock garage');
        if (distTo(DOCK) < 7.5) completeGig(G, 400);
      } else setObjective(G, car.group.position, 'Gig: get back in the car');
      break;
    }
    case 'gig-pickup': {
      const pk = M.props.gigPackage;
      setObjective(G, pk.position, 'Gig: pick up the package');
      if (distTo(pk.position) < 4) {
        G.scene.remove(pk); M.props.gigPackage = null;
        M.stage = 'gig-run';
        G.missionTimer = 120;
        sfxChime();
      }
      break;
    }
    case 'gig-run': {
      setObjective(G, M.gig.to, 'Gig: drop the package at the marker');
      G.missionTimer -= dt;
      if (G.missionTimer <= 0) { G.missionTimer = null; failTimed(G, 'GIG FAILED'); }
      else if (distTo(M.gig.to) < 5.5) { G.missionTimer = null; completeGig(G, 350); }
      break;
    }
    default: break;
  }
}

// Dock guards: hold the pier, walk toward the player if they are far,
// shoot when in range. Their bodies are peds with role 'guard'.
function updateGuard(G, g, dt) {
  const p = g.group.position;
  const pp = G.player.group.position;
  const d = p.distanceTo(pp);
  g.heading = Math.atan2(pp.x - p.x, pp.z - p.z);
  g.group.rotation.y = g.heading;
  if (d > 20) {
    p.x += Math.sin(g.heading) * 2.6 * dt;
    p.z += Math.cos(g.heading) * 2.6 * dt;
    g.walkPhase += dt * 6;
    animateWalk(g.parts, g.walkPhase, 0.9);
  }
  g.shootCd -= dt;
  if (g.shootCd <= 0 && d < 40 && G.state === 'playing') {
    enemyShoot(G, p, 0.46);
    g.shootCd = 1.2 + Math.random() * 0.9;
  }
}
