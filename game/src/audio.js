// audio.js — all of Costa Serena's sound is synthesized with WebAudio.
// No audio files: an engine hum whose pitch follows the car's speed, a
// two-tone police siren, noise-burst gunshots, thuds, chimes and a slow
// pentatonic arpeggio that stands in for ambient music. The context is
// created lazily on the first user gesture (browsers refuse it earlier).

let ctx = null;
let master = null;
let muted = false;
let engineOsc = null, engineGain = null, engineFilter = null;
let sirenOsc = null, sirenGain = null, sirenLfo = null;
let musicTimer = null, musicStep = 0;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.55;
  master.connect(ctx.destination);

  // Engine: a detuned saw pair through a lowpass, gain driven per-frame.
  engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
  const engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'square'; engineOsc2.frequency.value = 28;
  engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 420;
  engineGain = ctx.createGain(); engineGain.gain.value = 0;
  engineOsc.connect(engineFilter); engineOsc2.connect(engineFilter);
  engineFilter.connect(engineGain); engineGain.connect(master);
  engineOsc.start(); engineOsc2.start();

  // Siren: triangle wave whose frequency is wobbled by an LFO between the
  // classic 700 Hz / 950 Hz pair; gain follows the nearest police car.
  sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 820;
  sirenLfo = ctx.createOscillator(); sirenLfo.type = 'square'; sirenLfo.frequency.value = 0.7;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = 130;
  sirenLfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
  sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
  sirenOsc.connect(sirenGain); sirenGain.connect(master);
  sirenOsc.start(); sirenLfo.start();

  startMusic();
}

function startMusic() {
  if (musicTimer) return;
  // A lazy tropical arpeggio: C major pentatonic over a soft sine, one note
  // every 340 ms, with a low root note every eight steps.
  const scale = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3];
  const pattern = [0, 2, 4, 3, 5, 4, 2, 1, 0, 2, 4, 6, 5, 4, 3, 2];
  musicTimer = setInterval(() => {
    if (!ctx || muted || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const note = ctx.createOscillator(); note.type = 'sine';
    note.frequency.value = scale[pattern[musicStep % pattern.length] % scale.length];
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.045, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    note.connect(g); g.connect(master);
    note.start(t); note.stop(t + 0.55);
    if (musicStep % 8 === 0) {
      const bass = ctx.createOscillator(); bass.type = 'sine'; bass.frequency.value = 130.8;
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.05, t);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      bass.connect(bg); bg.connect(master);
      bass.start(t); bass.stop(t + 2.5);
    }
    musicStep++;
  }, 340);
}

// Per-frame levels: engine loudness/pitch from the driven car, siren
// loudness from the closest police unit (0 when nobody is chasing).
export function updateAudio(engine01, engineOn, siren01) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const eg = engineOn ? 0.05 + engine01 * 0.11 : 0;
  engineGain.gain.setTargetAtTime(eg, t, 0.08);
  engineOsc.frequency.setTargetAtTime(52 + engine01 * 165, t, 0.06);
  engineFilter.frequency.setTargetAtTime(300 + engine01 * 900, t, 0.1);
  sirenGain.gain.setTargetAtTime(Math.min(0.09, siren01 * 0.09), t, 0.15);
}

function noiseBurst(dur, freq, gainVal) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = gainVal;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
}

function blip(freq, dur, gainVal, type = 'sine', when = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gainVal, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

export function sfxGunshot() { noiseBurst(0.16, 2600, 0.5); blip(150, 0.1, 0.25, 'square'); }
export function sfxEnemyShot() { noiseBurst(0.12, 1800, 0.16); }
export function sfxThud() { noiseBurst(0.1, 300, 0.4); blip(70, 0.12, 0.3, 'sine'); }
export function sfxCrash() { noiseBurst(0.3, 700, 0.45); blip(90, 0.25, 0.3, 'triangle'); }
export function sfxChime() { blip(880, 0.18, 0.16); blip(1318, 0.3, 0.16, 'sine', 0.09); }
export function sfxDoor() { blip(220, 0.07, 0.12, 'square'); noiseBurst(0.05, 900, 0.08); }
export function sfxJingle() {
  [523.3, 659.3, 784.0, 1046.5].forEach((f, i) => blip(f, 0.35, 0.15, 'triangle', i * 0.11));
}
export function sfxFail() { blip(220, 0.3, 0.15, 'sawtooth'); blip(174, 0.45, 0.15, 'sawtooth', 0.16); }

export function toggleMute() {
  muted = !muted;
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.03);
  return muted;
}
export function isMuted() { return muted; }
