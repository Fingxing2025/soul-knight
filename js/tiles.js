'use strict';
// ============ 主题 & 程序化地砖 ============
const WALL_RISE = 10; // 墙顶向上偏移 (3/4 视角)
const WALL_FRONT = 10; // 墙正面高度

const THEMES = {
  forest: {
    name: '幽暗森林', music: 'forest', void: '#0b120e',
    floorStyle: 'grass',
    floor: { base: '#4f8c3b', alt: '#4a8538', dark: '#3d7330', light: '#66a74c', accent: '#8ccc5e', grid: '#3a6a2c' },
    capStyle: 'hedge',
    cap: { base: '#3c7a3a', light: '#5ea24c', dark: '#2a5a2a', deep: '#1c3d1f', edge: '#14261a' },
    front: { base: '#6e6a5c', light: '#918c7a', dark: '#4c483e', mortar: '#38352d', accent: '#4f8a3a' },
    ambient: '#8d92b2', torch: '#ffb35a', torchStyle: 'torch',
    particle: 'firefly', blood: '#3c8a2a',
  },
  ice: {
    name: '冰封雪原', music: 'ice', void: '#0a1018',
    floorStyle: 'ice',
    floor: { base: '#8fbcda', alt: '#88b4d4', dark: '#6e9cc2', light: '#b8dcf0', accent: '#ffffff', grid: '#5f88ae' },
    capStyle: 'snow',
    cap: { base: '#e6f2fc', light: '#ffffff', dark: '#b4cce4', deep: '#8aa8c8', edge: '#2a3a58' },
    front: { base: '#5c8cba', light: '#86b4dc', dark: '#3e6694', mortar: '#2c4a72', accent: '#c8f0ff' },
    ambient: '#8290b4', torch: '#7ad8ff', torchStyle: 'crystal',
    particle: 'snow', blood: '#c0303a',
  },
  lava: {
    name: '熔岩要塞', music: 'lava', void: '#0c0608',
    floorStyle: 'stone',
    floor: { base: '#594b56', alt: '#544651', dark: '#40343e', light: '#6e606e', accent: '#ff7a2a', grid: '#30252e' },
    capStyle: 'stone',
    cap: { base: '#6a5560', light: '#86707c', dark: '#4a3a44', deep: '#352a32', edge: '#140c10' },
    front: { base: '#4a3640', light: '#644a56', dark: '#33242c', mortar: '#22161c', accent: '#ff6a20' },
    ambient: '#a48c9c', torch: '#ff7a3a', torchStyle: 'brazier',
    particle: 'ember', blood: '#b02030',
  },
};

const TileGen = {
  theme: null,
  floorVariants: [],
  capCache: new Map(),
  frontVariants: [],
  setTheme(th) {
    this.theme = th;
    this.capCache.clear();
    this.floorVariants = [];
    for (let v = 0; v < 12; v++) this.floorVariants.push(genFloor(th, v, false), genFloor(th, v, true));
    this.frontVariants = [];
    for (let v = 0; v < 6; v++) this.frontVariants.push(genFront(th, v));
  },
  floor(tx, ty) {
    const v = Math.floor(hash2(tx, ty, 7) * 12);
    const alt = (tx + ty) & 1;
    // 稀有装饰变体概率低
    const vv = hash2(tx, ty, 11) < 0.82 ? v % 4 : v;
    return this.floorVariants[vv * 2 + alt];
  },
  cap(mask, tx, ty) {
    const v = Math.floor(hash2(tx, ty, 3) * 3);
    const key = mask * 4 + v;
    let c = this.capCache.get(key);
    if (!c) {
      c = genCap(this.theme, mask, v);
      this.capCache.set(key, c);
    }
    return c;
  },
  front(tx, ty) {
    const v = hash2(tx, ty, 5) < 0.75 ? Math.floor(hash2(tx, ty, 9) * 3) : 3 + Math.floor(hash2(tx, ty, 13) * 3);
    return this.frontVariants[v];
  },
};

function px(g, x, y, c, w = 1, h = 1) {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
}

