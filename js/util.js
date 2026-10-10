'use strict';
// ============ 基础工具 ============
const TILE = 16;
const TAU = Math.PI * 2;

const rand = (a, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const chance = p => Math.random() < p;
const choice = arr => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const dist2 = (ax, ay, bx, by) => (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
const angDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
};
const approach = (v, t, s) => (v < t ? Math.min(v + s, t) : Math.max(v - s, t));
const easeOut = t => 1 - (1 - t) ** 3;
const easeIn = t => t * t * t;
const easeOutBack = t => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// list: [[item, weight], ...]
function weightedPick(list) {
  let total = 0;
  for (const [, w] of list) total += w;
  let r = Math.random() * total;
  for (const [it, w] of list) {
    if ((r -= w) <= 0) return it;
  }
  return list[list.length - 1][0];
}

// 确定性哈希噪声 (0..1)
function hash2(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

const _rgbCache = new Map();
function hexToRgb(hex) {
  let v = _rgbCache.get(hex);
  if (v) return v;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  _rgbCache.set(hex, v);
  return v;
}
const toHex = (r, g, b) =>
  '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return toHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}
// amt > 0 提亮, amt < 0 压暗
function shadeHex(hex, amt) {
  return amt >= 0 ? mixHex(hex, '#ffffff', amt) : mixHex(hex, '#000000', -amt);
}

// ============ 输入 ============
const Input = (() => {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { sx: 0, sy: 0, left: false, right: false, leftPressed: false, rightPressed: false, leftReleased: false, moved: false };
  let wheel = 0;

  addEventListener('keydown', e => {
    if (!keys.has(e.code)) pressed.add(e.code);
    keys.add(e.code);
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => {
    keys.clear();
    mouse.left = mouse.right = false;
  });
  addEventListener('mousemove', e => {
    mouse.sx = e.clientX;
    mouse.sy = e.clientY;
    mouse.moved = true;
  });
  addEventListener('mousedown', e => {
    if (e.button === 0) { mouse.left = true; mouse.leftPressed = true; }
    if (e.button === 2) { mouse.right = true; mouse.rightPressed = true; }
  });
  addEventListener('mouseup', e => {
    if (e.button === 0) { mouse.left = false; mouse.leftReleased = true; }
    if (e.button === 2) mouse.right = false;
  });
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('wheel', e => { wheel += Math.sign(e.deltaY); }, { passive: true });

  return {
    mouse,
    down: c => keys.has(c),
    hit: c => pressed.has(c),
    anyHit: () => pressed.size > 0 || mouse.leftPressed,
    wheel: () => wheel,
    endFrame() {
      pressed.clear();
      mouse.leftPressed = mouse.rightPressed = mouse.leftReleased = false;
      wheel = 0;
    },
  };
})();
