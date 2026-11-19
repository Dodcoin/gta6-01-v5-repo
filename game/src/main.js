// main.js — Costa Serena's bootstrap and heartbeat.
//
// Builds the renderer/scene, assembles the shared game state object G that
// every system module reads and writes, wires the crime callbacks the
// physics modules call back into, runs the state machine (menu / playing /
// paused / busted / wasted), drives the third-person camera, and owns the
// main loop. In ?shot= mode it skips the menu, stages a scene through
// shots.js and raises window.__shotReady for the screenshot harness.

import * as THREE from 'three';
import { buildCity } from './city.js';
import { initInput, input, takeMouse, postUpdate, key, hit, lockPointer, unlockPointer } from './input.js';
import { createPlayer, updatePlayer, damagePlayer } from './player.js';
import { spawnParkedCars, updatePlayerCar, driveCar, collideCars, nearestCar } from './vehicles.js';
import { spawnTraffic, updateTraffic } from './traffic.js';
import { spawnPedestrians, updatePedestrians, makePed } from './pedestrians.js';
import { createWanted, addCrime, updateWanted, clearWanted } from './wanted.js';
import { initCombat, updateCombat, playerShoot } from './combat.js';
import { initPolice, updatePolice } from './police.js';
import { initMissions, beginMissions, updateMissions } from './missions.js';
import { initHud, updateHud, showBanner } from './hud.js';
import { initMinimap, drawMinimap } from './minimap.js';
import { initAudio, updateAudio, toggleMute, sfxDoor } from './audio.js';
import { loadSave, writeSave, clearSave } from './savegame.js';
import { setupShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const SEED = Number.isInteger(seedParam) ? seedParam : 7;
const SHOT = params.get('shot');

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf7a56b);
scene.fog = new THREE.Fog(0xf2a56e, 120, 560);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1400);

// Golden-hour light: warm low sun from the west, soft sky bounce.
scene.add(new THREE.HemisphereLight(0xffd9a8, 0x39594a, 1.0));
const sun = new THREE.DirectionalLight(0xffb066, 2.0);
sun.position.set(-260, 150, 90);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x88a6ff, 0.35);
fill.position.set(200, 120, -160);
scene.add(fill);

// ------------------------------------------------------------ game state
const G = {
  scene, camera, renderer,
  seed: SEED,
  state: 'menu',
  time: 0,
  cash: 120,
  storyIndex: 0,
  camYaw: 0, camPitch: 0.32,
  prompt: '',
  objective: { pos: null, text: '' },
  missionTimer: null,
  bustedMeter: 0,
  sirenLevel: 0,
  chaos: { time: -99, pos: new THREE.Vector3() },
  cars: [], peds: [],
  shotMode: SHOT, shotCam: null, shotFollow: false, shotDrive: null,
  gigRequested: false,
  saveTimer: 0,
};
G.city = buildCity(scene, SEED);
G.wanted = createWanted();

const SPAWN = new THREE.Vector3(-17, 0, 24);
createPlayer(G, SPAWN);
spawnParkedCars(G);
spawnTraffic(G, 11);
spawnPedestrians(G, 26);
initPolice(G);
initCombat(G);
initMissions(G);
initHud();
initMinimap();
initInput(canvas);

// Is anyone close enough to see (and report) what happens at `pos`?
function witnessedBy(pos, r = 30) {
  for (const ped of G.peds) {
    if (ped.state === 'down' || ped.state === 'gone') continue;
    if (ped.group.position.distanceTo(pos) < r) return true;
  }
  for (const car of G.cars) {
    if (car.kind === 'police' && car.group.position.distanceTo(pos) < r + 18) return true;
  }
  return false;
}

// Callbacks the physics/combat modules ring when things go wrong.
G.onCrash = (impact) => {
  if (impact <= 0 || G.state !== 'playing') return;
  addCrime(G, 'crash', 0.3, witnessedBy(G.player.group.position));
  if (impact >= 9) damagePlayer(G, 4);
};
G.onPedHit = (ped) => {
  addCrime(G, 'pedHit', 1, witnessedBy(ped.group.position));
};
G.onGuardDown = () => { /* missions poll guard state themselves */ };
G.onBusted = () => {
  if (G.state !== 'playing') return;
  exitCar(G, true);
  const fine = Math.min(G.cash, 150 + Math.ceil(G.wanted.stars) * 100);
  G.cash -= fine;
  G.state = 'busted';
  showEnd('BUSTED', `The Serena PD walks you to a cell. Fine paid: $${fine}. Your record is wiped clean — this time.`, 'Serve it and step out');
  unlockPointer();
  writeSave(G);
};
G.onWasted = () => {
  if (G.state !== 'playing') return;
  exitCar(G, true);
  const fee = Math.min(G.cash, 200);
  G.cash -= fee;
  G.state = 'wasted';
  showEnd('WASTED', `You wake up at Serena General with a $${fee} bill and a headache. The city kept spinning without you.`, 'Discharge yourself');
  unlockPointer();
  writeSave(G);
};