function genFloor(th, v, alt) {
  const [c, g] = makeCanvas(TILE, TILE);
  const P = th.floor;
  const base = alt ? P.alt : P.base;
  px(g, 0, 0, base, 16, 16);
  const seed = v * 31 + (alt ? 7 : 0);
  const R = (x, y, s = 0) => hash2(x + seed * 17, y + seed * 23, s + seed);

  if (th.floorStyle === 'grass') {
    // 斑驳草地
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const r = R(x, y);
      if (r < 0.1) px(g, x, y, P.dark);
      else if (r > 0.93) px(g, x, y, P.light);
    }
    // 草叶
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(R(i, 1, 2) * 14) + 1, y = Math.floor(R(i, 2, 2) * 13) + 2;
      px(g, x, y, P.light); px(g, x, y - 1, P.accent);
      px(g, x + 1, y, P.dark);
    }
    // 网格感
    px(g, 0, 15, P.grid, 16, 1); px(g, 15, 0, P.grid, 1, 16);
    px(g, 0, 0, shadeHex(base, 0.06), 15, 1);
    if (v === 4 || v === 5) { // 小花
      const fx = 4 + Math.floor(R(1, 1, 5) * 7), fy = 4 + Math.floor(R(2, 2, 5) * 7);
      const fc = v === 4 ? '#ffe36b' : '#ff8fb8';
      px(g, fx, fy - 1, fc); px(g, fx - 1, fy, fc); px(g, fx + 1, fy, fc); px(g, fx, fy + 1, fc);
      px(g, fx, fy, '#fff6d0');
      px(g, fx + 3, fy + 3, '#ffffff'); px(g, fx + 4, fy + 2, P.accent);
    } else if (v === 6 || v === 7) { // 泥土斑块
      for (let y = 4; y < 12; y++) for (let x = 3; x < 13; x++) {
        const d = Math.hypot(x - 8, (y - 8) * 1.3);
        if (d < 4.5 + R(x, y, 9) * 1.2) px(g, x, y, R(x, y, 4) < 0.3 ? '#6a5236' : '#7c6040');
      }
      px(g, 6, 6, '#9a7a52'); px(g, 9, 9, '#5a4428');
    } else if (v === 8 || v === 9) { // 石子
      for (let i = 0; i < 3; i++) {
        const x = 2 + Math.floor(R(i, 5, 6) * 11), y = 2 + Math.floor(R(i, 6, 6) * 11);
        px(g, x, y, '#9a9a8a', 2, 1); px(g, x, y + 1, '#6a6a5e', 2, 1); px(g, x, y, '#c0c0b0');
      }
    } else if (v >= 10) { // 高草丛
      for (let i = 0; i < 6; i++) {
        const x = 3 + Math.floor(R(i, 8, 7) * 10), y = 6 + Math.floor(R(i, 9, 7) * 7);
        px(g, x, y - 3, P.accent, 1, 3); px(g, x + 1, y - 2, P.light, 1, 2);
      }
    }
  } else if (th.floorStyle === 'ice') {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const r = R(x, y);
      if (r < 0.06) px(g, x, y, P.dark);
      else if (r > 0.95) px(g, x, y, P.light);
    }
    // 斜向反光
    const o = Math.floor(R(3, 3, 1) * 8);
    for (let i = 0; i < 6; i++) { px(g, o + i, 12 - i, P.light); if (i % 2) px(g, o + i + 1, 12 - i, '#e8f6ff'); }
    // 砖缝 + 斜面
    px(g, 0, 15, P.grid, 16, 1); px(g, 15, 0, P.grid, 1, 16);
    px(g, 0, 0, P.light, 15, 1); px(g, 0, 0, P.light, 1, 15);
    px(g, 1, 14, P.dark, 14, 1); px(g, 14, 1, P.dark, 1, 13);
    if (v === 4 || v === 5) { // 冰裂纹
      let x = 3 + Math.floor(R(1, 1, 3) * 4), y = 3;
      for (let i = 0; i < 10; i++) { px(g, x, y, '#6a98c0'); px(g, x + 1, y, '#e8f8ff'); y++; x += R(i, 4, 4) < 0.5 ? 1 : 0; if (y > 13) break; }
    } else if (v === 6 || v === 7) { // 积雪
      for (let y = 3; y < 13; y++) for (let x = 2; x < 14; x++) {
        if (Math.hypot(x - 8, (y - 8) * 1.4) < 4 + R(x, y, 9) * 1.5) px(g, x, y, R(x, y, 4) < 0.2 ? '#d8eaf8' : '#f4faff');
      }
    } else if (v >= 8) {
      for (let i = 0; i < 4; i++) px(g, 2 + Math.floor(R(i, 7, 8) * 12), 2 + Math.floor(R(i, 8, 8) * 12), '#ffffff');
    }
  } else {
    // 石板地面
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const r = R(x, y);
      if (r < 0.1) px(g, x, y, P.dark);
      else if (r > 0.94) px(g, x, y, P.light);
    }
    px(g, 0, 0, P.light, 15, 1); px(g, 0, 0, P.light, 1, 15);
    px(g, 1, 15, P.grid, 15, 1); px(g, 15, 1, P.grid, 1, 15);
    px(g, 1, 14, P.dark, 14, 1); px(g, 14, 1, P.dark, 1, 13);
    if (v === 4 || v === 5 || v === 10) { // 裂缝
      let x = 2 + Math.floor(R(1, 1, 3) * 10), y = 2;
      for (let i = 0; i < 14; i++) {
        px(g, x, y, P.grid);
        if (v === 10) px(g, x + 1, y, P.accent);
        y++; x += R(i, 4, 4) < 0.33 ? 1 : R(i, 4, 5) < 0.5 ? -1 : 0;
        x = clamp(x, 1, 13);
        if (y > 13) break;
      }
    } else if (v === 6 || v === 7) { // 碎石
      for (let i = 0; i < 4; i++) {
        const x = 2 + Math.floor(R(i, 5, 6) * 11), y = 2 + Math.floor(R(i, 6, 6) * 11);
        px(g, x, y, P.light); px(g, x + 1, y + 1, P.grid);
      }
    } else if (v === 8) { // 骷髅
      px(g, 6, 6, '#d8d0c0', 4, 3); px(g, 7, 9, '#d8d0c0', 2, 1);
      px(g, 6, 7, '#2a1e22'); px(g, 9, 7, '#2a1e22');
      px(g, 6, 6, '#f0ead8', 2, 1);
    } else if (v === 11) { // 熔岩缝
      for (let x = 2; x < 14; x++) {
        const y = 8 + Math.round(Math.sin(x * 0.9 + seed) * 1.5);
        px(g, x, y, '#ff8a2a'); px(g, x, y - 1, '#a83a1a');
        if (x % 3 === 0) px(g, x, y, '#ffd060');
      }
    }
  }
  return c;
}

