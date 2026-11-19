// input.js — keyboard + mouse state for Costa Serena.
//
// One shared `input` object is mutated by DOM listeners; the game loop reads
// it every frame. `down` holds the codes currently held, `pressed` holds the
// codes that went down since the last frame (the main loop clears it via
// postUpdate() at the end of each frame, which gives us clean edge triggers
// for things like "press E to enter the car" without any event plumbing in
// the gameplay modules).

export const input = {
  down: new Set(),
  pressed: new Set(),
  mouseDX: 0,
  mouseDY: 0,
  lmb: false,
  rmb: false,
  locked: false,
};

let targetEl = null;

export function initInput(canvas) {
  targetEl = canvas;
  window.addEventListener('keydown', (e) => {
    if (!e.repeat) input.pressed.add(e.code);
    input.down.add(e.code);
    // Keep the page from scrolling on the keys the game uses.
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => input.down.delete(e.code));
  window.addEventListener('blur', () => { input.down.clear(); input.lmb = false; input.rmb = false; });

  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.mouseDX += e.movementX || 0;
    input.mouseDY += e.movementY || 0;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.lmb = true;
    if (e.button === 2) input.rmb = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.lmb = false;
    if (e.button === 2) input.rmb = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function lockPointer() {
  if (targetEl && document.pointerLockElement !== targetEl) {
    try {
      const p = targetEl.requestPointerLock();
      if (p && p.catch) p.catch(() => { /* headless / denied: game still runs */ });
    } catch { /* pointer lock unavailable: mouse-look just stays off */ }
  }
}

export function unlockPointer() {
  if (document.pointerLockElement) document.exitPointerLock();
}

// Consume the accumulated mouse movement (called once per frame by main).
export function takeMouse() {
  const dx = input.mouseDX, dy = input.mouseDY;
  input.mouseDX = 0; input.mouseDY = 0;
  return { dx, dy };
}

export function postUpdate() {
  input.pressed.clear();
}

export function key(code) { return input.down.has(code); }
export function hit(code) { return input.pressed.has(code); }
