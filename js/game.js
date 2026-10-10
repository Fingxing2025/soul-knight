'use strict';
// ============ 主循环 / 状态 / 渲染管线 ============
const LEVEL_THEMES = ['forest', 'ice', 'lava'];
const WAVE_POOLS = [
  [['goblin', 6], ['slime', 3], ['boar', 2], ['bat', 2], ['shaman', 1]],
  [['goblin', 4], ['shaman', 3], ['boar', 3], ['bat', 3], ['slime', 3]],
  [['goblin', 4], ['shaman', 4], ['boar', 3], ['bat', 3], ['slime', 2]],
];

const Game = {
  dpr: 1, S: 4, vw: 0, vh: 0, W: 0, H: 0,
  state: 'title', menuIdx: 0, time: 0, levelNum: 1,
  level: null, player: null,
  enemies: [], bullets: [], ebullets: [], pickups: [], drops: [], chests: [], portals: [], corpses: [], pending: [], timers: [],
  cam: { x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0 },
  curRoom: null, boss: null, bossHit: 0, bossDying: false,
  fade: 1, fadeTarget: 0, fadeCb: null,
  testMode: false, godMode: false, runTime: 0, interactTarget: null, stateT: 0,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    initSprites();
    [this.lightC, this.lightG] = makeCanvas(4, 4);
    this.resize();
    addEventListener('resize', () => this.resize());
    const unlock = () => { Sfx.init(); if (this.state === 'title') Sfx.playMusic('title'); };
    addEventListener('mousedown', unlock);
    addEventListener('keydown', unlock);
    this.toTitle();
    let last = performance.now();
    const loop = ts => {
      const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
      last = ts;
      const frozen = this.update(dt);
      this.render();
      if (!frozen) Input.endFrame();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    this.W = Math.floor(innerWidth * this.dpr);
    this.H = Math.floor(innerHeight * this.dpr);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.S = Math.max(2, Math.round(this.H / 235));
    this.vw = this.W / this.S;
    this.vh = this.H / this.S;
    this.lightC.width = Math.ceil(this.vw / 2) + 2;
    this.lightC.height = Math.ceil(this.vh / 2) + 2;
    this.cam.w = this.vw; this.cam.h = this.vh;
  },

  mouseWorld() {
    return { x: Input.mouse.sx * this.dpr / this.S + this.cam.x, y: Input.mouse.sy * this.dpr / this.S + this.cam.y };
  },

  levelLabel() { return `1-${this.levelNum}`; },

  // ---------- 状态切换 ----------
  toTitle() {
    this.state = 'title';
    this.stateT = 0;
    this.player = null;
    this.boss = null;
    this.levelNum = 1;
    this.level = new Level(1, 'forest');
    this.clearEntities();
    const r = this.level.rooms.find(r => r.type === 'combat') || this.level.rooms[0];
    this.titleRoom = r;
    this.cam.cx = r.cx; this.cam.cy = r.cy;
    this.fade = 1; this.fadeTarget = 0;
    Sfx.playMusic('title');
  },

  clearEntities() {
    this.enemies = []; this.bullets = []; this.ebullets = []; this.pickups = []; this.drops = [];
    this.chests = []; this.portals = []; this.corpses = []; this.pending = []; this.timers = [];
    this.boss = null; this.bossDying = false;
    FX.reset();
  },

  transition(cb) {
    this.fadeTarget = 1;
    this.fadeCb = () => { cb(); this.fadeTarget = 0; };
  },

  newRun(test = false, cls = this.selCls || 'knight') {
    this.testMode = test;
    this.godMode = false;
    this.selCls = cls;
    this.levelNum = 1;
    this.runTime = 0;
    this.player = new Player(0, 0, cls);
    this.loadLevel(1);
    this.state = 'play';
  },

  loadLevel(n) {
    this.levelNum = n;
    this.level = new Level(n, LEVEL_THEMES[n - 1]);
    this.clearEntities();
    const L = this.level, p = this.player;
    const s = L.start;
    p.x = s.cx; p.y = s.cy + 6;
    p.vx = p.vy = p.pvx = p.pvy = 0;
    s.visited = true;
    for (const k in s.links) s.links[k].seen = true;
    this.curRoom = s;
    for (const r of L.rooms) {
      if (r.type === 'chest') this.chests.push(new Chest('weapon', r.cx, r.cy + 4));
      if (r.type === 'end') this.portals.push(new Portal(r.cx, r.cy + 4));
    }
    if (this.testMode && n === 1) {
      const ids = Object.keys(WEAPONS).filter(k => k !== 'pistol');
      ids.forEach((id, i) => {
        const a = (i / ids.length) * TAU;
        this.drops.push(new WeaponDrop(id, s.cx + Math.cos(a) * 46, s.cy + 6 + Math.sin(a) * 40));
      });
      p.maxEnergy = 400; p.energy = 400;
    }
    if (n === 1 && !this.testMode) {
      this.timers.push({ t: 2.8, fn: () => FX.text(p.x, p.y - 26, '探索地牢, 找到传送门!', '#ffe9a0', 6, 2.2) });
    }
    this.cam.cx = p.x; this.cam.cy = p.y;
    this.cam.x = p.x - this.vw / 2; this.cam.y = p.y - this.vh / 2;
    HUD.showBanner(this.levelLabel(), this.level.theme.name);
    Sfx.playMusic(this.level.theme.music);
  },

  nextLevel() {
    if (this.fadeTarget === 1) return;
    Sfx.play('portal');
    FX.flash('#b49aff', 0.5);
    if (this.levelNum >= 3) {
      this.transition(() => { this.state = 'win'; this.stateT = 0; Sfx.play('victory'); Sfx.stopMusic(); });
      return;
    }
    this.transition(() => {
      const p = this.player;
      p.armor = p.maxArmor;
      p.weapon.stop();
      this.loadLevel(this.levelNum + 1);
    });
  },

  // ---------- 更新 ----------
  update(dt) {
    // 渐变
    if (this.fade !== this.fadeTarget) {
      this.fade = approach(this.fade, this.fadeTarget, dt * 2.8);
      if (this.fade === 1 && this.fadeCb) { const cb = this.fadeCb; this.fadeCb = null; cb(); }
    }
    if (Input.hit('KeyM')) {
      const m = Sfx.toggleMute();
      if (this.player) FX.text(this.player.x, this.player.y - 26, m ? '已静音' : '声音开启', '#ffffff', 6);
    }
    this.stateT += dt;

    if (this.state === 'title') { this.updateTitle(dt); return false; }
    if (this.state === 'select') { this.updateSelect(dt); return false; }
    if (this.state === 'paused') {
      if (Input.hit('Escape') || Input.hit('KeyP')) this.state = 'play';
      if (Input.hit('KeyT')) this.toTitle();
      return false;
    }
    if (this.state === 'dead' || this.state === 'win') {
      this.time += dt;
      FX.update(dt);
      if (this.stateT > 1 && (Input.hit('KeyR') || Input.hit('Enter') || Input.mouse.leftPressed)) {
        this.transition(() => this.newRun(this.testMode, this.selCls));
      }
      if (this.stateT > 1 && Input.hit('Escape')) this.transition(() => this.toTitle());
      return false;
    }

    // play
    if (Input.hit('Escape') || Input.hit('KeyP')) { this.state = 'paused'; Sfx.laserOff(); return false; }
    if (Input.hit('KeyF') && this.player) {
      this.player.autoAim = !this.player.autoAim;
      FX.text(this.player.x, this.player.y - 26, this.player.autoAim ? '自动瞄准: 开' : '自动瞄准: 关', '#6ad84a', 6);
    }
    if (FX.hitstop > 0) { FX.hitstop -= dt; return true; }
    if (FX.slowmo > 0) { FX.slowmo -= dt; dt *= 0.35; }

    this.time += dt;
    this.runTime += dt;
    this.bossHit -= dt;
    const p = this.player;
    if (this.fade < 0.5 || this.fadeTarget === 0) p.update(dt);
    else p.weapon.stop();

    for (const e of this.enemies) if (!e.dead) e.update(dt);
    this.enemies = this.enemies.filter(e => !e.dead);
    for (const b of this.bullets) if (!b.dead) b.update(dt);
    this.bullets = this.bullets.filter(b => !b.dead);
    for (const b of this.ebullets) if (!b.dead) b.update(dt);
    this.ebullets = this.ebullets.filter(b => !b.dead);
    for (const k of this.pickups) k.update(dt);
    this.pickups = this.pickups.filter(k => !k.dead);
    for (const d of this.drops) d.update(dt);
    for (const c of this.chests) c.update(dt);
    for (const pt of this.portals) pt.update(dt);
    for (const c of this.corpses) c.t += dt;
    this.corpses = this.corpses.filter(c => c.t < 2.4);
    for (const s of this.pending) {
      s.t -= dt;
      if (s.t <= 0) {
        const e = new Enemy(s.type, s.x, s.y, s.room, s.elite);
        this.enemies.push(e);
        FX.smoke(s.x, s.y - 4, 5, { alpha: 0.5, color: '#e0d8f0' });
        FX.burst(s.x, s.y - 6, s.color, 8, 60, { glow: true });
        Sfx.play('poof', 0.05);
      }
    }
    this.pending = this.pending.filter(s => s.t > 0);
    for (const t of this.timers) { t.t -= dt; if (t.t <= 0 && !t.done) { t.done = true; t.fn(); } }
    this.timers = this.timers.filter(t => !t.done);

    this.roomLogic(dt);
    this.updateInteract();
    this.level.update(dt);
    this.level.ambient(dt, this.cam, this.time);
    FX.update(dt);
    this.updateCam(dt);
    HUD.update(dt);

    if (p.dead && p.deadT > 1.8 && this.state === 'play') {
      this.state = 'dead';
      this.stateT = 0;
      Sfx.stopMusic();
    }
    return false;
  },

  updateTitle(dt) {
    this.time += dt;
    const r = this.titleRoom;
    this.cam.cx = r.cx + Math.cos(this.time * 0.15) * 60;
    this.cam.cy = r.cy + Math.sin(this.time * 0.2) * 30;
    this.cam.x = this.cam.cx - this.vw / 2;
    this.cam.y = this.cam.cy - this.vh / 2;
    this.level.ambient(dt, this.cam, this.time);
    FX.update(dt);
    const items = this.menuItems();
    if (Input.hit('KeyW') || Input.hit('ArrowUp')) { this.menuIdx = (this.menuIdx + items.length - 1) % items.length; Sfx.play('uiMove'); }
    if (Input.hit('KeyS') || Input.hit('ArrowDown')) { this.menuIdx = (this.menuIdx + 1) % items.length; Sfx.play('uiMove'); }
    // 鼠标悬停
    const U = this.S;
    const my = Input.mouse.sy * this.dpr / U, mx = Input.mouse.sx * this.dpr / U;
    items.forEach((it, i) => {
      const y = this.vh * 0.66 + i * 16;
      if (Input.mouse.moved && Math.abs(my - y) < 7 && Math.abs(mx - this.vw / 2) < 50) {
        if (this.menuIdx !== i) Sfx.play('uiMove');
        this.menuIdx = i;
        if (Input.mouse.leftPressed) this.menuSelect();
      }
    });
    Input.mouse.moved = false;
    if (Input.hit('Enter') || Input.hit('Space')) this.menuSelect();
  },
  menuItems() { return ['开始冒险', '武器试炼场']; },

  // ---------- 角色选择 ----------
  selectLayout() {
    const n = CLASS_IDS.length;
    const cw = Math.min(104, (this.vw - 24) / n), gap = 6;
    const ch = Math.min(150, this.vh - 70);
    const x0 = (this.vw - (cw * n + gap * (n - 1))) / 2, y0 = Math.max(34, (this.vh - ch) / 2 + 6);
    return CLASS_IDS.map((id, i) => ({ id, x: x0 + i * (cw + gap), y: y0, w: cw, h: ch }));
  },
  updateSelect(dt) {
    this.time += dt;
    this.level.ambient(dt, this.cam, this.time);
    FX.update(dt);
    const n = CLASS_IDS.length;
    if (Input.hit('KeyA') || Input.hit('ArrowLeft')) { this.selIdx = (this.selIdx + n - 1) % n; Sfx.play('uiMove'); }
    if (Input.hit('KeyD') || Input.hit('ArrowRight')) { this.selIdx = (this.selIdx + 1) % n; Sfx.play('uiMove'); }
    const U = this.S;
    const mx = Input.mouse.sx * this.dpr / U, my = Input.mouse.sy * this.dpr / U;
    let clicked = false;
    this.selectLayout().forEach((c, i) => {
      if (mx > c.x && mx < c.x + c.w && my > c.y && my < c.y + c.h) {
        if (Input.mouse.moved && this.selIdx !== i) { this.selIdx = i; Sfx.play('uiMove'); }
        if (Input.mouse.leftPressed) { this.selIdx = i; clicked = true; }
      }
    });
    Input.mouse.moved = false;
    if (Input.hit('Escape')) { this.state = 'title'; Sfx.play('uiMove'); return; }
    if ((clicked || Input.hit('Enter') || Input.hit('Space')) && this.fadeTarget !== 1 && this.stateT > 0.15) {
      const cls = CLASS_IDS[this.selIdx];
      Sfx.play('uiOk');
      this.transition(() => this.newRun(this.pendingTest, cls));
    }
  },
  drawSelect(g, U) {
    g.setTransform(U, 0, 0, U, 0, 0);
    const vw = this.vw, vh = this.vh, t = this.time;
    g.fillStyle = 'rgba(8,6,14,0.62)';
    g.fillRect(0, 0, vw, vh);
    uiText(g, '选择你的英雄', vw / 2, 16, 11, '#ffffff', { align: 'center', lw: 3 });
    uiText(g, this.pendingTest ? '武器试炼场' : '开始冒险', vw / 2, 28, 5, '#b8acd8', { align: 'center' });
    for (const [i, c] of this.selectLayout().entries()) {
      const C = CLASSES[c.id];
      const sel = i === this.selIdx;
      const lift = sel ? Math.round(-2 - Math.sin(t * 4) * 1) : 0;
      const y = c.y + lift;
      panel(g, c.x, y, c.w, c.h, { bg: sel ? 'rgba(52,38,70,0.95)' : 'rgba(30,22,42,0.88)', border: sel ? C.color : '#120d1a' });
      if (sel) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.35;
        g.drawImage(glowTex(C.color), c.x + c.w / 2 - 30, y + 10, 60, 50);
        g.restore();
      }
      // 角色
      const fr = SPR[C.spr];
      const fi = sel ? 1 + (Math.floor(t * 8) % 3) : 0;
      const sc = 2.5;
      const fx = c.x + c.w / 2, fy = y + 48;
      drawShadow(g, fx, fy, 12, 3.5, 0.45);
      drawSpr(g, fr[fi], fx, fy + 2, { sx: sc, sy: sc });
      const w0 = SPR.w[WEAPONS[C.weapons[0]].spr];
      drawSpr(g, w0, fx + 7, fy - 13, { ax: WEAPONS[C.weapons[0]].grip[0] + 1, ay: WEAPONS[C.weapons[0]].grip[1] + 1, sx: 2, sy: 2, rot: -0.3 });
      uiText(g, C.name, fx, y + 58, 9, sel ? C.color : '#e8e0f0', { align: 'center', lw: 2.5 });
      uiText(g, C.desc, fx, y + 69, 4.5, '#b8acd0', { align: 'center', lw: 1.2 });
      // 属性
      const stats = [['#e8404e', '生命', C.hp, 8], ['#a8b4cc', '护甲', C.armor, 8], ['#3a8aff', '能量', C.energy, 260], ['#6ad84a', '速度', C.speed, 120]];
      stats.forEach(([col, name, v, max], k) => {
        const sy = y + 77 + k * 8;
        uiText(g, name, c.x + 6, sy + 2, 4.5, '#c8c0d8', { lw: 1.2 });
        const bx = c.x + 22, bw = c.w - 44;
        g.fillStyle = '#120d1a'; g.fillRect(bx - 1, sy - 1, bw + 2, 6);
        g.fillStyle = '#2a2034'; g.fillRect(bx, sy, bw, 4);
        g.fillStyle = col; g.fillRect(bx, sy, Math.round(bw * Math.min(1, v / max)), 4);
        g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(bx, sy, Math.round(bw * Math.min(1, v / max)), 1);
        drawPixelText(g, String(v), c.x + c.w - 6, sy - 0.5, '#ffffff', { align: 'right' });
      });
      // 技能
      const ky = y + 112;
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(c.x + 3, ky - 4, c.w - 6, c.h - (ky - y) + 1);
      uiText(g, '技能 · ' + C.skillName, fx, ky + 1, 5.5, C.color, { align: 'center', lw: 1.5 });
      wrapText(g, C.skillDesc, fx, ky + 10, c.w - 10, 6.5, 4.5, '#e0d8f0');
      if (C.passive) uiText(g, C.passive, fx, y + c.h - 13, 4.5, C.color, { align: 'center', lw: 1.2 });
      uiText(g, '初始: ' + C.weapons.map(w => WEAPONS[w].name).join(' + '), fx, y + c.h - 5, 4, '#9a90b0', { align: 'center', lw: 1 });
    }
    uiText(g, 'A / D 选择   ·   回车 / 点击 确认   ·   Esc 返回', vw / 2, vh - 8, 5, '#9a90b0', { align: 'center', lw: 1.2 });
  },
  menuSelect() {
    if (this.fadeTarget === 1) return;
    Sfx.init();
    Sfx.play('uiOk');
    this.pendingTest = this.menuIdx === 1;
    this.state = 'select';
    this.stateT = 0;
    this.selIdx = Math.max(0, CLASS_IDS.indexOf(this.selCls || 'knight'));
  },

  roomLogic(dt) {
    const p = this.player, L = this.level;
    if (p.dead) return;
    const r = L.roomAt(p.x, p.y, -4);
    this.curRoom = r || this.curRoom;
    if (r) {
      r.visited = true;
      for (const k in r.links) r.links[k].seen = true;
    }
    if (r && r.state === 'idle') {
      const inside = p.x - p.r > r.x * TILE + 2 && p.x + p.r < (r.x + r.w) * TILE - 2 &&
        p.y - p.boxTop > r.y * TILE + 2 && p.y + p.boxBot < (r.y + r.h) * TILE - 2;
      if (inside) this.startRoom(r);
    }
    for (const room of L.rooms) {
      if (room.state !== 'active' || room.type === 'boss') continue;
      const alive = this.enemies.some(e => e.room === room) || this.pending.some(s => s.room === room);
      if (!alive) {
        if (room.waveIdx < room.waves.length) {
          if (room.waveDelay === undefined) room.waveDelay = 0.6;
          room.waveDelay -= dt;
          if (room.waveDelay <= 0) { room.waveDelay = undefined; this.spawnWave(room); }
        } else this.clearRoom(room);
      }
    }
  },

  startRoom(r) {
    r.state = 'active';
    if (r.type === 'boss') {
      const b = new Enemy('boss', r.cx, r.cy - 30, r, false);
      b.maxHp = b.hp = ENEMY_TYPES.boss.hp;
      b.state = 'intro'; b.timer = 2.4;
      this.boss = b;
      this.timers.push({ t: 0.6, fn: () => {
        this.enemies.push(b);
        FX.smoke(b.x, b.y - 10, 14, { alpha: 0.6, big: 1.8, spd: 2 });
        FX.addShake(9);
        FX.flash('#ff3040', 0.2);
        Sfx.play('roar');
        Sfx.play('slam');
        HUD.showBanner(ENEMY_TYPES.boss.name, '熔岩要塞的暴君', 2.6);
        Sfx.playMusic('boss');
      } });
      FX.spawnCircle(r.cx, r.cy - 30, 0.6, '#ff3040');
      return;
    }
    const n = this.levelNum;
    const waveCount = n === 1 ? 2 : n === 2 ? randi(2, 3) : 3;
    r.waves = [];
    for (let w = 0; w < waveCount; w++) {
      const cnt = randi(3, 4) + (n - 1) + (r.w * r.h > 200 ? 1 : 0);
      const wave = [];
      for (let i = 0; i < cnt; i++) wave.push({ type: weightedPick(WAVE_POOLS[n - 1]), elite: chance(0.05 + n * 0.04) });
      r.waves.push(wave);
    }
    r.waveIdx = 0;
    this.spawnWave(r);
  },

  spawnWave(r) {
    const wave = r.waves[r.waveIdx++];
    const p = this.player, L = this.level;
    for (const s of wave) {
      let x, y;
      for (let tries = 0; tries < 40; tries++) {
        const tx = randi(r.x + 1, r.x + r.w - 2), ty = randi(r.y + 1, r.y + r.h - 2);
        if (L.solid(tx, ty)) continue;
        x = tx * TILE + 8; y = ty * TILE + 12;
        if (dist(x, y, p.x, p.y) > 70) break;
      }
      if (x === undefined) { x = r.cx; y = r.cy; }
      this.spawnEnemy(s.type, x, y, r, s.elite, 0.9);
    }
    Sfx.play('spawn');
  },

  spawnEnemy(type, x, y, room, elite, delay = 0.9) {
    const color = elite ? '#ff3050' : '#ff7ab0';
    FX.spawnCircle(x, y, delay, color);
    this.pending.push({ t: delay, type, x, y, room, elite, color });
  },

  clearRoom(r) {
    r.state = 'cleared';
    this.timers.push({ t: 0.6, fn: () => this.vacuumRoom(r) });
    const p = this.player;
    FX.text(p.x, p.y - 28, '房间已清理!', '#6ad84a', 7, 1.4);
    Sfx.play('pickup');
    // 清空残余子弹
    for (const b of this.ebullets) { b.dead = true; FX.p({ x: b.x, y: b.y, kind: 'orb', color: b.color, glow: true, life: 0.2, size: 6, size2: 0 }); }
    if (r.type === 'combat') {
      let cx = r.ctx, cy = r.cty;
      const L = this.level;
      if (L.solid(cx, cy)) cy++;
      this.chests.push(new Chest('small', cx * TILE + 8, cy * TILE + 12));
      FX.stars(cx * TILE + 8, cy * TILE + 6, '#fff0a0', 10, 12);
    }
  },

  updateInteract() {
    const p = this.player;
    this.interactTarget = null;
    if (p.dead) return;
    let best = null, bd = 18;
    for (const d of this.drops) { const dd = dist(p.x, p.y, d.x, d.y); if (dd < bd) { bd = dd; best = d; } }
    for (const c of this.chests) if (!c.opened) { const dd = dist(p.x, p.y, c.x, c.y); if (dd < bd + 4) { bd = dd; best = c; } }
    for (const pt of this.portals) { const dd = dist(p.x, p.y, pt.x, pt.y); if (dd < bd + 2) { bd = dd; best = pt; } }
    this.interactTarget = best;
    if (best && Input.hit('KeyE')) best.interact(p);
  },

  updateCam(dt) {
    const p = this.player;
    const mw = this.mouseWorld();
    let lx = (mw.x - p.x) * 0.18, ly = (mw.y - p.y) * 0.18;
    lx = clamp(lx, -38, 38); ly = clamp(ly, -28, 28);
    if (p.dead) lx = ly = 0;
    const k = 1 - Math.exp(-7 * dt);
    this.cam.cx = lerp(this.cam.cx, p.x + lx, k);
    this.cam.cy = lerp(this.cam.cy, p.y - 6 + ly, k);
    this.cam.x = this.cam.cx - this.vw / 2;
    this.cam.y = this.cam.cy - this.vh / 2;
  },

  // ---------- 生成 / 交互接口 ----------
  addBullet(b) { this.bullets.push(b); },
  addEBullet(b) { if (this.ebullets.length < 900) this.ebullets.push(b); },

  explode(x, y, radius, dmg, team) {
    FX.explosion(x, y, radius);
    Sfx.play('explosion', 0.05);
    this.level.scorch(x, y, radius * 0.75);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist(x, y, e.x, e.y - e.hitY);
      if (d < radius + e.hitR) {
        const k = d < radius * 0.5 ? 1 : 0.6;
        const a = angleTo(x, y, e.x, e.y);
        e.hurt(rollDmg(Math.round(dmg * k), team === 'p'), Math.cos(a) * 160, Math.sin(a) * 160);
      }
    }
    const p = this.player;
    if (team !== 'p' && p && !p.dead && dist(x, y, p.x, p.y - 5) < radius) {
      p.hurt(2);
      const a = angleTo(x, y, p.x, p.y);
      p.push(Math.cos(a) * 200, Math.sin(a) * 200);
    }
    const L = this.level;
    const r = Math.ceil(radius / TILE);
    const tx0 = Math.floor(x / TILE), ty0 = Math.floor(y / TILE);
    for (let ty = ty0 - r; ty <= ty0 + r; ty++) for (let tx = tx0 - r; tx <= tx0 + r; tx++) {
      const pr = L.props[L.idx(tx, ty)];
      if (pr && dist(x, y, pr.x, pr.y - 6) < radius + 6) {
        this.timers.push({ t: rand(0.06, 0.14), fn: () => { if (L.props[L.idx(tx, ty)] === pr) pr.hit(12, L); } });
      }
    }
  },

  // 掉落物合并为少量对象 (数值叠加), 避免满地乱飞
  dropLoot(x, y, kind, n, cap) {
    if (kind === 'potion' || kind === 'potionB') { this.pickups.push(new Pickup(kind, x, y, 1)); return; }
    if (n <= 0) return;
    const count = Math.min(n, cap || (kind === 'coin' ? 3 : 2));
    const base = Math.floor(n / count);
    let rem = n - base * count;
    for (let i = 0; i < count; i++) {
      this.pickups.push(new Pickup(kind, x, y, base + (rem-- > 0 ? 1 : 0)));
    }
  },
  // 房间清理后自动吸取房间内的金币和能量
  vacuumRoom(r) {
    for (const k of this.pickups) {
      if ((k.kind === 'coin' || k.kind === 'energy') && r.contains(k.x, k.y, -8)) k.magnet = true;
    }
  },

  dropWeapon(x, y, minRarity = 0) {
    const held = new Set(this.player.weapons.map(w => w.id));
    let pool = WEAPON_POOL.filter(([id]) => !held.has(id) && WEAPONS[id].rarity >= minRarity);
    if (!pool.length) pool = WEAPON_POOL;
    const id = weightedPick(pool);
    const d = new WeaponDrop(id, x, y);
    this.drops.push(d);
    FX.stars(x, y - 6, RARITY[WEAPONS[id].rarity].color, 8, 10);
  },
  removeDrop(d) { this.drops = this.drops.filter(x => x !== d); },

  bossDefeated(b) {
    this.bossDying = true;
    FX.slowmo = 1.6;
    FX.flash('#ffffff', 0.6);
    FX.addShake(10);
    Sfx.play('roar');
    for (const bl of this.ebullets) bl.dead = true;
    for (const e of this.enemies) if (e !== b && !e.dead) e.die();
    this.pending = [];
    b.dead = false; // 保留在列表中播放死亡动画
    b.dying = true;
    b.stun = 99;
    b.vx = b.vy = 0;
    this.enemies = this.enemies.filter(e => e === b);
    for (let i = 0; i < 9; i++) {
      this.timers.push({ t: i * 0.16, fn: () => {
        FX.explosion(b.x + rand(-16, 16), b.y - rand(0, 26), rand(14, 22));
        Sfx.play('explosion', 0.02);
        b.flash = 0.06;
      } });
    }
    this.timers.push({ t: 1.6, fn: () => {
      FX.explosion(b.x, b.y - 12, 50);
      FX.flash('#ffffff', 0.8);
      FX.burst(b.x, b.y - 12, '#3c9a2a', 30, 160);
      FX.burst(b.x, b.y - 12, '#ffd23a', 20, 140, { glow: true });
      this.level.splat(b.x, b.y, '#3c9a2a', 3);
      Sfx.play('explosion');
      b.dead = true;
      this.enemies = [];
      this.corpses.push({ spr: SPR.boss[0], x: b.x, y: b.y, facing: 1, t: -6, scale: 1 });
      const r = b.room;
      r.state = 'cleared';
      this.bossDying = false;
      this.boss = null;
      this.player.kills++;
      this.dropLoot(b.x, b.y - 10, 'coin', 30, 6);
      this.dropLoot(b.x, b.y - 10, 'energy', 20, 4);
      this.timers.push({ t: 1.5, fn: () => this.vacuumRoom(r) });
      this.chests.push(new Chest('gold', r.cx - 24, r.cy + 10));
      this.portals.push(new Portal(r.cx + 24, r.cy + 10));
      HUD.showBanner('胜利!', '哥布林酋长被击败了', 3);
      Sfx.play('victory');
      Sfx.playMusic('title');
    } });
  },

  // ---------- 渲染 ----------
  render() {
    const g = this.ctx, S = this.S;
    const theme = this.level ? this.level.theme : THEMES.forest;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = theme.void;
    g.fillRect(0, 0, this.W, this.H);

    if (this.level) this.renderWorld(g, S);

    g.setTransform(1, 0, 0, 1, 0, 0);
    // 暗角
    const vg = g.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.35, this.W / 2, this.H / 2, this.H * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = vg;
    g.fillRect(0, 0, this.W, this.H);
    const p = this.player;
    const lowHp = p && !p.dead && p.hp <= 2 ? (Math.sin(this.time * 6) * 0.5 + 0.5) * 0.35 : 0;
    const hurt = Math.max(FX.hurtFlash * 0.7, lowHp);
    if (hurt > 0) {
      const hg = g.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.25, this.W / 2, this.H / 2, this.H * 0.85);
      hg.addColorStop(0, 'rgba(255,0,30,0)');
      hg.addColorStop(1, `rgba(220,0,30,${hurt})`);
      g.fillStyle = hg;
      g.fillRect(0, 0, this.W, this.H);
    }
    if (FX.screenFlash.a > 0) {
      g.globalAlpha = FX.screenFlash.a;
      g.fillStyle = FX.screenFlash.color;
      g.fillRect(0, 0, this.W, this.H);
      g.globalAlpha = 1;
    }

    if (this.state === 'title') this.drawTitle(g, S);
    else if (this.state === 'select') this.drawSelect(g, S);
    else {
      HUD.draw(g, S, this.vw, this.vh);
      if (this.state === 'paused') this.drawPause(g, S);
      if (this.state === 'dead') this.drawEnd(g, S, false);
      if (this.state === 'win') this.drawEnd(g, S, true);
    }

    if (this.fade > 0) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = `rgba(6,4,10,${this.fade})`;
      g.fillRect(0, 0, this.W, this.H);
    }
    HUD.drawCrosshair(g, S);
  },

  renderWorld(g, S) {
    const L = this.level, cam = this.cam;
    const sx = (Math.random() - 0.5) * 2 * FX.shakeAmt, sy = (Math.random() - 0.5) * 2 * FX.shakeAmt;
    const camX = Math.round((cam.x + sx + FX.kickX) * S) / S;
    const camY = Math.round((cam.y + sy + FX.kickY) * S) / S;
    const view = { x: camX, y: camY, w: this.vw, h: this.vh };
    const world = () => g.setTransform(S, 0, 0, S, -camX * S, -camY * S);
    world();

    L.drawFloor(g, view);
    FX.drawParts(g, true);
    FX.drawEffectsGround(g);
    // 尸体
    for (const c of this.corpses) {
      const a = c.t < 1.6 ? 1 : 1 - (c.t - 1.6) / 0.8;
      if (a <= 0) continue;
      const blink = c.t > 1.2 && Math.floor(c.t * 12) % 2 === 0;
      if (blink) continue;
      g.globalAlpha = a * 0.9;
      const fall = Math.min(1, Math.max(0, c.t) * 6);
      drawSpr(g, c.spr, c.x, c.y - (c.fly ? 0 : 2), { rot: (-Math.PI / 2) * c.facing * fall, flipX: c.facing < 0, ay: c.spr.h * 0.75, sx: c.scale, sy: c.scale });
      g.globalAlpha = 1;
    }
    for (const e of this.enemies) if (e.type === 'boss') drawBossTelegraph(g, e);

    // Y 排序
    const list = [];
    L.collectWalls(view, list, this.time);
    const inView = (x, y, m = 40) => x > view.x - m && x < view.x + view.w + m && y > view.y - m && y < view.y + view.h + m;
    for (const k of this.pickups) if (inView(k.x, k.y)) list.push({ sy: k.y, draw: g => k.draw(g) });
    for (const d of this.drops) if (inView(d.x, d.y)) list.push({ sy: d.y, draw: g => d.draw(g) });
    for (const c of this.chests) if (inView(c.x, c.y)) list.push({ sy: c.y, draw: g => c.draw(g) });
    for (const pt of this.portals) list.push({ sy: pt.y - 8, draw: g => pt.draw(g) });
    for (const e of this.enemies) if (inView(e.x, e.y)) list.push({ sy: e.y, draw: g => e.draw(g) });
    if (this.player) list.push({ sy: this.player.y, draw: g => this.player.draw(g) });
    list.sort((a, b) => a.sy - b.sy);
    for (const it of list) it.draw(g);

    FX.drawParts(g, false);
    FX.drawEffects(g);

    // ---- 光照 ----
    if (this.player) FX.light(this.player.x, this.player.y - 6, 90, '#ffe8d0', 0.45);
    else FX.light(cam.cx, cam.cy, 160, '#ffe0c0', 0.6);
    L.collectLights(this.time);
    for (const b of this.bullets) FX.light(b.x, b.y, b.style === 'rocket' ? 40 : 22, b.color, 0.55);
    for (const b of this.ebullets) FX.light(b.x, b.y, 16, b.color, 0.35);
    for (const e of this.enemies) if (e.elite) FX.light(e.x, e.y - 8, 30, '#ff3050', 0.4);
    const lg = this.lightG, lc = this.lightC;
    lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.globalCompositeOperation = 'source-over';
    lg.fillStyle = L.theme.ambient;
    lg.fillRect(0, 0, lc.width, lc.height);
    lg.globalCompositeOperation = 'lighter';
    lg.imageSmoothingEnabled = true;
    lg.setTransform(0.5, 0, 0, 0.5, -camX * 0.5, -camY * 0.5);
    for (const l of FX.lights) {
      if (l.x + l.r < view.x || l.x - l.r > view.x + view.w || l.y + l.r < view.y || l.y - l.r > view.y + view.h) continue;
      lg.globalAlpha = Math.min(1, l.a);
      lg.drawImage(glowTex(l.color, 'light'), l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    lg.globalAlpha = 1;
    FX.lights.length = 0;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.imageSmoothingEnabled = true;
    g.drawImage(lc, 0, 0, lc.width * 2 * S, lc.height * 2 * S);

    // ---- 发光叠加 ----
    world();
    g.globalCompositeOperation = 'lighter';
    for (const pt of this.portals) pt.drawGlow(g);
    for (const c of this.chests) c.drawGlow(g);
    for (const d of this.drops) d.drawGlow(g);
    for (const k of this.pickups) k.drawGlow(g);
    for (const e of this.enemies) e.drawGlow(g);
    if (this.player) this.player.drawGlow(g);
    for (const b of this.bullets) b.drawGlow(g);
    for (const b of this.ebullets) b.drawGlow(g);
    FX.drawGlowParts(g);
    FX.drawEffectsGlow(g);
    g.globalCompositeOperation = 'source-over';
    g.imageSmoothingEnabled = false;

    // 子弹本体 (不受光照影响, 保证可读性)
    for (const b of this.bullets) b.draw(g);
    for (const b of this.ebullets) b.draw(g);

    FX.drawTexts(g);
    if (this.interactTarget && this.state === 'play') HUD.drawPrompt(g, this.interactTarget);
  },

  drawTitle(g, U) {
    g.setTransform(U, 0, 0, U, 0, 0);
    const vw = this.vw, vh = this.vh, t = this.time;
    g.fillStyle = 'rgba(8,6,14,0.45)';
    g.fillRect(0, 0, vw, vh);
    // 骑士
    const k = SPR.knight[0];
    const kx = vw / 2, ky = vh * 0.53 + Math.sin(t * 2) * 1.5;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.5;
    g.drawImage(glowTex('#ffb060'), kx - 40, ky - 50, 80, 80);
    g.restore();
    drawShadow(g, kx, vh * 0.53 + 1, 14, 4, 0.4);
    drawSpr(g, k, kx, ky + 1, { sx: 3, sy: 3, ax: k.w / 2, ay: k.h });
    const sw = SPR.w.sword;
    drawSpr(g, sw, kx + 14, ky - 10, { ax: 3, ay: 3.5, rot: -1.15 + Math.sin(t * 2) * 0.05, sx: 2.5, sy: 2.5 });
    // 标题
    const ty = vh * 0.14;
    g.save();
    g.translate(vw / 2, ty);
    const pulse = 1 + Math.sin(t * 2.5) * 0.015;
    g.scale(pulse, pulse);
    g.font = `900 30px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.strokeStyle = '#120d1a';
    g.lineWidth = 8;
    g.strokeText('元气骑士', 0, 2);
    g.lineWidth = 6;
    g.strokeStyle = '#3a2a5a';
    g.strokeText('元气骑士', 0, 0);
    const gr = g.createLinearGradient(0, -14, 0, 14);
    gr.addColorStop(0, '#fff6c0');
    gr.addColorStop(0.5, '#ffd23a');
    gr.addColorStop(1, '#ff8a2a');
    g.fillStyle = gr;
    g.fillText('元气骑士', 0, 0);
    g.restore();
    uiText(g, 'S O U L   K N I G H T   ·   复 刻 版', vw / 2, ty + 22, 5.5, '#b8acd8', { align: 'center' });

    // 菜单
    this.menuItems().forEach((it, i) => {
      const y = vh * 0.66 + i * 16;
      const sel = i === this.menuIdx;
      if (sel) {
        panel(g, vw / 2 - 46, y - 7, 92, 14, { bg: 'rgba(255,210,58,0.18)', border: '#ffd23a' });
        const bx = Math.sin(t * 8) * 1.5;
        g.fillStyle = '#ffd23a';
        g.fillRect(vw / 2 - 42 + bx, y - 2, 3, 3);
        g.fillRect(vw / 2 + 39 - bx, y - 2, 3, 3);
      }
      uiText(g, it, vw / 2, y, 8, sel ? '#ffffff' : '#9a90b0', { align: 'center' });
    });
    uiText(g, this.menuIdx === 1 ? '所有武器陈列于出生房间, 随意试用' : '穿越三层地牢, 击败哥布林酋长', vw / 2, vh * 0.66 + 34, 5, '#c8c0d8', { align: 'center' });
    uiText(g, 'WASD 移动  ·  鼠标 瞄准/射击  ·  空格/右键 技能·双持  ·  Q/滚轮 换武器  ·  E 交互  ·  F 自动瞄准  ·  M 静音  ·  Esc 暂停', vw / 2, vh - 10, 4.5, '#8a80a0', { align: 'center', lw: 1.2 });
  },

  drawPause(g, U) {
    g.setTransform(U, 0, 0, U, 0, 0);
    const vw = this.vw, vh = this.vh;
    g.fillStyle = 'rgba(8,6,14,0.7)';
    g.fillRect(0, 0, vw, vh);
    uiText(g, '暂停', vw / 2, vh * 0.25, 16, '#ffffff', { align: 'center', lw: 3 });
    const lines = [
      ['WASD', '移动'], ['鼠标左键', '射击 (长按连发 / 弓需蓄力)'], ['空格 / 右键', '职业技能 (骑士双持 / 游侠翻滚 / 法师雷霆新星)'], ['贴身射击', '自动手刃 (不耗能量, 可斩断子弹)'],
      ['Q / 滚轮', '切换武器'], ['E', '拾取武器 / 开宝箱 / 传送门'], ['F', '自动瞄准开关'], ['M', '静音'],
    ];
    lines.forEach(([k, v], i) => {
      const y = vh * 0.38 + i * 11;
      uiText(g, k, vw / 2 - 8, y, 6, '#ffd23a', { align: 'right' });
      uiText(g, v, vw / 2 + 4, y, 6, '#e8e0f0');
    });
    uiText(g, 'Esc 继续   ·   T 返回标题', vw / 2, vh * 0.85, 6, '#9a90b0', { align: 'center' });
  },

  drawEnd(g, U, win) {
    g.setTransform(U, 0, 0, U, 0, 0);
    const vw = this.vw, vh = this.vh;
    const a = Math.min(1, this.stateT * 2);
    g.globalAlpha = a;
    g.fillStyle = win ? 'rgba(20,14,6,0.75)' : 'rgba(18,4,8,0.78)';
    g.fillRect(0, 0, vw, vh);
    const s = 1 + (1 - easeOutBack(Math.min(1, this.stateT * 2))) * 0.5;
    g.save();
    g.translate(vw / 2, vh * 0.3);
    g.scale(s, s);
    uiText(g, win ? '通关成功!' : '你倒下了...', 0, 0, 22, win ? '#ffd23a' : '#ff5a6a', { align: 'center', lw: 5 });
    g.restore();
    const p = this.player;
    const tm = Math.floor(this.runTime);
    const stats = [
      ['英雄', p.C.name],
      ['到达层数', this.levelLabel()],
      ['击败敌人', String(p.kills)],
      ['金币', String(p.coins)],
      ['用时', `${Math.floor(tm / 60)}:${String(tm % 60).padStart(2, '0')}`],
      ['武器', p.weapons.map(w => w.def.name).join(' / ')],
    ];
    panel(g, vw / 2 - 70, vh * 0.42, 140, stats.length * 11 + 8);
    stats.forEach(([k, v], i) => {
      const y = vh * 0.42 + 9 + i * 11;
      uiText(g, k, vw / 2 - 62, y, 6, '#b8acd0');
      uiText(g, v, vw / 2 + 62, y, 6, '#ffffff', { align: 'right' });
    });
    if (this.stateT > 1) {
      const blink = Math.sin(this.time * 5) > -0.3;
      if (blink) uiText(g, '点击 / R 再来一局   ·   Esc 返回标题', vw / 2, vh * 0.85, 7, '#ffffff', { align: 'center' });
    }
    g.globalAlpha = 1;
  },
};

addEventListener('load', () => Game.init());