// mask: bit0 上, bit1 右, bit2 下, bit3 左 (邻居是墙)
function genCap(th, mask, v) {
  const [c, g] = makeCanvas(TILE, TILE);
  const P = th.cap;
  const up = mask & 1, right = mask & 2, down = mask & 4, left = mask & 8;
  px(g, 0, 0, P.base, 16, 16);
  const R = (x, y, s = 0) => hash2(x + v * 37, y + v * 53, s + v * 7);

  if (th.capStyle === 'hedge') {
    // 树篱: 叶簇
    for (let i = 0; i < 22; i++) {
      const x = Math.floor(R(i, 0, 1) * 16), y = Math.floor(R(i, 1, 1) * 16);
      const col = R(i, 2, 1) < 0.5 ? P.light : P.dark;
      px(g, x, y, col, 2, 2);
      px(g, x, y + 2, P.deep, 2, 1);
      if (col === P.light) px(g, x, y, '#7cc060');
    }
    for (let i = 0; i < 6; i++) px(g, Math.floor(R(i, 5, 3) * 15), Math.floor(R(i, 6, 3) * 15), '#8fd468');
  } else if (th.capStyle === 'snow') {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const r = R(x, y);
      if (r < 0.07) px(g, x, y, P.dark);
      else if (r > 0.9) px(g, x, y, P.light);
    }
    for (let i = 0; i < 3; i++) {
      const x = Math.floor(R(i, 3, 2) * 12) + 2, y = Math.floor(R(i, 4, 2) * 12) + 2;
      px(g, x, y, P.light, 3, 1); px(g, x, y + 1, P.dark, 3, 1);
    }
  } else {
    // 石砖顶面
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const r = R(x, y);
      if (r < 0.1) px(g, x, y, P.dark);
      else if (r > 0.92) px(g, x, y, P.light);
    }
    px(g, 0, 7, P.deep, 16, 1);
    px(g, v * 4 + 3, 0, P.deep, 1, 7);
    px(g, (v * 4 + 10) % 16, 8, P.deep, 1, 8);
    px(g, 0, 8, P.light, 16, 1);
  }

  // 边缘 (没有墙相邻的一侧描边 + 高光)
  const E = P.edge;
  if (!up) { px(g, 0, 0, E, 16, 1); px(g, 0, 1, P.light, 16, 1); }
  if (!left) { px(g, 0, 0, E, 1, 16); px(g, 1, up ? 0 : 1, shadeHex(P.base, 0.15), 1, 16); }
  if (!right) { px(g, 15, 0, E, 1, 16); px(g, 14, 0, P.dark, 1, 16); }
  if (!down) { px(g, 0, 15, P.deep, 16, 1); }
  // 外角
  if (!up && !left) px(g, 1, 1, E);
  if (!up && !right) px(g, 14, 1, E);
  return c;
}