// ------------------------------------------------------------ screens
const $ = (id) => document.getElementById(id);
const startScreen = $('start-screen'), pauseScreen = $('pause-screen'), endScreen = $('end-screen');

function showEnd(title, text, button) {
  $('end-title').textContent = title;
  $('end-text').textContent = text;
  $('btn-respawn').textContent = button;
  endScreen.style.display = 'flex';
}

function startGame(fresh) {
  const save = fresh ? null : loadSave();
  if (fresh) { clearSave(); G.cash = 120; G.storyIndex = 0; G.player.group.position.copy(SPAWN); }
  else if (save) {
    G.cash = save.cash;
    G.storyIndex = save.storyIndex;
    if (save.pos) G.player.group.position.set(save.pos[0], 0, save.pos[2]);
  }
  G.player.health = 100;
  clearWanted(G);
  G.bustedMeter = 0;
  startScreen.style.display = 'none';
  endScreen.style.display = 'none';
  pauseScreen.style.display = 'none';
  G.state = 'playing';
  initAudio();
  lockPointer();
  beginMissions(G);
  writeSave(G);
}

function respawn() {
  const at = G.state === 'busted' ? G.city.landmarks.police.respawn : G.city.landmarks.hospital.respawn;
  G.player.group.position.copy(at);
  G.player.health = 100;
  clearWanted(G);
  G.bustedMeter = 0;
  endScreen.style.display = 'none';
  G.state = 'playing';
  lockPointer();
}

function pauseGame() {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  pauseScreen.style.display = 'flex';
  unlockPointer();
}

function resumeGame() {
  if (G.state !== 'paused') return;
  pauseScreen.style.display = 'none';
  G.state = 'playing';
  lockPointer();
}

$('btn-start').addEventListener('click', () => startGame(true));
$('btn-continue').addEventListener('click', () => startGame(false));
$('btn-resume').addEventListener('click', resumeGame);
$('btn-respawn').addEventListener('click', respawn);
$('btn-menu').addEventListener('click', () => {
  pauseScreen.style.display = 'none';
  startScreen.style.display = 'flex';
  G.state = 'menu';
});
document.addEventListener('pointerlockchange', () => {
  if (!input.locked && G.state === 'playing' && !G.shotMode) pauseGame();
});
canvas.addEventListener('click', () => {
  if (G.state === 'playing' && !input.locked) lockPointer();
});

// Continue button only when a save exists.
{
  const save = loadSave();
  if (save && !SHOT) {
    $('btn-continue').style.display = 'block';
    $('save-note').textContent = `Saved game found — $${save.cash.toLocaleString('en-US')}, story progress ${save.storyIndex}/4.`;
  }
}

// ------------------------------------------------------------ car entry
function enterCar(G, car) {
  const pp = G.player.group.position;
  if (car.kind === 'traffic' && !car.driver) {
    // The driver does not appreciate it: out they come, and they run.
    const driver = makePed(G, { x: pp.x + 1, z: pp.z, role: 'civilian' });
    driver.state = 'flee';
    driver.threat = pp.clone();
    driver.threatUntil = G.time + 5;
  }
  if (car.kind !== 'police') addCrime(G, 'carTheft', 1, witnessedBy(car.group.position));
  else addCrime(G, 'carTheft', 1.6, true);
  car.driver = 'player';
  G.player.inCar = car;
  sfxDoor();
}

function exitCar(G, silent = false) {
  const car = G.player.inCar;
  if (!car) return;
  const cp = car.group.position;
  const left = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
  G.player.group.position.set(cp.x + left.x * 2.6, 0, cp.z + left.z * 2.6);
  G.player.heading = car.heading;
  car.driver = null;
  if (Math.abs(car.speed) < 0.5) car.speed = 0;
  G.player.inCar = null;
  if (!silent) sfxDoor();
}

