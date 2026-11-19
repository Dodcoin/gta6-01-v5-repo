// hud.js — everything drawn over the 3D view: health, cash, stars, the
// objective line, contextual prompts, mission banners, Marina's phone
// messages, the BUSTED meter and the mission timer. The DOM lives in
// index.html; this module caches the nodes and writes to them.

import { starDisplay } from './wanted.js';

let el = null;
let bannerTimer = null, phoneTimer = null;

export function initHud() {
  const $ = (id) => document.getElementById(id);
  el = {
    hud: $('hud'), healthFill: $('healthfill'), cash: $('cash'), stars: $('stars'),
    objective: $('objective'), prompt: $('prompt'), banner: $('banner'),
    bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    phone: $('phone'), phoneFrom: $('phone-from'), phoneText: $('phone-text'),
    bustedWrap: $('bustedwrap'), bustedFill: $('bustedfill'),
    timer: $('timer'), crosshair: $('crosshair'), speed: $('speed'),
  };
  return el;
}

export function showBanner(title, sub = '', ms = 3400) {
  if (!el) return;
  el.bannerTitle.textContent = title;
  el.bannerSub.textContent = sub;
  el.banner.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.banner.classList.remove('show'), ms);
}

export function showPhone(from, text, ms = 5200) {
  if (!el) return;
  el.phoneFrom.textContent = from;
  el.phoneText.textContent = text;
  el.phone.classList.add('show');
  clearTimeout(phoneTimer);
  phoneTimer = setTimeout(() => el.phone.classList.remove('show'), ms);
}

export function updateHud(G) {
  if (!el) return;
  const inGame = G.state === 'playing' || G.state === 'paused' || G.shotMode;
  el.hud.style.display = inGame ? 'block' : 'none';
  if (!inGame) return;

  el.healthFill.style.width = `${Math.max(0, Math.min(100, G.player.health))}%`;
  el.healthFill.style.background = G.player.health > 30 ? 'linear-gradient(90deg,#37d67a,#7bed9f)' : 'linear-gradient(90deg,#e84118,#ff6b6b)';
  el.cash.textContent = `$${G.cash.toLocaleString('en-US')}`;
  const s = starDisplay(G);
  el.stars.textContent = '★★★★★'.slice(0, s) + '☆☆☆☆☆'.slice(0, 5 - s);
  el.stars.style.opacity = s > 0 ? '1' : '0.25';

  el.objective.textContent = G.objective.text || '';
  el.objective.style.display = G.objective.text ? 'block' : 'none';

  el.prompt.textContent = G.prompt || '';
  el.prompt.style.display = G.prompt ? 'block' : 'none';

  el.bustedWrap.style.display = G.bustedMeter > 0.02 ? 'block' : 'none';
  el.bustedFill.style.width = `${G.bustedMeter * 100}%`;

  if (G.missionTimer != null && G.missionTimer > 0) {
    const t = Math.ceil(G.missionTimer);
    el.timer.textContent = `⏱ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    el.timer.style.display = 'block';
    el.timer.style.color = t < 20 ? '#ff5a5a' : '#ffd76e';
  } else {
    el.timer.style.display = 'none';
  }

  el.crosshair.style.display = (G.player.aim && !G.player.inCar && G.state === 'playing') ? 'block' : 'none';
  if (G.player.inCar) {
    el.speed.style.display = 'block';
    el.speed.textContent = `${Math.round(Math.abs(G.player.inCar.speed) * 3.6)} km/h`;
  } else {
    el.speed.style.display = 'none';
  }
}
