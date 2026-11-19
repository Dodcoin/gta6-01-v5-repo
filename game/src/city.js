// city.js — the island of Costa Serena, built procedurally from a seed.
//
// Layout: a 600x600 m grid of streets (centres every 80 m, 16 m wide) with
// city blocks between them, a beach strip and the sea on the east edge, the
// docks in the north-east and a beachfront casino in the south-east. Every
// random choice flows from one mulberry32 stream seeded by the caller, so
// seed 7 always builds the same city. Buildings register AABB colliders in
// the returned object; movement code resolves circles against them.

import * as THREE from 'three';

export const WORLD_HALF = 300;          // city spans [-300, 300] on x and z
export const ROADS = [-260, -180, -100, -20, 60, 140, 220];
export const ROAD_HALF = 8;              // half the road width
export const BLOCK_CENTERS = [-220, -140, -60, 20, 100, 180];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- ground
// The whole street plan is painted once onto a canvas: grass, block paving,
// asphalt with centre dashes, sidewalks, crosswalks and the beach. One
// textured plane beats hundreds of road meshes.

function groundTexture() {
  const S = 2048, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  const w2c = (v) => ((v + WORLD_HALF) / (WORLD_HALF * 2)) * S;   // world -> canvas px
  const sc = S / (WORLD_HALF * 2);                                 // px per metre

  c.fillStyle = '#4c9455'; c.fillRect(0, 0, S, S);                 // tropical grass base
  // Block paving under the buildings.
  c.fillStyle = '#a8a49b';
  for (const bx of BLOCK_CENTERS) for (const bz of BLOCK_CENTERS) {
    c.fillRect(w2c(bx - 31), w2c(bz - 31), 62 * sc, 62 * sc);
  }
  // (The dock yard and casino lot are painted after the beach below:
  // their paving runs east of x=232, where the sand would cover them.)
  // Sidewalks: a pale apron around every road.
  c.fillStyle = '#c9c4b8';
  for (const r of ROADS) {
    c.fillRect(w2c(r - ROAD_HALF - 3), 0, (ROAD_HALF * 2 + 6) * sc, S);
    c.fillRect(0, w2c(r - ROAD_HALF - 3), S, (ROAD_HALF * 2 + 6) * sc);
  }
  // Asphalt.
  c.fillStyle = '#33373d';
  for (const r of ROADS) {
    c.fillRect(w2c(r - ROAD_HALF), 0, ROAD_HALF * 2 * sc, S);
    c.fillRect(0, w2c(r - ROAD_HALF), S, ROAD_HALF * 2 * sc);
  }
  // Centre dashes.
  c.fillStyle = '#e8cf6e';
  for (const r of ROADS) {
    for (let v = -296; v < 296; v += 12) {
      c.fillRect(w2c(r) - 1, w2c(v), 2, 6 * sc);
      c.fillRect(w2c(v), w2c(r) - 1, 6 * sc, 2);
    }
  }
  // Crosswalks at intersections.
  c.fillStyle = 'rgba(235,235,235,0.75)';
  for (const rx of ROADS) for (const rz of ROADS) {
    for (let i = -3; i <= 3; i++) {
      c.fillRect(w2c(rx + i * 2.1 - 0.7), w2c(rz - ROAD_HALF - 2.6), 1.4 * sc, 2 * sc);
      c.fillRect(w2c(rx + i * 2.1 - 0.7), w2c(rz + ROAD_HALF + 0.6), 1.4 * sc, 2 * sc);
      c.fillRect(w2c(rx - ROAD_HALF - 2.6), w2c(rz + i * 2.1 - 0.7), 2 * sc, 1.4 * sc);
      c.fillRect(w2c(rx + ROAD_HALF + 0.6), w2c(rz + i * 2.1 - 0.7), 2 * sc, 1.4 * sc);
    }
  }
  // Beach: sand east of the last road, fading into the waterline.
  const grad = c.createLinearGradient(w2c(232), 0, w2c(306), 0);
  grad.addColorStop(0, '#e9d49c'); grad.addColorStop(0.8, '#efe0ae'); grad.addColorStop(1, '#cfe8dd');
  c.fillStyle = grad;
  c.fillRect(w2c(232), 0, (306 - 232) * sc, S);
  // Paved lots on top of the sand: the dock yard and the casino forecourt.
  c.fillStyle = '#a8a49b';
  c.fillRect(w2c(230), w2c(-256), 66 * sc, 74 * sc);
  c.fillRect(w2c(230), w2c(106), 66 * sc, 74 * sc);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ------------------------------------------------------------- buildings
// Facades are canvas textures too: a painted base colour, a grid of windows,
// and a matching emissive map so some windows glow in the golden light.

function facadePair(base, rng) {
  const W = 128, H = 256;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = base; c.fillRect(0, 0, W, H);
  const ev = document.createElement('canvas'); ev.width = W; ev.height = H;
  const e = ev.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  const cols = 5, rows = 12, ww = W / cols, hh = H / rows;
  for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) {
    const lit = rng() < 0.42;
    c.fillStyle = lit ? '#ffe9a8' : 'rgba(30,42,58,0.85)';
    c.fillRect(x * ww + 3, y * hh + 4, ww - 6, hh - 8);
    if (lit) { e.fillStyle = '#ffca7a'; e.fillRect(x * ww + 3, y * hh + 4, ww - 6, hh - 8); }
  }
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace;
  const emissiveMap = new THREE.CanvasTexture(ev);
  return { map, emissiveMap };
}

