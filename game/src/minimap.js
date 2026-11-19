// minimap.js — the circular radar in the corner. North-up, world scaled
// to fit: roads as pale lines on dark glass, the sea as a blue wash on the
// east edge, traffic as grey dots, police as flashing red/blue blips, the
// objective as a pulsing gold diamond, and the player as a white arrow
// turned to their heading.

import { ROADS, WORLD_HALF } from './city.js';

let cv = null, ctx = null;
const SIZE = 184;

export function initMinimap() {
  cv = document.getElementById('minimap');
  if (!cv) return;
  cv.width = SIZE; cv.height = SIZE;
  ctx = cv.getContext('2d');
}

export function drawMinimap(G) {
  if (!ctx) return;
  const c = ctx, mid = SIZE / 2;
  const k = SIZE / (WORLD_HALF * 2 + 40);        // world metres -> px
  const px = (x) => mid + x * k;
  const pz = (z) => mid + z * k;

  c.clearRect(0, 0, SIZE, SIZE);
  c.save();
  c.beginPath(); c.arc(mid, mid, mid - 2, 0, Math.PI * 2); c.clip();
  c.fillStyle = 'rgba(16,26,22,0.88)';
  c.fillRect(0, 0, SIZE, SIZE);
  // Sea.
  c.fillStyle = 'rgba(46,126,168,0.75)';
  c.fillRect(px(WORLD_HALF), 0, SIZE - px(WORLD_HALF), SIZE);
  // Beach.
  c.fillStyle = 'rgba(233,212,156,0.5)';
  c.fillRect(px(232), 0, px(WORLD_HALF) - px(232), SIZE);
  // Roads.
  c.strokeStyle = 'rgba(220,224,228,0.55)';
  c.lineWidth = Math.max(1.4, 16 * k);
  for (const r of ROADS) {
    c.beginPath(); c.moveTo(px(r), pz(-WORLD_HALF)); c.lineTo(px(r), pz(WORLD_HALF)); c.stroke();
    c.beginPath(); c.moveTo(px(-WORLD_HALF), pz(r)); c.lineTo(px(WORLD_HALF), pz(r)); c.stroke();
  }
  // Traffic.
  c.fillStyle = 'rgba(200,205,210,0.8)';
  for (const car of G.cars) {
    if (car.kind !== 'traffic') continue;
    const p = car.group.position;
    c.fillRect(px(p.x) - 1, pz(p.z) - 1, 2, 2);
  }
  // Police: alternate red/blue with the flash phase.
  const flashBlue = Math.sin(G.time * 9) > 0;
  for (const car of G.cars) {
    if (car.kind !== 'police') continue;
    const p = car.group.position;
    c.fillStyle = flashBlue ? '#3b82f6' : '#ef4444';
    c.beginPath(); c.arc(px(p.x), pz(p.z), 3, 0, Math.PI * 2); c.fill();
  }
  for (const ped of G.peds) {
    if (ped.role !== 'officer' || ped.state !== 'officer') continue;
    const p = ped.group.position;
    c.fillStyle = flashBlue ? '#ef4444' : '#3b82f6';
    c.beginPath(); c.arc(px(p.x), pz(p.z), 2.2, 0, Math.PI * 2); c.fill();
  }
  // Objective: pulsing gold diamond.
  if (G.objective.pos) {
    const o = G.objective.pos;
    const r = 4 + Math.sin(G.time * 5) * 1.3;
    c.fillStyle = '#ffd23f';
    c.save();
    c.translate(px(o.x), pz(o.z));
    c.rotate(Math.PI / 4);
    c.fillRect(-r / 1.4, -r / 1.4, r * 1.4, r * 1.4);
    c.restore();
  }
  // Player arrow.
  const pp = G.player.group.position;
  const heading = G.player.inCar ? G.player.inCar.heading : G.player.heading;
  c.save();
  c.translate(px(pp.x), pz(pp.z));
  c.rotate(Math.atan2(Math.sin(heading), -Math.cos(heading)));
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.moveTo(0, -6); c.lineTo(4, 5); c.lineTo(0, 2.4); c.lineTo(-4, 5);
  c.closePath(); c.fill();
  c.restore();
  c.restore();
  // Rim.
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.lineWidth = 2;
  c.beginPath(); c.arc(mid, mid, mid - 2, 0, Math.PI * 2); c.stroke();
}
