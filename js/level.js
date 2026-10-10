'use strict';
// ============ 关卡生成: 房间网格 + 走廊 + 门 + 道具 ============
const T_VOID = 0, T_FLOOR = 1, T_WALL = 2, T_DOOR = 3;
const PITCH = 26;
const DIRS = [[0, -1, 'n'], [1, 0, 'e'], [0, 1, 's'], [-1, 0, 'w']];

class Room {
  constructor(gx, gy, type) {
    this.gx = gx; this.gy = gy; this.type = type;
    const sizes = {
      start: [9, 9], chest: [9, 9], end: [9, 9], boss: [21, 17],
      combat: [choice([13, 15, 17]), choice([11, 13, 15])],
    };
    [this.w, this.h] = sizes[type];
    this.x = gx * PITCH + Math.floor((PITCH - this.w) / 2);
    this.y = gy * PITCH + Math.floor((PITCH - this.h) / 2);
    this.ctx = this.x + (this.w - 1) / 2; // 中心格
    this.cty = this.y + (this.h - 1) / 2;
    this.cx = this.ctx * TILE + 8;
    this.cy = this.cty * TILE + 8;
    this.links = {};
    this.doors = [];
    this.state = type === 'combat' || type === 'boss' ? 'idle' : 'cleared';
    this.visited = false;
    this.seen = false;
    this.waves = [];
    this.gate = 0; // 门动画 0 开 1 关
  }
  contains(px, py, margin = 0) {
    return px >= this.x * TILE + margin && px <= (this.x + this.w) * TILE - margin &&
      py >= this.y * TILE + margin && py <= (this.y + this.h) * TILE - margin;
  }
  get locked() { return this.state === 'active'; }
}

const PROP_SHAKE = 0.15;

class Prop {
  constructor(tx, ty, kind) {
    this.tx = tx; this.ty = ty; this.kind = kind;
    this.x = tx * TILE + 8; this.y = ty * TILE + 15;
    this.hp = { crate: 6, barrel: 8, pot: 2, xbarrel: 4 }[kind];
    this.flash = 0;
    this.shake = 0;
  }
  get spr() { return SPR[this.kind]; }
  hit(dmg, level = Game.level) {
    this.hp -= dmg;
    this.flash = 0.08;
    this.shake = PROP_SHAKE;
    level.hitProps.add(this);
    if (this.hp <= 0) this.breakProp(level);
  }
  // 返回 false 表示受击动画结束
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.shake = Math.max(0, this.shake - dt);
    return this.flash > 0 || this.shake > 0;
  }
  breakProp(level) {
    level.props[level.idx(this.tx, this.ty)] = null;
    const pal = {
      crate: ['#d69a5c', '#a86e3c', '#74482a', '#f0c08a'],
      barrel: ['#c88a50', '#9a6236', '#643c20', '#8c93a4'],
      xbarrel: ['#ff6a5a', '#d23a3a', '#7a1a22', '#8c93a4'],
      pot: ['#e8a46a', '#b8693a', '#7a3e22', '#ffd0a0'],
    }[this.kind];
    FX.debris(this.x, this.y - 6, pal, this.kind === 'pot' ? 9 : 12, 80);
    FX.smoke(this.x, this.y - 6, 3, { alpha: 0.4 });
    Sfx.play('poof');
    if (this.kind === 'xbarrel') {
      Game.explode(this.x, this.y - 6, 38, 6, 'neutral');
    } else if (chance(0.3)) {
      Game.dropLoot(this.x, this.y - 4, chance(0.5) ? 'coin' : 'energy', randi(1, 3));
    }
  }
  draw(g) {
    // 受击: 左右抖动 + 轻微压扁, 随时间衰减
    const k = this.shake / PROP_SHAKE;
    const sh = k > 0 ? Math.sin(this.shake * 90) * 1.2 * k : 0;
    const sq = k * 0.12;
    drawShadow(g, this.x, this.y - 1, 6, 2.5);
    drawSpr(g, this.spr, this.x + sh, this.y + 1, { flash: this.flash > 0, sx: 1 + sq, sy: 1 - sq });
  }
}