const PALETTE = ['#f2e3c9', '#e8b4a0', '#a8d5ba', '#9fc6e8', '#f4f1de', '#e07a5f', '#81b29a', '#f2cc8f', '#cdb4db', '#ffc8dd'];

function scatterPalms(scene, rng, spots) {
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 3.6, 6);
  const crownGeo = new THREE.IcosahedronGeometry(1.7, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6844, roughness: 1 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2f9e44, roughness: 1, flatShading: true });
  for (const [x, z] of spots) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.8; trunk.rotation.z = (rng() - 0.5) * 0.22;
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.scale.set(1.25, 0.42, 1.25); crown.position.y = 3.75;
    g.add(trunk, crown);
    g.position.set(x, 0, z);
    g.rotation.y = rng() * Math.PI * 2;
    scene.add(g);
  }
}

export function buildCity(scene, seed) {
  const rng = mulberry32(seed * 7919 + 13);
  const colliders = [];
  const addCollider = (cx, cz, w, d) => colliders.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 });

  // Ground + sea.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const waterCv = document.createElement('canvas'); waterCv.width = waterCv.height = 128;
  const wc = waterCv.getContext('2d');
  wc.fillStyle = '#2b7ea8'; wc.fillRect(0, 0, 128, 128);
  wc.strokeStyle = 'rgba(255,255,255,0.35)'; wc.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    wc.beginPath();
    wc.moveTo(0, i * 16 + 4);
    wc.bezierCurveTo(32, i * 16, 96, i * 16 + 8, 128, i * 16 + 4);
    wc.stroke();
  }
  const waterTex = new THREE.CanvasTexture(waterCv);
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(10, 20);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(360, WORLD_HALF * 2 + 120),
    new THREE.MeshPhongMaterial({ map: waterTex, color: 0x9fd4e8, transparent: true, opacity: 0.94, shininess: 120 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(WORLD_HALF + 178, -0.45, 0);
  scene.add(water);

  // Facade material library (shared, so the whole city is cheap to draw).
  const facades = PALETTE.map((col) => {
    const { map, emissiveMap } = facadePair(col, rng);
    return new THREE.MeshStandardMaterial({
      map, emissiveMap, emissive: 0xffb35c, emissiveIntensity: 0.5, roughness: 0.9,
    });
  });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x6b5d54, roughness: 1 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  function building(cx, cz, w, d, h, matIdx) {
    const m = facades[matIdx % facades.length];
    const mesh = new THREE.Mesh(boxGeo, [m, m, roofMat, roofMat, m, m]);
    mesh.scale.set(w, h, d);
    mesh.position.set(cx, h / 2, cz);
    scene.add(mesh);
    addCollider(cx, cz, w, d);
    return mesh;
  }

  // Landmarks sit on reserved blocks; the generator skips those blocks.
  const landmarks = {
    police: { x: -220, z: -60, respawn: new THREE.Vector3(-243, 0, -60) },
    hospital: { x: 180, z: 20, respawn: new THREE.Vector3(157, 0, 20) },
    casino: { x: 252, z: 140 },
    dockGarage: { x: 258, z: -222 },
    pierEnd: new THREE.Vector3(322, 0, -222),
  };
  const reserved = new Set(['-220,-60', '180,20']);

  for (const bx of BLOCK_CENTERS) for (const bz of BLOCK_CENTERS) {
    if (reserved.has(`${bx},${bz}`)) continue;
    const distC = Math.hypot(bx, bz);
    const tall = Math.max(0.25, 1 - distC / 420);       // taller near the centre
    const layout = rng();
    if (layout < 0.4) {                                  // one tower per block
      const w = 20 + rng() * 10, d = 20 + rng() * 10;
      building(bx + (rng() - 0.5) * 6, bz + (rng() - 0.5) * 6, w, d, 14 + rng() * 46 * tall + 8, Math.floor(rng() * facades.length));
    } else {                                             // four smaller blocks
      for (const ox of [-15, 15]) for (const oz of [-15, 15]) {
        if (rng() < 0.14) continue;
        const w = 13 + rng() * 8, d = 13 + rng() * 8;
        building(bx + ox + (rng() - 0.5) * 3, bz + oz + (rng() - 0.5) * 3, w, d, 7 + rng() * 22 * tall + 5, Math.floor(rng() * facades.length));
      }
    }
  }

  // Police station: a stout blue-grey block with a lighter band and a sign.
  {
    const m = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x5b7fa6, roughness: 0.85 }));
    m.scale.set(30, 13, 30); m.position.set(-220, 6.5, -60); scene.add(m);
    addCollider(-220, -60, 30, 30);
    const sign = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x1d3fbf, emissive: 0x2a55ff, emissiveIntensity: 0.7 }));
    sign.scale.set(12, 2, 0.6); sign.position.set(-220, 11, -44.6); scene.add(sign);
  }
  // Hospital: white tower, red cross on the roof edge.
  {
    const m = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xf4f6f6, roughness: 0.8 }));
    m.scale.set(28, 22, 28); m.position.set(180, 11, 20); scene.add(m);
    addCollider(180, 20, 28, 28);
    const crossMat = new THREE.MeshStandardMaterial({ color: 0xd23b3b, emissive: 0x881111, emissiveIntensity: 0.4 });
    const v = new THREE.Mesh(boxGeo, crossMat); v.scale.set(2, 7, 0.6); v.position.set(180, 19, 5.6);
    const hbar = new THREE.Mesh(boxGeo, crossMat); hbar.scale.set(7, 2, 0.6); hbar.position.set(180, 19, 5.6);
    scene.add(v, hbar);
  }
  // Casino: tall gold tower on the beachfront lot with a neon crown.
  {
    const m = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x8e6cc8, roughness: 0.7 }));
    m.scale.set(26, 34, 26); m.position.set(258, 17, 140); scene.add(m);
    addCollider(258, 140, 26, 26);
    const crown = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffaa00, emissiveIntensity: 1.4 }));
    crown.scale.set(28, 2.4, 28); crown.position.set(258, 35.2, 140); scene.add(crown);
  }
  // Dock garage: an open-fronted shed the player delivers cars into.
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0x7d8590, roughness: 0.95 });
    const mk = (x, z, w, d, h, y) => { const s = new THREE.Mesh(boxGeo, mat); s.scale.set(w, h, d); s.position.set(x, y, z); scene.add(s); };
    mk(258, -240, 34, 1.2, 7, 3.5);            // back wall
    mk(241.5, -222, 1.2, 36, 7, 3.5);          // west wall
    mk(274.5, -222, 1.2, 36, 7, 3.5);          // east wall
    mk(258, -222, 34, 37, 0.8, 7.2);           // roof slab
    addCollider(258, -240.6, 34, 1.2); addCollider(241, -222, 1.2, 36); addCollider(275, -222, 1.2, 36);
    // Wooden pier reaching into the sea.
    const wood = new THREE.MeshStandardMaterial({ color: 0x9a7648, roughness: 1 });
    const pier = new THREE.Mesh(boxGeo, wood); pier.scale.set(52, 0.7, 8); pier.position.set(308, 0.35, -222); scene.add(pier);
    for (let x = 288; x <= 330; x += 10) for (const oz of [-3.4, 3.4]) {
      const post = new THREE.Mesh(boxGeo, wood); post.scale.set(0.7, 1.6, 0.7); post.position.set(x, -0.3, -222 + oz); scene.add(post);
    }
  }

  // Palms: a double row down the beach, clusters in the park-like blocks,
  // and a loose scatter along the southern promenade.
  const palmSpots = [];
  for (let z = -284; z <= 284; z += 19 + rng() * 8) {
    palmSpots.push([236 + rng() * 4, z]);
    if (rng() < 0.6) palmSpots.push([268 + rng() * 14, z + 8]);
  }
  for (const bx of BLOCK_CENTERS) for (const bz of BLOCK_CENTERS) {
    if (rng() < 0.5) palmSpots.push([bx + (rng() - 0.5) * 44, bz + 29 + rng() * 3]);
  }
  scatterPalms(scene, rng, palmSpots);

  // Street lamps at every other intersection (emissive heads; the scene is
  // lit by the sun + hemisphere, lamps are set dressing).
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.2, 5);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.8 });
  const headGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffc46b, emissiveIntensity: 1.6 });
  ROADS.forEach((rx, i) => ROADS.forEach((rz, j) => {
    if ((i + j) % 2) return;
    const lamp = new THREE.Group();
    const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.y = 2.6;
    const head = new THREE.Mesh(headGeo, headMat); head.position.y = 5.3;
    lamp.add(pole, head);
    lamp.position.set(rx + ROAD_HALF + 2.2, 0, rz + ROAD_HALF + 2.2);
    scene.add(lamp);
  }));

  // Beach umbrellas.
  const umbCols = [0xe74c3c, 0xf39c12, 0x2e86de, 0xee5a6f];
  for (let i = 0; i < 12; i++) {
    const z = -260 + i * 44 + rng() * 16, x = 252 + rng() * 26;
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5), poleMat);
    pole.position.y = 1.1;
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: umbCols[i % umbCols.length], roughness: 0.9, flatShading: true }));
    top.position.y = 2.3;
    g.add(pole, top); g.position.set(x, 0, z);
    scene.add(g);
  }

  return {
    colliders,
    landmarks,
    waterTex,
    update(dt, t) {
      waterTex.offset.x = (t * 0.014) % 1;
      waterTex.offset.y = Math.sin(t * 0.4) * 0.01;
      water.position.y = -0.45 + Math.sin(t * 0.7) * 0.05;
    },
  };
}