function genFront(th, v) {
  const [c, g] = makeCanvas(TILE, WALL_FRONT);
  const P = th.front;
  px(g, 0, 0, P.base, 16, WALL_FRONT);
  const R = (x, y, s = 0) => hash2(x + v * 41, y + v * 19, s + v * 3);
  // 砖块
  const rowsY = [0, 5];
  rowsY.forEach((ry, ri) => {
    const off = ri % 2 ? 4 : 0;
    px(g, 0, ry + 4, P.mortar, 16, 1);
    for (let bx = -off; bx < 16; bx += 8) {
      px(g, bx + 7 < 0 ? 0 : bx + 7, ry, P.mortar, 1, 4);
      // 砖面高光与阴影
      const x0 = Math.max(0, bx), x1 = Math.min(16, bx + 7);
      if (x1 > x0) {
        px(g, x0, ry, P.light, x1 - x0, 1);
        px(g, x0, ry + 3, P.dark, x1 - x0, 1);
      }
    }
  });
  for (let y = 0; y < WALL_FRONT; y++) for (let x = 0; x < 16; x++) {
    if (R(x, y) < 0.06) px(g, x, y, P.dark);
  }
  // 底部渐暗
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, WALL_FRONT - 2, 16, 2);
  // 顶部唇边阴影
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 0, 16, 1);

  if (v >= 3) {
    if (th.floorStyle === 'grass') { // 苔藓垂落
      for (let i = 0; i < 4; i++) {
        const x = Math.floor(R(i, 1, 4) * 15);
        const len = 2 + Math.floor(R(i, 2, 4) * 5);
        px(g, x, 0, P.accent, 1, len);
        px(g, x + 1, 0, '#3a6a2c', 1, Math.max(1, len - 2));
        px(g, x, len - 1, '#6aa84a');
      }
    } else if (th.floorStyle === 'ice') { // 冰锥
      for (let i = 0; i < 3; i++) {
        const x = 2 + Math.floor(R(i, 1, 4) * 12);
        const len = 3 + Math.floor(R(i, 2, 4) * 5);
        for (let k = 0; k < len; k++) px(g, x, k, k < len - 1 ? P.accent : '#ffffff', k < len / 2 ? 2 : 1, 1);
      }
    } else { // 熔岩裂纹
      let x = 3 + Math.floor(R(1, 1, 4) * 10);
      for (let y = 0; y < WALL_FRONT; y++) {
        px(g, x, y, P.accent);
        if (y % 3 === 0) px(g, x, y, '#ffd060');
        x += R(y, 3, 4) < 0.4 ? 1 : R(y, 3, 6) < 0.5 ? -1 : 0;
      }
    }
  }
  return c;
}