class Level {
  constructor(num, themeKey) {
    this.num = num;
    this.theme = THEMES[themeKey];
    this.themeKey = themeKey;
    this.grid = 4;
    this.W = this.grid * PITCH;
    this.H = this.grid * PITCH;
    this.tiles = new Uint8Array(this.W * this.H);
    this.props = new Array(this.W * this.H).fill(null);
    this.doorOwner = new Map();
    this.rooms = [];
    this.links = [];
    this.torches = [];
    this.lavaLights = [];
    this.hitProps = new Set(); // 正在播放受击动画的道具
    TileGen.setTheme(this.theme);
    this.generate();
    this.bake();
  }

  idx(tx, ty) { return ty * this.W + tx; }
  tile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return T_VOID;
    return this.tiles[ty * this.W + tx];
  }
  isWall(tx, ty) { return this.tile(tx, ty) === T_WALL; }
  doorClosed(tx, ty) {
    const r = this.doorOwner.get(this.idx(tx, ty));
    return r ? r.gate > 0.35 : false;
  }
  solid(tx, ty) {
    const t = this.tile(tx, ty);
    if (t === T_WALL || t === T_VOID) return true;
    if (t === T_DOOR && this.doorClosed(tx, ty)) return true;
    return !!this.props[ty * this.W + tx];
  }
  // 子弹: 不被道具挡 (单独判定)
  solidNoProp(tx, ty) {
    const t = this.tile(tx, ty);
    if (t === T_WALL || t === T_VOID) return true;
    return t === T_DOOR && this.doorClosed(tx, ty);
  }
  solidPx(x, y) { return this.solid(Math.floor(x / TILE), Math.floor(y / TILE)); }
  propAtPx(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return null;
    return this.props[ty * this.W + tx];
  }
  roomAt(px, py, margin = 0) {
    for (const r of this.rooms) if (r.contains(px, py, margin)) return r;
    return null;
  }

  // 视线检测
  los(ax, ay, bx, by) {
    const d = dist(ax, ay, bx, by);
    const n = Math.ceil(d / 6);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = lerp(ax, bx, t), y = lerp(ay, by, t);
      if (this.solidNoProp(Math.floor(x / TILE), Math.floor(y / TILE))) return false;
    }
    return true;
  }

  generate() {
    const n = this.num;
    const combatCount = n === 1 ? 3 : n === 2 ? 4 : 2;
    const pathLen = combatCount + 2;
    let path = null;
    for (let tries = 0; tries < 200 && !path; tries++) path = this.walk(pathLen);
    const cell = new Map();
    const key = (x, y) => x + ',' + y;
    path.forEach(([gx, gy], i) => {
      const type = i === 0 ? 'start' : i === path.length - 1 ? (n === 3 ? 'boss' : 'end') : 'combat';
      const r = new Room(gx, gy, type);
      this.rooms.push(r);
      cell.set(key(gx, gy), r);
      if (i > 0) this.connect(cell.get(key(...path[i - 1])), r);
    });
    // 分支: 宝箱房 (+ 额外战斗房)
    const branches = n === 2 ? ['chest', 'combat'] : ['chest'];
    for (const type of branches) {
      const cands = shuffle(this.rooms.filter(r => r.type === 'combat' || (type === 'chest' && r.type === 'start')));
      let placed = false;
      for (const r of cands) {
        for (const [dx, dy] of shuffle(DIRS.slice())) {
          const gx = r.gx + dx, gy = r.gy + dy;
          if (gx < 0 || gy < 0 || gx >= this.grid || gy >= this.grid || cell.has(key(gx, gy))) continue;
          const nr = new Room(gx, gy, type);
          this.rooms.push(nr);
          cell.set(key(gx, gy), nr);
          this.connect(r, nr);
          placed = true;
          break;
        }
        if (placed) break;
      }
    }

    // 雕刻房间
    for (const r of this.rooms) {
      for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
        const border = x === r.x - 1 || y === r.y - 1 || x === r.x + r.w || y === r.y + r.h;
        this.tiles[this.idx(x, y)] = border ? T_WALL : T_FLOOR;
      }
    }
    // 走廊
    for (const [a, b, dir] of this.links) this.carveCorridor(a, b, dir);

    for (const r of this.rooms) {
      this.decorate(r);
      this.placeTorches(r);
      if (r.type === 'boss') {
        for (const [dx, dy] of [[2, 2], [r.w - 3, 2], [2, r.h - 3], [r.w - 3, r.h - 3]]) {
          const tx = r.x + dx, ty = r.y + dy;
          this.tiles[this.idx(tx, ty)] = T_WALL;
          this.torches.push({ tx, ty, x: tx * TILE + 8, y: ty * TILE + 10, phase: rand(TAU) });
        }
        this.torchSet = new Set(this.torches.map(t => this.idx(t.tx, t.ty)));
      }
    }
    this.start = this.rooms[0];
  }

  walk(len) {
    const g = this.grid;
    const sx = randi(0, g - 1), sy = randi(0, g - 1);
    const path = [[sx, sy]];
    const used = new Set([sx + ',' + sy]);
    while (path.length < len) {
      const [cx, cy] = path[path.length - 1];
      const opts = DIRS.map(([dx, dy]) => [cx + dx, cy + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < g && y < g && !used.has(x + ',' + y));
      if (!opts.length) return null;
      const nxt = choice(opts);
      path.push(nxt);
      used.add(nxt[0] + ',' + nxt[1]);
    }
    return path;
  }

  connect(a, b) {
    const dx = b.gx - a.gx, dy = b.gy - a.gy;
    const d = DIRS.find(([x, y]) => x === dx && y === dy)[2];
    const opp = { n: 's', s: 'n', e: 'w', w: 'e' }[d];
    a.links[d] = b;
    b.links[opp] = a;
    this.links.push([a, b, d]);
  }

  carveCorridor(a, b, dir) {
    const set = (x, y, t) => { this.tiles[this.idx(x, y)] = t; };
    const wallIfVoid = (x, y) => { if (this.tile(x, y) === T_VOID) set(x, y, T_WALL); };
    if (dir === 'e' || dir === 'w') {
      const [L, R] = dir === 'e' ? [a, b] : [b, a];
      const cy = L.cty;
      const x0 = L.x + L.w, x1 = R.x - 1;
      for (let x = x0; x <= x1; x++) {
        for (let y = cy - 1; y <= cy + 1; y++) set(x, y, T_FLOOR);
        wallIfVoid(x, cy - 2); wallIfVoid(x, cy + 2);
      }
      for (let y = cy - 1; y <= cy + 1; y++) {
        this.addDoor(L, x0, y); this.addDoor(R, x1, y);
      }
    } else {
      const [T, B] = dir === 's' ? [a, b] : [b, a];
      const cx = T.ctx;
      const y0 = T.y + T.h, y1 = B.y - 1;
      for (let y = y0; y <= y1; y++) {
        for (let x = cx - 1; x <= cx + 1; x++) set(x, y, T_FLOOR);
        wallIfVoid(cx - 2, y); wallIfVoid(cx + 2, y);
      }
      for (let x = cx - 1; x <= cx + 1; x++) {
        this.addDoor(T, x, y0); this.addDoor(B, x, y1);
      }
    }
  }

  addDoor(room, x, y) {
    this.tiles[this.idx(x, y)] = T_DOOR;
    room.doors.push([x, y]);
    this.doorOwner.set(this.idx(x, y), room);
  }

  decorate(r) {
    if (r.type !== 'combat') return;
    const free = (x, y) => this.tile(x, y) === T_FLOOR && !this.props[this.idx(x, y)] &&
      Math.abs(x - r.ctx) > 1 && Math.abs(y - r.cty) > 1;
    const layout = choice(['pillars', 'blocks', 'crates', 'mixed']);
    const putWall = (x, y) => { if (free(x, y)) this.tiles[this.idx(x, y)] = T_WALL; };
    const putProp = (x, y, k) => { if (free(x, y) && this.tile(x, y) === T_FLOOR) this.props[this.idx(x, y)] = new Prop(x, y, k); };
    const X0 = r.x, Y0 = r.y, X1 = r.x + r.w - 1, Y1 = r.y + r.h - 1;
    if (layout === 'pillars' || layout === 'mixed') {
      const ox = 3, oy = 3;
      putWall(X0 + ox, Y0 + oy); putWall(X1 - ox, Y0 + oy);
      putWall(X0 + ox, Y1 - oy); putWall(X1 - ox, Y1 - oy);
    }
    if (layout === 'blocks') {
      const bx = r.ctx - 3, by = r.cty - 2;
      putWall(bx, by); putWall(bx - 1, by); putWall(bx, by - 1);
      putWall(r.ctx + 3, r.cty + 2); putWall(r.ctx + 4, r.cty + 2); putWall(r.ctx + 3, r.cty + 3);
    }
    if (layout === 'crates' || layout === 'mixed' || layout === 'blocks') {
      const corners = [[X0 + 1, Y0 + 1, 1, 1], [X1 - 1, Y0 + 1, -1, 1], [X0 + 1, Y1 - 1, 1, -1], [X1 - 1, Y1 - 1, -1, -1]];
      for (const [cx, cy, sx, sy] of shuffle(corners).slice(0, layout === 'crates' ? 4 : 2)) {
        putProp(cx, cy, 'crate');
        if (chance(0.7)) putProp(cx + sx, cy, chance(0.5) ? 'crate' : 'barrel');
        if (chance(0.6)) putProp(cx, cy + sy, chance(0.5) ? 'pot' : 'barrel');
      }
    }
    // 沿墙随机罐子/炸药桶
    for (let i = 0; i < 5; i++) {
      const side = randi(0, 3);
      const x = side < 2 ? randi(X0, X1) : side === 2 ? X0 : X1;
      const y = side >= 2 ? randi(Y0, Y1) : side === 0 ? Y0 : Y1;
      putProp(x, y, chance(0.25) ? 'xbarrel' : chance(0.5) ? 'pot' : 'barrel');
    }
  }

  placeTorches(r) {
    const ty = r.y - 1;
    const doorXs = new Set(r.doors.filter(([, y]) => y === ty).map(([x]) => x));
    const step = r.w >= 13 ? 4 : 3;
    for (let x = r.x + 1; x < r.x + r.w - 1; x += step) {
      if (doorXs.has(x) || doorXs.has(x - 1) || doorXs.has(x + 1)) continue;
      if (this.tile(x, ty + 1) !== T_FLOOR) continue;
      this.torches.push({ tx: x, ty, x: x * TILE + 8, y: ty * TILE + 10, phase: rand(TAU) });
    }
    this.torchSet = new Set(this.torches.map(t => this.idx(t.tx, t.ty)));
  }

  // ----- 预渲染地面 -----
  bake() {
    const [c, g] = makeCanvas(this.W * TILE, this.H * TILE);
    this.floorC = c;
    this.floorG = g;
    for (let ty = 0; ty < this.H; ty++) for (let tx = 0; tx < this.W; tx++) {
      const t = this.tile(tx, ty);
      if (t === T_FLOOR || t === T_DOOR) {
        g.drawImage(TileGen.floor(tx, ty), tx * TILE, ty * TILE);
        if (this.themeKey === 'lava' && hash2(tx, ty, 99) < 0.025) this.lavaLights.push({ x: tx * TILE + 8, y: ty * TILE + 8 });
      }
    }
    // 环境光遮蔽
    for (let ty = 0; ty < this.H; ty++) for (let tx = 0; tx < this.W; tx++) {
      const t = this.tile(tx, ty);
      if (t !== T_FLOOR && t !== T_DOOR) continue;
      const x = tx * TILE, y = ty * TILE;
      if (this.isWall(tx, ty - 1)) {
        const gr = g.createLinearGradient(0, y, 0, y + 7);
        gr.addColorStop(0, 'rgba(8,4,16,0.55)');
        gr.addColorStop(1, 'rgba(8,4,16,0)');
        g.fillStyle = gr;
        g.fillRect(x, y, TILE, 7);
      }
      if (this.isWall(tx - 1, ty)) {
        const gr = g.createLinearGradient(x, 0, x + 4, 0);
        gr.addColorStop(0, 'rgba(8,4,16,0.4)');
        gr.addColorStop(1, 'rgba(8,4,16,0)');
        g.fillStyle = gr;
        g.fillRect(x, y, 4, TILE);
      }
      if (this.isWall(tx + 1, ty)) {
        const gr = g.createLinearGradient(x + TILE, 0, x + TILE - 3, 0);
        gr.addColorStop(0, 'rgba(8,4,16,0.3)');
        gr.addColorStop(1, 'rgba(8,4,16,0)');
        g.fillStyle = gr;
        g.fillRect(x + TILE - 3, y, 3, TILE);
      }
    }
    // 门槛
    for (const [k, r] of this.doorOwner) {
      const tx = k % this.W, ty = Math.floor(k / this.W);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      const horiz = this.tile(tx, ty - 1) === T_DOOR || this.tile(tx, ty + 1) === T_DOOR;
      if (horiz) g.fillRect(tx * TILE + 7, ty * TILE, 2, TILE);
      else g.fillRect(tx * TILE, ty * TILE + 7, TILE, 2);
    }
  }

  // 贴花 (血迹/焦痕) 直接画入地面
  decal(fn) {
    const g = this.floorG;
    g.save();
    fn(g);
    g.restore();
  }
  splat(x, y, color, size = 1) {
    // 只在地面上留下痕迹
    const t = this.tile(Math.floor(x / TILE), Math.floor(y / TILE));
    if (t !== T_FLOOR && t !== T_DOOR) return;
    this.decal(g => {
      g.globalAlpha = 0.55;
      g.fillStyle = color;
      const n = Math.round(rand(4, 7) * size);
      for (let i = 0; i < n; i++) {
        const a = rand(TAU), d = rand(0, 5) * size;
        const s = Math.round(rand(1, 3) * size);
        g.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * 0.7), s, s);
      }
      g.globalAlpha = 0.35;
      g.fillStyle = shadeHex(color, -0.3);
      g.fillRect(Math.round(x - size), Math.round(y), Math.round(2 * size + 1), Math.round(size + 1));
    });
  }
  scorch(x, y, r) {
    this.decal(g => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(10,6,8,0.55)');
      gr.addColorStop(0.6, 'rgba(10,6,8,0.3)');
      gr.addColorStop(1, 'rgba(10,6,8,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(x, y, r, r * 0.75, 0, 0, TAU);
      g.fill();
    });
  }

  update(dt) {
    for (const p of this.hitProps) {
      if (!p.update(dt) || this.props[this.idx(p.tx, p.ty)] !== p) this.hitProps.delete(p);
    }
    for (const r of this.rooms) {
      const target = r.locked ? 1 : 0;
      const before = r.gate;
      r.gate = approach(r.gate, target, dt * 4);
      if (before === 0 && r.gate > 0 && target === 1) { Sfx.play('door'); FX.addShake(2); }
      if (before === 1 && target === 0) Sfx.play('door');
    }
  }

  // ----- 绘制 -----
  drawFloor(g, cam) {
    const x0 = Math.max(0, Math.floor(cam.x)), y0 = Math.max(0, Math.floor(cam.y));
    const w = Math.min(this.floorC.width - x0, Math.ceil(cam.w) + 2);
    const h = Math.min(this.floorC.height - y0, Math.ceil(cam.h) + 2);
    if (w > 0 && h > 0) g.drawImage(this.floorC, x0, y0, w, h, x0, y0, w, h);
  }

  // 收集可见的墙/门, 供 Y 排序
  collectWalls(cam, out, time) {
    const tx0 = Math.max(0, Math.floor(cam.x / TILE) - 1), tx1 = Math.min(this.W - 1, Math.ceil((cam.x + cam.w) / TILE) + 1);
    const ty0 = Math.max(0, Math.floor(cam.y / TILE) - 1), ty1 = Math.min(this.H - 1, Math.ceil((cam.y + cam.h) / TILE) + 2);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const t = this.tiles[ty * this.W + tx];
      if (t === T_WALL) {
        out.push({ sy: ty * TILE + TILE, draw: g => this.drawWall(g, tx, ty, time) });
      } else if (t === T_DOOR) {
        const r = this.doorOwner.get(ty * this.W + tx);
        if (r && r.gate > 0) out.push({ sy: ty * TILE + TILE - 0.5, draw: g => this.drawGate(g, tx, ty, r, time) });
      }
      const p = this.props[ty * this.W + tx];
      if (p) out.push({ sy: p.y, draw: g => p.draw(g) });
    }
  }

  drawWall(g, tx, ty, time) {
    const mask = (this.isWall(tx, ty - 1) ? 1 : 0) | (this.isWall(tx + 1, ty) ? 2 : 0) | (this.isWall(tx, ty + 1) ? 4 : 0) | (this.isWall(tx - 1, ty) ? 8 : 0);
    const x = tx * TILE, y = ty * TILE;
    g.drawImage(TileGen.cap(mask, tx, ty), x, y - WALL_RISE);
    if (!(mask & 4)) {
      g.drawImage(TileGen.front(tx, ty), x, y + TILE - WALL_FRONT);
      if (this.torchSet && this.torchSet.has(ty * this.W + tx)) this.drawTorch(g, x + 8, y + TILE - WALL_FRONT + 3, time, tx);
    }
  }

  drawTorch(g, x, y, time, seed) {
    const style = this.theme.torchStyle;
    const f = Math.sin(time * 12 + seed) * 0.5 + Math.sin(time * 19 + seed * 3) * 0.5;
    if (style === 'crystal') {
      g.fillStyle = '#3a4a6a'; g.fillRect(x - 2, y + 3, 4, 2);
      g.fillStyle = '#7ad8ff'; g.fillRect(x - 1, y - 3, 3, 6);
      g.fillStyle = '#d8f6ff'; g.fillRect(x - 1, y - 2, 1, 3);
      g.fillStyle = '#3aa0e0'; g.fillRect(x + 1, y - 1, 1, 4);
      g.fillStyle = '#ffffff'; g.fillRect(x, y - 4, 1, 1);
      return;
    }
    // 托架
    g.fillStyle = '#2a2430';
    g.fillRect(x - 1, y, 3, 5);
    g.fillStyle = style === 'brazier' ? '#5a4a52' : '#6a4a2a';
    g.fillRect(x - 2, y - 1, 5, 2);
    g.fillStyle = style === 'brazier' ? '#8a7480' : '#9a6a3a';
    g.fillRect(x - 2, y - 1, 5, 1);
    // 火焰
    const h = 5 + f * 1.2;
    g.fillStyle = style === 'brazier' ? '#ff4a20' : '#ff7a20';
    g.fillRect(x - 1.5, y - h + 1, 4, h - 1);
    g.fillStyle = '#ffb040';
    g.fillRect(x - 0.5, y - h + 2, 2, h - 2);
    g.fillStyle = '#fff2b0';
    g.fillRect(x, y - 3, 1, 2);
    g.fillRect(x + (f > 0 ? 0.5 : -0.5), y - h, 1, 1.5);
  }

  drawGate(g, tx, ty, room, time) {
    const k = easeOut(room.gate);
    const x = tx * TILE, y = ty * TILE;
    const H = (WALL_RISE + TILE - 2) * k;
    const base = y + TILE - 1;
    const horiz = this.tile(tx - 1, ty) === T_DOOR || this.tile(tx + 1, ty) === T_DOOR;
    // 底部红色符文光
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x, base - 2, TILE, 3);
    const bars = horiz ? [2, 7, 12] : [6];
    for (const bx of bars) {
      g.fillStyle = '#2a2a36';
      g.fillRect(x + bx - 1, base - H, 4, H);
      g.fillStyle = '#6a6e82';
      g.fillRect(x + bx, base - H, 2, H);
      g.fillStyle = '#a8aec0';
      g.fillRect(x + bx, base - H, 1, H);
      // 尖刺
      g.fillStyle = '#c8ccd8';
      g.fillRect(x + bx, base - H - 2, 2, 2);
      g.fillStyle = '#2a2a36';
      g.fillRect(x + bx - 1, base - H - 1, 1, 1);
      g.fillRect(x + bx + 2, base - H - 1, 1, 1);
    }
    if (horiz) {
      g.fillStyle = '#4a4e60';
      g.fillRect(x, base - H * 0.75, TILE, 2);
      g.fillRect(x, base - H * 0.3, TILE, 2);
      g.fillStyle = '#8a90a4';
      g.fillRect(x, base - H * 0.75, TILE, 1);
      g.fillRect(x, base - H * 0.3, TILE, 1);
    } else {
      g.fillStyle = '#4a4e60';
      g.fillRect(x + 2, base - H * 0.7, 12, 2);
      g.fillStyle = '#8a90a4';
      g.fillRect(x + 2, base - H * 0.7, 12, 1);
    }
    const glow = 0.5 + Math.sin(time * 6) * 0.3;
    g.fillStyle = `rgba(255,60,80,${glow * k})`;
    g.fillRect(x + 1, base - 1, TILE - 2, 1);
  }

  collectLights(time) {
    const col = this.theme.torch;
    for (const t of this.torches) {
      const f = 1 + Math.sin(time * 9 + t.phase) * 0.06 + Math.sin(time * 23 + t.phase) * 0.04;
      FX.light(t.x, t.y + 6, 62 * f, col, 0.85);
    }
    for (const l of this.lavaLights) FX.light(l.x, l.y, 26 + Math.sin(time * 3 + l.x) * 3, '#ff5a20', 0.6);
    for (const r of this.rooms) {
      if (r.gate > 0) for (const [x, y] of r.doors) FX.light(x * TILE + 8, y * TILE + 12, 16, '#ff3050', 0.5 * r.gate);
    }
  }

  // 环境粒子与火焰
  ambient(dt, cam, time) {
    for (const t of this.torches) {
      if (t.x < cam.x - 20 || t.x > cam.x + cam.w + 20 || t.y < cam.y - 20 || t.y > cam.y + cam.h + 30) continue;
      if (this.theme.torchStyle !== 'crystal' && Math.random() < dt * 5) {
        FX.p({ x: t.x + rand(-1, 1), y: t.y - 2, vx: rand(-6, 6), vy: rand(-28, -14), color: choice(['#ffb040', '#ff7a20', '#ffe080']), glow: true, life: rand(0.4, 0.8), size: 1, size2: 0, drag: 1 });
      }
      if (this.theme.torchStyle === 'crystal' && Math.random() < dt * 2) {
        FX.p({ x: t.x + rand(-3, 3), y: t.y + rand(-4, 2), vy: rand(-8, -3), kind: 'star', color: '#9fe8ff', glow: true, life: 0.6, size: 1.5 });
      }
    }
    const kind = this.theme.particle;
    const area = cam.w * cam.h / 40000;
    if (Math.random() < dt * 4 * area) {
      const x = cam.x + rand(cam.w), y = cam.y + rand(cam.h);
      if (kind === 'firefly') {
        FX.p({ x, y, vx: rand(-6, 6), vy: rand(-6, 6), color: '#d8ff7a', glow: true, kind: 'orb', life: rand(2, 4), size: 2.5, size2: 0.5, alpha: 0.8 });
      } else if (kind === 'snow') {
        FX.p({ x, y: cam.y - 4 + rand(cam.h * 0.5), vx: rand(-10, -2), vy: rand(10, 22), color: '#ffffff', life: rand(3, 5), size: rand(1, 1.6), alpha: 0.85 });
      } else {
        FX.p({ x, y: cam.y + cam.h * rand(0.3, 1), vx: rand(-5, 5), vy: rand(-22, -10), color: choice(['#ff8a30', '#ffc050']), glow: true, life: rand(1.5, 3), size: 1, size2: 0.3 });
      }
    }
  }
}