// ------------------------------------------------------------ collisions
// Push a circle (pos, radius) out of every building AABB it overlaps.
export function resolveCircle(pos, radius, colliders) {
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    const nx = Math.max(b.x0, Math.min(pos.x, b.x1));
    const nz = Math.max(b.z0, Math.min(pos.z, b.z1));
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = nx + (dx / d) * radius;
      pos.z = nz + (dz / d) * radius;
    } else {
      // Centre inside the box: leave by the shallowest face.
      const left = pos.x - b.x0, right = b.x1 - pos.x, top = pos.z - b.z0, bot = b.z1 - pos.z;
      const m = Math.min(left, right, top, bot);
      if (m === left) pos.x = b.x0 - radius;
      else if (m === right) pos.x = b.x1 + radius;
      else if (m === top) pos.z = b.z0 - radius;
      else pos.z = b.z1 + radius;
    }
  }
  pos.x = Math.max(-WORLD_HALF - 40, Math.min(WORLD_HALF + 60, pos.x));
  pos.z = Math.max(-WORLD_HALF - 6, Math.min(WORLD_HALF + 6, pos.z));
  return pos;
}

// Is the straight line a->b blocked by any building? (Cheap line-of-sight
// for gunfire and police spotting; sample-based, buildings are chunky.)
export function segmentBlocked(a, b, colliders) {
  const steps = Math.max(2, Math.ceil(a.distanceTo(b) / 3));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    for (let j = 0; j < colliders.length; j++) {
      const bb = colliders[j];
      if (x > bb.x0 && x < bb.x1 && z > bb.z0 && z < bb.z1) return true;
    }
  }
  return false;
}