// ------------------------------------------------------------ camera
const camTargetPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
function updateCamera(G, dt) {
  const P = G.player;
  if (G.shotCam) {
    camera.position.copy(G.shotCam.pos);
    camera.lookAt(G.shotCam.look);
    return;
  }
  if (G.state === 'menu') {
    const t = G.time * 0.06;
    camera.position.set(Math.sin(t) * 170, 58, Math.cos(t) * 170);
    camera.lookAt(0, 6, 0);
    return;
  }
  const target = P.inCar ? P.inCar.group.position : P.group.position;
  if (P.inCar || G.shotFollow) {
    const car = P.inCar || G.shotDrive;
    if (!car) return;
    const f = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
    if (G.shotCamFront) {
      // Screenshot variant: ride ahead of the car, looking back at it, so
      // the pursuers behind the car stay in frame.
      const r = { x: -Math.cos(car.heading), z: Math.sin(car.heading) };
      camTargetPos.set(
        car.group.position.x + f.x * 12.5 + r.x * 4.5,
        car.group.position.y + 3.6,
        car.group.position.z + f.z * 12.5 + r.z * 4.5,
      );
      camera.position.lerp(camTargetPos, 1 - Math.exp(-dt * 7));
      camLook.set(car.group.position.x - f.x * 3, car.group.position.y + 1.4, car.group.position.z - f.z * 3);
      camera.lookAt(camLook);
      G.camYaw = car.heading + Math.PI;
      return;
    }
    camTargetPos.set(
      car.group.position.x - f.x * 11,
      car.group.position.y + 4.4,
      car.group.position.z - f.z * 11,
    );
    camera.position.lerp(camTargetPos, 1 - Math.exp(-dt * 4.5));
    if (camera.position.y < 1.2) camera.position.y = 1.2;
    camLook.set(car.group.position.x + f.x * 8, car.group.position.y + 1.7, car.group.position.z + f.z * 8);
    camera.lookAt(camLook);
    G.camYaw = car.heading + Math.PI;
    return;
  }
  // On foot: orbit around the player from the mouse.
  const m = takeMouse();
  G.camYaw -= m.dx * 0.0026;
  G.camPitch = Math.max(-0.08, Math.min(1.05, G.camPitch + m.dy * 0.0026));
  const dist = P.aim ? 3.6 : 6.4;
  const cp = Math.cos(G.camPitch), sp = Math.sin(G.camPitch);
  const ox = Math.sin(G.camYaw) * cp, oz = Math.cos(G.camYaw) * cp;
  camTargetPos.set(target.x + ox * dist, target.y + 1.7 + sp * dist, target.z + oz * dist);
  if (camTargetPos.y < 0.6) camTargetPos.y = 0.6;
  camera.position.lerp(camTargetPos, 1 - Math.exp(-dt * 22));
  const shoulder = P.aim ? 0.8 : 0;
  camLook.set(
    target.x - ox * 4 + Math.cos(G.camYaw) * shoulder,
    target.y + 1.55 - sp * 2,
    target.z - oz * 4 - Math.sin(G.camYaw) * shoulder,
  );
  camera.lookAt(camLook);
}

// ------------------------------------------------------------ per-frame
function interact(G) {
  const P = G.player;
  G.prompt = '';
  if (P.inCar) {
    G.prompt = 'E — Exit car';
    if (hit('KeyE')) exitCar(G);
    return;
  }
  const near = nearestCar(G, P.group.position, 3.6);
  if (near) {
    G.prompt = near.kind === 'police' ? 'E — Steal police car' : 'E — Enter car';
    if (hit('KeyE')) enterCar(G, near);
  }
}

function playStep(G, dt) {
  // Shot choreography: the chase car just drives.
  if (G.shotDrive) {
    const car = G.shotDrive;
    car.speed = 15;
    driveCar(G, car, dt, 0);
    G.player.group.position.copy(car.group.position);
  } else if (G.player.inCar) {
    updatePlayerCar(G, dt, input);
  } else {
    updatePlayer(G, dt, input);
  }
  G.player.group.visible = !G.player.inCar;

  // Aiming + firing.
  const P = G.player;
  P.aim = !P.inCar && input.rmb;
  if (!P.inCar && G.state === 'playing') {
    if (hit('KeyF') || (input.lmb && input.locked)) playerShoot(G);
  }

  interact(G);
  updateTraffic(G, dt);
  collideCars(G, dt);
  updatePedestrians(G, dt);
  updatePolice(G, dt);
  updateWanted(G, dt);
  updateCombat(G, dt);
  updateMissions(G, dt);

  if (hit('KeyM')) toggleMute();
  if (hit('KeyG')) G.gigRequested = true;
  if ((hit('KeyP') || hit('Escape')) && !G.shotMode) pauseGame();

  // Engine + siren levels for the synth.
  const car = P.inCar || G.shotDrive;
  updateAudio(car ? Math.abs(car.speed) / car.maxSpeed : 0, !!car, G.sirenLevel);

  G.saveTimer -= dt;
  if (G.saveTimer <= 0) { G.saveTimer = 20; writeSave(G); }
}

// ------------------------------------------------------------ boot/loop
if (SHOT) {
  startScreen.style.display = 'none';
  G.state = 'playing';
  G.storyIndex = 0;
  beginMissions(G);
  setupShot(G, SHOT);
}

const clock = new THREE.Clock();
let shotFrames = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.time += dt;
  G.city.update(dt, G.time);

  // Screenshot staging: let the scene settle for a few seconds of game
  // time, then freeze the simulation (rendering, camera and HUD keep
  // running). The capture harness uses a long virtual-time budget, and an
  // unfrozen scene would play itself into chaos before the shutter fires.
  if (SHOT) {
    shotFrames++;
    if (shotFrames === 100) G.frozen = true;
    if (shotFrames > 130) window.__shotReady = true;
  }

  if (G.state === 'playing' && !G.frozen) playStep(G, dt);
  else if (G.state === 'paused' && hit('KeyP')) resumeGame();

  updateCamera(G, dt);
  updateHud(G);
  if (G.state === 'playing' || G.state === 'paused' || G.shotMode) drawMinimap(G);
  renderer.render(scene, camera);
  postUpdate();
}
frame();
