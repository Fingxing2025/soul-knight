'use strict';
// ============ 实体: 玩家 / 敌人 / Boss / 拾取物 / 宝箱 / 传送门 ============

// 与瓦片地图的轴分离碰撞
function moveBody(e, dx, dy) {
  const L = Game.level;
  const r = e.r, top = e.boxTop, bot = e.boxBot;
  let hit = 0;
  if (dx) {
    e.x += dx;
    const y0 = Math.floor((e.y - top) / TILE), y1 = Math.floor((e.y + bot) / TILE);
    if (dx > 0) {
      const tx = Math.floor((e.x + r) / TILE);
      for (let ty = y0; ty <= y1; ty++) if (L.solid(tx, ty)) { e.x = tx * TILE - r - 0.01; hit |= 1; break; }
    } else {
      const tx = Math.floor((e.x - r) / TILE);
      for (let ty = y0; ty <= y1; ty++) if (L.solid(tx, ty)) { e.x = (tx + 1) * TILE + r + 0.01; hit |= 1; break; }
    }
  }
  if (dy) {
    e.y += dy;
    const x0 = Math.floor((e.x - r) / TILE), x1 = Math.floor((e.x + r) / TILE);
    if (dy > 0) {
      const ty = Math.floor((e.y + bot) / TILE);
      for (let tx = x0; tx <= x1; tx++) if (L.solid(tx, ty)) { e.y = ty * TILE - bot - 0.01; hit |= 2; break; }
    } else {
      const ty = Math.floor((e.y - top) / TILE);
      for (let tx = x0; tx <= x1; tx++) if (L.solid(tx, ty)) { e.y = (ty + 1) * TILE + top + 0.01; hit |= 2; break; }
    }
  }
  return hit;
}

// ================= 玩家 =================
const CLASSES = {
  knight: {
    name: '骑士', spr: 'knight', hp: 7, armor: 6, energy: 180, speed: 84, weapons: ['pistol'], hand: '#c8d2e4',
    skill: 'dual', skillName: '双持', skillCd: 13, skillDur: 6, color: '#ffd23a', blade: 5,
    desc: '身披重甲的王国卫士', skillDesc: '6 秒内同时使用两把武器开火, 期间每击杀一个敌人延长 1 秒',
    killExtend: 1, maxSkillT: 10,
  },
  ranger: {
    name: '游侠', spr: 'ranger', hp: 5, armor: 5, energy: 180, speed: 112, weapons: ['bow', 'pistol'], hand: '#f2c8a0',
    skill: 'roll', skillName: '翻滚', skillCd: 1, skillDur: 0, color: '#6ad84a', blade: 4,
    desc: '身手矫健的森林猎人', skillDesc: '翻滚闪避并无敌, 之后 1.5 秒攻击必定暴击',
  },
  wizard: {
    name: '法师', spr: 'wizard', hp: 4, armor: 4, energy: 260, speed: 80, weapons: ['wand'], hand: '#f2c8a0',
    skill: 'nova', skillName: '雷霆新星', skillCd: 9, skillDur: 0, color: '#b48aff', blade: 4,
    dmgMul: 1.35, passive: '法力增幅: 所有伤害 +35%',
    desc: '驾驭雷电的大魔导师', skillDesc: '闪电秒杀周围普通怪物, 重创精英与首领, 并击碎附近子弹',
  },
};
const CLASS_IDS = Object.keys(CLASSES);
const MELEE_RANGE = 15; // 手刃触发距离
const ROLL_TIME = 0.32;
const NOVA_DMG = 45; // 对精英和 Boss 的伤害; 普通怪必定击杀

class Player {
  constructor(x, y, cls = 'knight') {
    const C = (this.C = CLASSES[cls]);
    this.cls = cls;
    this.x = x; this.y = y;
    this.r = 4.5; this.boxTop = 4; this.boxBot = 2.5;
    this.vx = 0; this.vy = 0;
    this.pvx = 0; this.pvy = 0;
    this.maxHp = this.hp = C.hp;
    this.maxArmor = this.armor = C.armor;
    this.maxEnergy = this.energy = C.energy;
    this.coins = 0;
    this.weapons = C.weapons.map(id => new Weapon(id));
    this.cur = 0;
    this.offhand = null;
    this.aim = 0; this.facing = 1;
    this.inv = 0; this.armorDelay = 0; this.armorTick = 0;
    this.anim = 0; this.moving = false; this.dustT = 0;
    this.skillT = 0; this.skillCd = 0; this.skillMaxCd = C.skillCd;
    this.rollT = 0; this.rollA = 0; this.ghosts = []; this.ghostT = 0; this.critT = 0;
    this.meleeCd = 0; this.knifeT = 0; this.knifeDir = 1; this.knifeAim = 0; this.meleeReady = false;
    this.dead = false; this.deadT = 0;
    this.noEnergyT = 0;
    this.autoAim = false;
    this.kills = 0;
  }
  get weapon() { return this.weapons[this.cur]; }
  get hx() { return this.x + 3 * this.facing; }
  get hy() { return this.y - 5; }
  get frames() { return SPR[this.C.spr]; }

  useEnergy(n) {
    if (n <= 0) return true;
    if (this.energy >= n) { this.energy -= n; return true; }
    if (this.noEnergyT <= 0) {
      FX.text(this.x, this.y - 22, '能量不足!', '#6ac8ff', 6);
      Sfx.play('noEnergy');
      this.noEnergyT = 0.8;
    }
    return false;
  }
  push(vx, vy) { this.pvx += vx; this.pvy += vy; }

  update(dt) {
    if (this.dead) { this.deadT += dt; return; }
    this.inv = Math.max(0, this.inv - dt);
    this.noEnergyT -= dt;
    this.critT -= dt;
    this.meleeCd -= dt;
    this.knifeT -= dt;
    for (const gh of this.ghosts) gh.t -= dt;
    this.ghosts = this.ghosts.filter(gh => gh.t > 0);

    // ----- 移动 / 翻滚 -----
    let mx = (Input.down('KeyD') || Input.down('ArrowRight') ? 1 : 0) - (Input.down('KeyA') || Input.down('ArrowLeft') ? 1 : 0);
    let my = (Input.down('KeyS') || Input.down('ArrowDown') ? 1 : 0) - (Input.down('KeyW') || Input.down('ArrowUp') ? 1 : 0);
    const ml = Math.hypot(mx, my);
    if (ml) { mx /= ml; my /= ml; }
    const pd = Math.exp(-10 * dt);
    this.pvx *= pd; this.pvy *= pd;
    if (this.rollT > 0) {
      this.rollT -= dt;
      const k = Math.max(0, this.rollT / ROLL_TIME);
      const sp = 110 + 200 * k;
      this.vx = Math.cos(this.rollA) * sp;
      this.vy = Math.sin(this.rollA) * sp;
      moveBody(this, this.vx * dt, this.vy * dt);
      this.ghostT -= dt;
      if (this.ghostT <= 0) {
        this.ghostT = 0.03;
        this.ghosts.push({ x: this.x, y: this.y, rot: this.rollRot(), facing: this.facing, t: 0.22 });
      }
      if (Math.random() < 0.5) FX.dust(this.x, this.y, 1);
      if (this.rollT <= 0) {
        FX.stars(this.x, this.y - 10, '#ffe060', 4, 6);
        this.vx *= 0.4; this.vy *= 0.4;
      }
    } else {
      const speed = this.C.speed;
      const acc = ml ? 14 : 18;
      this.vx = lerp(this.vx, mx * speed, 1 - Math.exp(-acc * dt));
      this.vy = lerp(this.vy, my * speed, 1 - Math.exp(-acc * dt));
      moveBody(this, (this.vx + this.pvx) * dt, (this.vy + this.pvy) * dt);
    }
    this.moving = ml > 0;
    if (this.moving) {
      this.anim += dt * 10;
      this.dustT -= dt;
      if (this.dustT <= 0) { this.dustT = 0.22; FX.dust(this.x - mx * 3, this.y); }
    } else this.anim = 0;

    // ----- 瞄准 -----
    const mw = Game.mouseWorld();
    let target = null;
    if (this.autoAim) {
      let bd = 220;
      for (const e of Game.enemies) {
        if (e.dead || e.dying) continue;
        const d = dist(this.x, this.y, e.x, e.y);
        if (d < bd && Game.level.los(this.hx, this.hy, e.x, e.y - e.hitY)) { bd = d; target = e; }
      }
    }
    if (target) this.aim = angleTo(this.hx, this.hy, target.x, target.y - target.hitY);
    else this.aim = angleTo(this.x, this.y - 5, mw.x, mw.y);
    this.facing = Math.cos(this.aim) < 0 ? -1 : 1;

    // ----- 换枪 -----
    if ((Input.hit('KeyQ') || Input.wheel() !== 0) && this.weapons.length > 1) this.switchWeapon();

    // ----- 技能 -----
    this.skillCd = Math.max(0, this.skillCd - dt);
    if ((Input.hit('Space') || Input.mouse.rightPressed) && this.skillCd <= 0 && this.skillT <= 0 && this.rollT <= 0) {
      this.useSkill(mx, my, ml);
    }
    if (this.skillT > 0) {
      this.skillT -= dt;
      if (Math.random() < dt * 20) FX.p({ x: this.x + rand(-6, 6), y: this.y - rand(0, 14), vy: rand(-30, -10), color: choice(['#ffd23a', '#fff0a0']), glow: true, life: 0.5, size: 1.2, size2: 0 });
      if (this.skillT <= 0) { if (this.offhand) this.offhand.pause(); this.offhand = null; }
    }
    if (this.critT > 0 && Math.random() < dt * 25) {
      FX.p({ x: this.hx + rand(-4, 4), y: this.hy + rand(-4, 4), vy: -15, color: '#ffe060', glow: true, life: 0.35, size: 1.2, size2: 0 });
    }

    // ----- 近身手刃 -----
    const trigger = Input.mouse.left || Input.down('KeyJ');
    let near = null;
    if (this.weapon.def.type !== 'melee') {
      let bd = Infinity;
      for (const e of Game.enemies) {
        if (e.dead || e.dying || e.appear > 0 || e.z > 20) continue;
        const d = dist(this.x, this.y - 5, e.x, e.y - e.hitY);
        if (d < MELEE_RANGE + e.hitR && d < bd) { bd = d; near = e; }
      }
    }
    this.meleeReady = !!near;
    if (trigger && near && this.meleeCd <= 0 && this.rollT <= 0) this.handBlade(near);

    // ----- 射击 -----
    const suspended = this.rollT > 0 || this.knifeT > 0 || (trigger && near);
    const ox = this.x - 4 * this.facing, oy = this.y - 6;
    if (suspended) {
      this.weapon.hold(dt);
      if (this.offhand) this.offhand.hold(dt);
    } else {
      this.weapon.update(dt, this, trigger, this.hx, this.hy, this.aim);
      if (this.offhand) this.offhand.update(dt, this, trigger, ox, oy, angleTo(ox, oy, this.hx + Math.cos(this.aim) * 80, this.hy + Math.sin(this.aim) * 80));
    }

    // ----- 护甲回复 -----
    this.armorDelay -= dt;
    if (this.armorDelay <= 0 && this.armor < this.maxArmor) {
      this.armorTick -= dt;
      if (this.armorTick <= 0) {
        this.armorTick = 0.9;
        this.armor++;
        FX.p({ x: this.x, y: this.y - 8, kind: 'orb', color: '#c8d8f0', glow: true, life: 0.3, size: 10, size2: 3 });
      }
    }
  }

  // ---------- 技能 ----------
  useSkill(mx, my, ml) {
    const C = this.C;
    this.skillCd = this.skillMaxCd;
    if (C.skill === 'dual') {
      this.skillT = C.skillDur;
      const other = this.weapons.length > 1 ? this.weapons[1 - this.cur] : null;
      this.offhand = other || new Weapon(this.weapon.id);
      Sfx.play('skill');
      FX.text(this.x, this.y - 24, '双持!', '#ffd23a', 8);
      FX.ring(this.x, this.y, 30, '#ffd23a', 0.5, 3);
      FX.stars(this.x, this.y - 8, '#ffe080', 10, 12);
      FX.flash('#ffe080', 0.15);
    } else if (C.skill === 'roll') {
      this.rollA = ml ? Math.atan2(my, mx) : this.aim;
      this.rollT = ROLL_TIME;
      this.critT = ROLL_TIME + 1.5;
      this.ghostT = 0;
      Sfx.play('roll');
      FX.dust(this.x, this.y, 4);
      FX.ring(this.x, this.y, 14, '#6ad84a', 0.3, 2);
    } else if (C.skill === 'nova') {
      this.castNova();
    }
  }

  // 击杀回调: 骑士双持期间延长技能时间
  onKill(e) {
    const C = this.C;
    if (C.killExtend && this.skillT > 0 && !this.dead) {
      const before = this.skillT;
      this.skillT = Math.min(C.maxSkillT, this.skillT + C.killExtend);
      if (this.skillT > before) {
        FX.text(this.x, this.y - 26, '+' + C.killExtend + 's', '#ffd23a', 7, 0.8);
        FX.ring(this.x, this.y, 18, '#ffd23a', 0.3, 2);
        FX.stars(this.x, this.y - 10, '#ffe080', 4, 8);
      }
    }
  }

  rollRot() {
    const k = 1 - Math.max(0, this.rollT) / ROLL_TIME;
    return easeOut(k) * TAU * (Math.cos(this.rollA) < 0 ? -1 : 1);
  }

  castNova() {
    const cx = this.x, cy = this.y - 10;
    const L = Game.level;
    const targets = Game.enemies
      .filter(e => !e.dead && !e.dying && e.appear <= 0 && dist(cx, cy, e.x, e.y) < 165 && L.los(cx, cy, e.x, e.y - e.hitY))
      .sort((a, b) => dist(cx, cy, a.x, a.y) - dist(cx, cy, b.x, b.y))
      .slice(0, 8);
    for (const e of targets) {
      const ex = e.x, ey = e.y - e.hitY;
      FX.lightning([[cx, cy - 6], [lerp(cx, ex, 0.5) + rand(-10, 10), lerp(cy, ey, 0.5) - 14], [ex, ey]], '#b48aff', 1.8);
      const a = angleTo(cx, cy, ex, ey);
      const dm = rollDmg(NOVA_DMG);
      if (!e.elite && e.type !== 'boss') dm.n = Math.max(dm.n, e.hp);
      e.hurt(dm, Math.cos(a) * 120, Math.sin(a) * 120);
      e.stun = Math.max(e.stun || 0, 1.0);
      FX.sparks(ex, ey, rand(TAU), '#e8d0ff', 8, 130, Math.PI);
    }
    let cut = 0;
    for (const b of Game.ebullets) {
      if (!b.dead && dist(cx, cy, b.x, b.y) < 75) {
        b.dead = true; cut++;
        FX.p({ x: b.x, y: b.y, kind: 'orb', color: '#b48aff', glow: true, life: 0.2, size: 6, size2: 0 });
      }
    }
    FX.ring(this.x, this.y, 70, '#b48aff', 0.5, 4);
    FX.ring(this.x, this.y, 45, '#ffffff', 0.35, 2);
    FX.stars(cx, cy, '#d8c0ff', 14, 18);
    FX.flash('#b48aff', 0.22);
    FX.addShake(4);
    FX.light(this.x, this.y, 140, '#b48aff', 1);
    FX.text(this.x, this.y - 26, '雷霆新星!', '#d8c0ff', 8);
    Sfx.play('lightning');
    Sfx.play('skill');
  }

  // 近身手刃: 敌人贴脸时自动用匕首劈砍 (不耗能量)
  handBlade(target) {
    const a = angleTo(this.x, this.y - 5, target.x, target.y - target.hitY);
    this.aim = a;
    this.facing = Math.cos(a) < 0 ? -1 : 1;
    this.meleeCd = 0.32;
    this.knifeT = 0.18;
    this.knifeDir = -this.knifeDir;
    this.knifeAim = a;
    const cx = this.x + Math.cos(a) * 3, cy = this.y - 5 + Math.sin(a) * 3;
    FX.slash(cx, cy, a, this.knifeDir, MELEE_RANGE + 2, '#9fd0ff', 5);
    Sfx.play('sword');
    const R = MELEE_RANGE + 4;
    let hits = 0;
    for (const e of Game.enemies) {
      if (e.dead || e.dying) continue;
      const ex = e.x, ey = e.y - e.hitY;
      const d = dist(cx, cy, ex, ey);
      if (d > R + e.hitR) continue;
      if (d > 8 && Math.abs(angDiff(a, angleTo(cx, cy, ex, ey))) > 1.3) continue;
      const ka = angleTo(this.x, this.y, e.x, e.y);
      e.hurt(rollDmg(this.C.blade), Math.cos(ka) * 170, Math.sin(ka) * 170);
      FX.sparks(ex, ey, ka, '#ffffff', 6, 140);
      hits++;
    }
    for (const b of Game.ebullets) {
      if (b.dead) continue;
      const d = dist(cx, cy, b.x, b.y);
      if (d < R + 3 && (d < 7 || Math.abs(angDiff(a, angleTo(cx, cy, b.x, b.y))) < 1.3)) {
        b.dead = true;
        FX.sparks(b.x, b.y, rand(TAU), b.color, 4, 100, Math.PI);
        Sfx.play('deflect');
      }
    }
    const pr = Game.level.propAtPx(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12);
    if (pr) pr.hit(this.C.blade, Game.level);
    if (hits) { FX.hitstop = Math.max(FX.hitstop, 0.045); FX.addShake(1.5); }
    this.push(Math.cos(a) * 40, Math.sin(a) * 40);
  }

  switchWeapon() {
    if (this.skillT > 0) this.weapon.pause();
    else this.weapon.stop();
    this.cur = 1 - this.cur;
    if (this.offhand) { this.offhand.pause(); this.offhand = this.weapons[1 - this.cur]; }
    Sfx.play('swap');
    const w = this.weapon;
    FX.text(this.x, this.y - 24, w.def.name, RARITY[w.def.rarity].color, 6, 0.8);
  }

  pickWeapon(drop) {
    const nw = new Weapon(drop.id);
    if (this.weapons.length < 2) {
      this.weapons.push(nw);
      this.weapon.stop();
      this.cur = this.weapons.length - 1;
      Game.removeDrop(drop);
    } else {
      const old = this.weapon;
      old.stop();
      this.weapons[this.cur] = nw;
      drop.id = old.id;
      drop.vz = 60; drop.z = 2;
      if (this.offhand === old) this.offhand = this.weapons[1 - this.cur];
    }
    Sfx.play('pickup');
    FX.text(this.x, this.y - 24, nw.def.name, RARITY[nw.def.rarity].color, 7);
    FX.stars(this.x, this.y - 8, RARITY[nw.def.rarity].color, 6, 10);
  }

  hurt(dmg) {
    if (this.inv > 0 || this.dead || this.rollT > 0 || Game.godMode) return false;
    let rest = dmg;
    if (this.armor > 0) {
      const a = Math.min(this.armor, rest);
      this.armor -= a;
      rest -= a;
      if (this.armor === 0) {
        Sfx.play('armorBreak');
        for (let i = 0; i < 10; i++) FX.p({ x: this.x, y: this.y - 7, z: 0, vx: rand(-80, 80), vy: rand(-80, 40), color: choice(['#c8d8f0', '#ffffff', '#8aa0c8']), life: 0.6, size: rand(1, 2.5), drag: 4, glow: true });
      }
    }
    this.hp -= rest;
    this.inv = 0.85;
    this.armorDelay = 3.5;
    this.armorTick = 0;
    FX.hurtFlash = rest > 0 ? 1 : 0.6;
    FX.addShake(5);
    FX.hitstop = Math.max(FX.hitstop, 0.06);
    Sfx.play('hurt');
    FX.dmg(this.x, this.y - 16, dmg, false, rest > 0 ? '#ff5a5a' : '#c8d8f0');
    FX.burst(this.x, this.y - 6, rest > 0 ? '#ff4a5a' : '#c8d8f0', 8, 70);
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
    return true;
  }

  die() {
    this.dead = true;
    this.weapon.stop();
    if (this.offhand) this.offhand.stop();
    Sfx.play('gameover');
    FX.burst(this.x, this.y - 6, '#ff4a5a', 20, 100);
    FX.addShake(8);
    FX.slowmo = 1.2;
    Game.level.splat(this.x, this.y, '#b02030', 2);
  }

  heal(n) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    return this.hp - before;
  }

  draw(g) {
    const t = Game.time;
    const frames = this.frames;
    if (this.dead) {
      drawShadow(g, this.x, this.y, 7, 2.5);
      drawSpr(g, frames[0], this.x, this.y - 3, { rot: -Math.PI / 2 * this.facing, flipX: this.facing < 0, ay: frames[0].h / 2 });
      return;
    }
    // 翻滚残影
    for (const gh of this.ghosts) {
      g.globalAlpha = (gh.t / 0.22) * 0.45;
      drawSpr(g, frames[0], gh.x, gh.y - frames[0].h / 2 + 1, { flash: true, rot: gh.rot, flipX: gh.facing < 0, ay: frames[0].h / 2 });
    }
    g.globalAlpha = 1;
    if (this.rollT > 0) {
      drawShadow(g, this.x, this.y, 5, 2);
      drawSpr(g, frames[0], this.x, this.y - frames[0].h / 2 + 1, { rot: this.rollRot(), flipX: this.facing < 0, ay: frames[0].h / 2 });
      return;
    }
    const fi = this.moving ? 1 + (Math.floor(this.anim) % 3) : 0;
    const bob = this.moving ? (Math.floor(this.anim) % 2 ? -1 : 0) : Math.round(Math.sin(t * 3) * 0.5 - 0.5) * 0.5;
    const blink = this.inv > 0 && Math.floor(this.inv * 20) % 2 === 0;
    const flash = this.inv > 0.7;

    if (this.skillT > 0) {
      g.save();
      g.globalAlpha = 0.5 + Math.sin(t * 10) * 0.2;
      g.strokeStyle = this.C.color;
      g.lineWidth = 1;
      g.beginPath(); g.ellipse(this.x, this.y, 9, 3.5, 0, 0, TAU); g.stroke();
      g.restore();
    }
    drawShadow(g, this.x, this.y, 6, 2.2);
    if (blink) g.globalAlpha = 0.4;

    const aimUp = Math.sin(this.aim) < -0.4;
    const drawWeapons = () => {
      if (this.offhand) this.offhand.draw(g, this.x - 4 * this.facing, this.y - 6 + bob, this.aim, flash);
      let hx, hy;
      if (this.knifeT > 0) {
        // 手刃: 匕首挥砍
        const k = 1 - this.knifeT / 0.18;
        const rot = this.knifeAim + lerp(-1.5, 1.5, easeOut(k)) * this.knifeDir;
        const flip = Math.cos(this.knifeAim) < 0 ? -1 : 1;
        hx = this.x + Math.cos(this.knifeAim) * 4; hy = this.y - 5 + bob + Math.sin(this.knifeAim) * 3;
        drawSpr(g, SPR.w.knife, hx, hy, { ax: 2, ay: 2.5, rot, sy: flip, flash });
      } else {
        this.weapon.draw(g, this.hx, this.hy + bob, this.aim, flash);
        hx = this.hx - Math.cos(this.aim) * this.weapon.recoil;
        hy = this.hy + bob - Math.sin(this.aim) * this.weapon.recoil;
      }
      g.fillStyle = OUTLINE;
      g.fillRect(hx - 1.5, hy - 1.5, 3, 3);
      g.fillStyle = this.C.hand;
      g.fillRect(hx - 1, hy - 1, 2, 2);
    };
    if (aimUp) drawWeapons();
    drawSpr(g, frames[fi], this.x, this.y + 1 + bob, { flipX: this.facing < 0, flash });
    if (!aimUp) drawWeapons();
    g.globalAlpha = 1;
  }

  drawGlow(g) {
    if (this.dead || this.rollT > 0) return;
    if (this.knifeT <= 0) this.weapon.drawGlow(g, this.hx, this.hy, this.aim);
    if (this.offhand) this.offhand.drawGlow(g, this.x - 4 * this.facing, this.y - 6, this.aim);
    if (this.critT > 0) {
      g.globalAlpha = 0.35 + Math.sin(Game.time * 20) * 0.1;
      g.drawImage(glowTex('#ffe060'), this.x - 12, this.y - 20, 24, 24);
      g.globalAlpha = 1;
    }
  }
}

// ================= 敌人 =================
const ENEMY_TYPES = {
  goblin: { name: '哥布林枪手', hp: 14, speed: 36, r: 4.5, hitR: 6, hitY: 6, spr: 'goblin', blood: '#3c9a2a', color: '#ff6a3a', loot: [1, 3] },
  shaman: { name: '哥布林祭司', hp: 18, speed: 30, r: 4.5, hitR: 6, hitY: 7, spr: 'shaman', blood: '#3c9a2a', color: '#c86aff', loot: [2, 3] },
  boar: { name: '狂暴野猪', hp: 26, speed: 34, r: 7, hitR: 8, hitY: 6, spr: 'boar', blood: '#b02030', color: '#ff6a3a', loot: [2, 4] },
  slime: { name: '史莱姆', hp: 12, speed: 0, r: 5, hitR: 6, hitY: 4, spr: 'slime', blood: '#3ad0c0', color: '#4fe0d0', loot: [1, 2] },
  bat: { name: '蝙蝠', hp: 9, speed: 55, r: 4, hitR: 6, hitY: 12, spr: 'bat', blood: '#8a3ab0', color: '#ff5ad0', loot: [1, 2], flying: true },
  boss: { name: '哥布林酋长', hp: 900, speed: 40, r: 10, hitR: 13, hitY: 14, spr: 'boss', blood: '#3c9a2a', color: '#ff3a4a', loot: [0, 0] },
};

class Enemy {
  constructor(type, x, y, room, elite = false) {
    const T = ENEMY_TYPES[type];
    this.type = type; this.T = T;
    this.x = x; this.y = y; this.room = room; this.elite = elite;
    this.maxHp = this.hp = Math.round(T.hp * (elite ? 2.4 : 1) * (1 + (Game.levelNum - 1) * 0.15));
    this.r = T.r * (elite ? 1.15 : 1);
    this.boxTop = this.r * 0.8; this.boxBot = 2;
    this.hitR = T.hitR * (elite ? 1.2 : 1);
    this.hitY = T.hitY * (elite ? 1.2 : 1);
    this.scale = elite ? 1.2 : 1;
    this.speed = T.speed;
    this.kx = 0; this.ky = 0;
    this.vx = 0; this.vy = 0;
    this.flash = 0; this.anim = rand(10); this.facing = 1;
    this.state = 'move'; this.timer = rand(0.5, 1.2);
    this.tx = x; this.ty = y;
    this.dead = false; this.z = 0; this.vz = 0;
    this.aim = 0; this.stun = 0; this.slow = 0;
    this.appear = 0.3;
    this.frames = SPR[T.spr + (elite ? 'Elite' : '')];
  }
  get p() { return Game.player; }

  update(dt) {
    if (this.appear > 0) this.appear -= dt;
    this.flash -= dt;
    this.slow = Math.max(0, this.slow - dt);
    const sdt = this.slow > 0 ? dt * 0.5 : dt;
    if (this.slow > 0 && Math.random() < dt * 8) FX.p({ x: this.x + rand(-5, 5), y: this.y - rand(0, 12), vy: -8, kind: 'star', color: '#bff4ff', glow: true, life: 0.4, size: 1.2 });
    if (this.stun > 0) {
      this.stun -= dt;
    } else if (this.sideT > 0 && this.state === 'move') {
      // 绕开障碍
      this.sideT -= dt;
      this.vx = Math.cos(this.sideA) * this.speed;
      this.vy = Math.sin(this.sideA) * this.speed;
    } else {
      AI[this.type](this, sdt);
    }
    // 击退
    const kd = Math.exp(-12 * dt);
    this.kx *= kd; this.ky *= kd;
    const hit = moveBody(this, (this.vx + this.kx) * sdt, (this.vy + this.ky) * sdt);
    this.lastHit = hit;
    if (hit && this.state === 'move' && !(this.sideT > 0) && Math.hypot(this.vx, this.vy) > 5 && this.type !== 'boss') {
      const a = Math.atan2(this.vy, this.vx);
      this.sideA = a + (chance(0.5) ? 1 : -1) * Math.PI / 2;
      this.sideT = rand(0.3, 0.6);
    }
    // 分离
    for (const o of Game.enemies) {
      if (o === this || o.dead || o.T.flying !== this.T.flying) continue;
      const dx = this.x - o.x, dy = this.y - o.y;
      const d2 = dx * dx + dy * dy, rr = (this.r + o.r) * 0.9;
      if (d2 < rr * rr && d2 > 0.01) {
        const d = Math.sqrt(d2), push = (rr - d) * 0.5;
        moveBody(this, (dx / d) * push, (dy / d) * push);
      }
    }
    // 与玩家的碰撞: 推开 + 接触伤害
    const pl = Game.player;
    if (pl && !pl.dead && this.appear <= 0 && !this.dying && this.z < 10) {
      const dx = this.x - pl.x, dy = this.y - pl.y;
      const d = Math.hypot(dx, dy), rr = this.r + pl.r;
      if (d < rr) {
        if (d > 0.01 && this.type !== 'boss') moveBody(this, (dx / d) * (rr - d) * 0.7, (dy / d) * (rr - d) * 0.7);
        if (pl.hurt(this.type === 'boss' ? 2 : 1)) {
          const a = Math.atan2(-dy, -dx);
          pl.push(Math.cos(a) * 140, Math.sin(a) * 140);
        }
      }
    }
    const sp = Math.hypot(this.vx, this.vy);
    this.anim += dt * (sp > 5 ? sp / 7 : 0);
    if (this.elite && Math.random() < dt * 6) FX.p({ x: this.x + rand(-6, 6), y: this.y - rand(0, 10), vy: -20, color: '#ff3050', glow: true, life: 0.5, size: 1.2, size2: 0 });
  }

  // 朝目标点移动
  moveTo(x, y, spd) {
    const d = dist(this.x, this.y, x, y);
    if (d < 3) { this.vx = this.vy = 0; return true; }
    this.vx = ((x - this.x) / d) * spd;
    this.vy = ((y - this.y) / d) * spd;
    this.facing = this.vx < 0 ? -1 : 1;
    return false;
  }
  pickSpot(minR, maxR) {
    const p = this.p;
    for (let i = 0; i < 12; i++) {
      const a = rand(TAU), d = rand(minR, maxR);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (this.room && !this.room.contains(x, y, 10)) continue;
      if (Game.level.solidPx(x, y)) continue;
      this.tx = x; this.ty = y;
      return;
    }
    this.tx = this.x + rand(-30, 30); this.ty = this.y + rand(-30, 30);
  }
  shoot(ang, speed, o = {}) {
    const hx = this.x + Math.cos(ang) * 6, hy = this.y - this.hitY + Math.sin(ang) * 6;
    Game.addEBullet(new Bullet(Object.assign({ x: hx, y: hy, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, team: 'e', style: 'orb', color: this.T.color, dmg: 1, r: 2.8, life: 5 }, o)));
  }

  hurt(dm, kx = 0, ky = 0) {
    if (this.dead || this.dying) return;
    const n = typeof dm === 'number' ? dm : dm.n;
    const crit = typeof dm === 'object' && dm.crit;
    this.hp -= n;
    this.flash = 0.09;
    const kres = this.type === 'boss' ? 0.08 : this.elite ? 0.5 : 1;
    this.kx += kx * kres; this.ky += ky * kres;
    FX.dmg(this.x, this.y - this.hitY * 2 - 4, n, crit);
    FX.burst(this.x, this.y - this.hitY, this.T.blood, crit ? 6 : 3, 60, { grav: 0, life: 0.4 });
    if (crit) { Sfx.play('crit'); FX.hitstop = Math.max(FX.hitstop, 0.03); }
    else Sfx.play('hit', 0.04);
    if (this.type === 'boss') Game.bossHit = 0.15;
    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.vx = this.vy = 0;
    if (this.type === 'boss') { Game.bossDefeated(this); return; }
    Sfx.play('enemyDie');
    FX.burst(this.x, this.y - this.hitY, this.T.blood, 14, 100);
    FX.burst(this.x, this.y - this.hitY, '#ffffff', 6, 60);
    FX.smoke(this.x, this.y - 4, 3, { alpha: 0.4 });
    FX.addShake(1.5);
    FX.hitstop = Math.max(FX.hitstop, 0.025);
    Game.level.splat(this.x, this.y, this.T.blood, this.elite ? 1.6 : 1.1);
    Game.corpses.push({ spr: this.frames[0], x: this.x, y: this.y, facing: this.facing, t: 0, scale: this.scale, fly: this.T.flying });
    const [a, b] = this.T.loot;
    const mult = this.elite ? 2 : 1;
    Game.dropLoot(this.x, this.y - 4, 'coin', randi(a, b) * mult);
    if (chance(0.55)) Game.dropLoot(this.x, this.y - 4, 'energy', randi(1, 3) * mult);
    if (this.elite && chance(0.25)) Game.dropLoot(this.x, this.y - 4, 'potion', 1);
    Game.player.kills++;
    Game.player.onKill(this);
    if (this.type === 'slime') {
      for (let i = 0; i < 6; i++) this.shoot((i / 6) * TAU, 60, { r: 2.4 });
    }
  }

  draw(g) {
    const fl = this.flash > 0;
    const T = this.T;
    const app = this.appear > 0 ? 1 - this.appear / 0.3 : 1;
    let sx = this.scale, sy = this.scale;
    if (this.appear > 0) { sx *= easeOutBack(app); sy *= easeOutBack(app); }
    let fi = 0;
    if (T.flying) fi = Math.floor(Game.time * 10 + this.anim) % 2;
    else if (this.frames.length > 1 && Math.hypot(this.vx, this.vy) > 5) fi = 1 + (Math.floor(this.anim) % 3);
    let ox = 0, oy = 0;
    // 状态视觉
    if (this.state === 'prep' || this.state === 'aim2') { ox = rand(-1, 1); }
    if (this.type === 'slime') {
      const sq = this.squash || 0;
      sx *= 1 + sq * 0.25; sy *= 1 - sq * 0.25;
    }
    const z = this.z + (T.flying ? 8 + Math.sin(Game.time * 4 + this.anim) * 1.5 : 0);
    drawShadow(g, this.x, this.y, this.r * 1.3 * (T.flying ? 0.8 : 1), this.r * 0.5, T.flying ? 0.22 : 0.32);
    const spr = this.frames[fi];

    // 武器在身后 (向上瞄准)
    const aimUp = Math.sin(this.aim) < -0.4;
    if (aimUp) this.drawWeapon(g, fl);
    drawSpr(g, spr, this.x + ox, this.y + 1 + oy - z, { flipX: this.facing < 0, flash: fl, sx, sy });
    if (!aimUp) this.drawWeapon(g, fl);

    if (this.stun > 0.3 && this.type !== 'boss') {
      for (let i = 0; i < 3; i++) {
        const a = Game.time * 6 + (i * TAU) / 3;
        g.fillStyle = '#ffe060';
        g.fillRect(this.x + Math.cos(a) * 6 - 0.5, this.y - spr.h * sy - 2 + Math.sin(a) * 2 - z, 1.5, 1.5);
      }
    }
    if (this.state === 'prep' && this.type === 'boar') {
      drawPixelText(g, '!', this.x, this.y - 22, '#ff4040', { align: 'center' });
    }
  }
  drawWeapon(g, fl) {
    if (this.type === 'goblin') {
      const hx = this.x + 2 * this.facing, hy = this.y - 4;
      drawSpr(g, SPR.w.egun, hx, hy, { ax: 3, ay: 3, rot: this.aim, sy: Math.cos(this.aim) < 0 ? -1 : 1, flash: fl });
    } else if (this.type === 'shaman') {
      const hx = this.x + 3 * this.facing, hy = this.y - 5;
      drawSpr(g, SPR.w.estaff, hx, hy, { ax: 4, ay: 2.5, rot: this.state === 'cast' ? -Math.PI / 2 + Math.sin(Game.time * 20) * 0.1 : this.aim, sy: Math.cos(this.aim) < 0 ? -1 : 1, flash: fl });
    }
  }
  drawGlow(g) {
    if (this.type === 'shaman' && this.state === 'cast') {
      const k = 1 - this.timer / 0.7;
      const s = 4 + k * 10;
      const x = this.x + 3 * this.facing, y = this.y - 16;
      g.globalAlpha = 0.9;
      g.drawImage(glowTex('#c86aff'), x - s, y - s, s * 2, s * 2);
      g.globalAlpha = 1;
    }
    if (this.type === 'goblin' && this.state === 'aim') {
      const hx = this.x + 2 * this.facing + Math.cos(this.aim) * 8, hy = this.y - 4 + Math.sin(this.aim) * 8;
      g.globalAlpha = 0.6 + Math.sin(Game.time * 40) * 0.4;
      g.drawImage(glowTex('#ff6a3a'), hx - 4, hy - 4, 8, 8);
      g.globalAlpha = 1;
    }
    if (this.elite) {
      g.globalAlpha = 0.25;
      g.drawImage(glowTex('#ff2040'), this.x - 14, this.y - 20, 28, 28);
      g.globalAlpha = 1;
    }
  }
}

// ---------- 敌人 AI ----------
const AI = {
  goblin(e, dt) {
    const p = e.p;
    e.timer -= dt;
    if (e.state === 'move') {
      e.aim = angleTo(e.x, e.y - 4, p.x, p.y - 6);
      if (e.moveTo(e.tx, e.ty, e.speed)) e.vx = e.vy = 0;
      if (e.timer <= 0) { e.state = 'aim'; e.timer = e.elite ? 0.3 : 0.45; e.vx = e.vy = 0; }
    } else if (e.state === 'aim') {
      e.aim = angleTo(e.x, e.y - 4, p.x, p.y - 6);
      e.facing = Math.cos(e.aim) < 0 ? -1 : 1;
      if (e.timer <= 0) {
        if (Game.level.los(e.x, e.y - 4, p.x, p.y - 6)) {
          const n = e.elite ? 3 : 1;
          for (let i = 0; i < n; i++) e.shoot(e.aim + (i - (n - 1) / 2) * 0.22, 105);
          Sfx.play('enemyShoot');
          FX.muzzle(e.x + Math.cos(e.aim) * 9, e.y - 4 + Math.sin(e.aim) * 9, e.aim, '#ff8a4a', 0.6);
        }
        e.state = 'move';
        e.timer = rand(0.9, 1.7);
        e.pickSpot(45, 100);
      }
    }
  },
  shaman(e, dt) {
    const p = e.p;
    e.timer -= dt;
    e.aim = angleTo(e.x, e.y, p.x, p.y);
    if (e.state === 'move') {
      e.moveTo(e.tx, e.ty, e.speed);
      if (e.timer <= 0) { e.state = 'cast'; e.timer = 0.7; e.vx = e.vy = 0; Sfx.play('enemyCast'); }
    } else if (e.state === 'cast') {
      e.facing = p.x < e.x ? -1 : 1;
      if (Math.random() < 0.6) {
        const a = rand(TAU);
        FX.p({ x: e.x + 3 * e.facing + Math.cos(a) * 14, y: e.y - 16 + Math.sin(a) * 14, vx: -Math.cos(a) * 40, vy: -Math.sin(a) * 40, color: '#d8a0ff', glow: true, life: 0.3, size: 1.2, size2: 0 });
      }
      if (e.timer <= 0) {
        const ox = e.x + 3 * e.facing, oy = e.y - 16;
        if (chance(0.5)) {
          const n = e.elite ? 16 : 10;
          const off = rand(TAU);
          for (let i = 0; i < n; i++) {
            const a = off + (i / n) * TAU;
            Game.addEBullet(new Bullet({ x: ox, y: oy, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, team: 'e', color: '#c86aff', r: 3, life: 5 }));
          }
        } else {
          for (let i = -1; i <= 1; i++) {
            const a = e.aim + i * 0.5;
            Game.addEBullet(new Bullet({ x: ox, y: oy, vx: Math.cos(a) * 75, vy: Math.sin(a) * 75, team: 'e', color: '#e05aff', r: 3.5, life: 4, homing: 1.4 }));
          }
        }
        FX.ring(ox, oy, 16, '#c86aff', 0.3, 2);
        Sfx.play('staffOrb');
        e.state = 'move';
        e.timer = rand(1.6, 2.6);
        e.pickSpot(90, 130);
      }
    }
  },
  boar(e, dt) {
    const p = e.p;
    e.timer -= dt;
    if (e.state === 'move') {
      e.moveTo(p.x, p.y, e.speed);
      if (e.timer <= 0 && dist(e.x, e.y, p.x, p.y) < 170) {
        e.state = 'prep'; e.timer = 0.55; e.vx = e.vy = 0;
        e.chargeA = angleTo(e.x, e.y, p.x, p.y);
        e.facing = Math.cos(e.chargeA) < 0 ? -1 : 1;
        Sfx.play('boarCharge');
      }
    } else if (e.state === 'prep') {
      e.chargeA = angleTo(e.x, e.y, p.x, p.y);
      e.facing = Math.cos(e.chargeA) < 0 ? -1 : 1;
      if (Math.random() < 0.5) FX.dust(e.x - e.facing * 6, e.y, 1);
      if (e.timer <= 0) { e.state = 'charge'; e.timer = 1.1; }
    } else if (e.state === 'charge') {
      const sp = e.elite ? 230 : 195;
      e.vx = Math.cos(e.chargeA) * sp;
      e.vy = Math.sin(e.chargeA) * sp;
      e.anim += dt * 10;
      if (Math.random() < 0.6) FX.dust(e.x - e.facing * 7, e.y, 1);
      if (dist(e.x, e.y, p.x, p.y) < e.r + 6) p.hurt(2);
      if (e.lastHit || e.timer <= 0) {
        if (e.lastHit) {
          e.stun = 0.9;
          FX.addShake(3);
          FX.smoke(e.x + e.facing * 8, e.y - 6, 4, { alpha: 0.5 });
          FX.debris(e.x + e.facing * 8, e.y - 6, ['#8a8478', '#5a564e'], 5, 60);
          Sfx.play('slam', 0.1);
          if (e.elite) for (let i = 0; i < 8; i++) e.shoot((i / 8) * TAU, 80);
        }
        e.state = 'move';
        e.timer = rand(1.2, 2);
        e.vx = e.vy = 0;
      }
    }
  },
  slime(e, dt) {
    const p = e.p;
    e.timer -= dt;
    e.squash = Math.max(0, (e.squash || 0) - dt * 4);
    if (e.state === 'move') {
      e.vx = e.vy = 0;
      e.squash = 0.4 + Math.sin(Game.time * 8) * 0.2 * (e.timer < 0.3 ? 2 : 1);
      if (e.timer <= 0) {
        e.state = 'hop';
        e.timer = 0.55;
        e.vz = 120;
        const a = angleTo(e.x, e.y, p.x, p.y) + rand(-0.4, 0.4);
        const d = Math.min(70, dist(e.x, e.y, p.x, p.y));
        e.vx = Math.cos(a) * d / 0.55;
        e.vy = Math.sin(a) * d / 0.55;
        e.facing = e.vx < 0 ? -1 : 1;
        Sfx.play('slimeHop', 0.08);
      }
    } else if (e.state === 'hop') {
      e.vz -= 440 * dt;
      e.z = Math.max(0, e.z + e.vz * dt);
      e.squash = -0.3;
      if (e.timer <= 0 || (e.z <= 0 && e.vz < 0)) {
        e.z = 0;
        e.state = 'move';
        e.timer = rand(0.8, 1.4);
        e.squash = 1;
        e.vx = e.vy = 0;
        Sfx.play('slimeLand', 0.08);
        FX.p({ x: e.x, y: e.y, kind: 'smoke', color: '#4fd1c5', alpha: 0.4, life: 0.3, size: 3, size2: 9 });
        const n = e.elite ? 10 : 5;
        const off = rand(TAU);
        for (let i = 0; i < n; i++) e.shoot(off + (i / n) * TAU, 70, { r: 2.5 });
      }
    }
  },
  bat(e, dt) {
    const p = e.p;
    e.timer -= dt;
    e.orbit = (e.orbit || rand(TAU)) + dt * 1.1;
    const orb = 42 + Math.sin(Game.time * 0.9 + e.anim) * 26;
    const tx = p.x + Math.cos(e.orbit) * orb, ty = p.y + Math.sin(e.orbit) * orb * 0.75;
    const want = angleTo(e.x, e.y, tx, ty);
    e.vx = lerp(e.vx, Math.cos(want) * e.speed + Math.sin(Game.time * 3 + e.anim) * 20, 1 - Math.exp(-3 * dt));
    e.vy = lerp(e.vy, Math.sin(want) * e.speed + Math.cos(Game.time * 2.3 + e.anim) * 20, 1 - Math.exp(-3 * dt));
    e.facing = p.x < e.x ? -1 : 1;
    if (e.timer <= 0) {
      e.timer = rand(1.6, 2.4);
      const a = angleTo(e.x, e.y - 12, p.x, p.y - 6);
      const n = e.elite ? 5 : 3;
      for (let i = 0; i < n; i++) e.shoot(a + (i - (n - 1) / 2) * 0.25, 95, { r: 2.5 });
      Sfx.play('enemyShoot');
    }
  },
  boss(e, dt) { BossAI(e, dt); },
};

// ================= Boss =================
function BossAI(e, dt) {
  const p = e.p;
  e.timer -= dt;
  e.atkT = (e.atkT || 0) + dt;
  const rage = e.hp < e.maxHp * 0.5;
  if (rage && !e.raged) {
    e.raged = true;
    e.frames = SPR.bossRage;
    e.state = 'roar'; e.timer = 1.2;
    Sfx.play('roar');
    FX.addShake(8);
    FX.ring(e.x, e.y - 14, 60, '#ff3040', 0.6, 4);
    FX.text(e.x, e.y - 40, '酋长暴怒了!', '#ff4050', 9, 1.6);
    e.vx = e.vy = 0;
    return;
  }
  const spd = rage ? 1.3 : 1;
  const bx = e.x, by = e.y - 14;
  switch (e.state) {
    case 'intro':
    case 'roar':
      e.vx = e.vy = 0;
      if (Math.random() < 0.3) FX.dust(e.x + rand(-12, 12), e.y);
      if (e.timer <= 0) { e.state = 'idle'; e.timer = 0.6; }
      break;
    case 'idle': {
      e.moveTo(p.x, p.y, e.speed * 0.7);
      e.aim = angleTo(bx, by, p.x, p.y);
      if (e.timer <= 0) {
        const opts = [['ring', 3], ['spiral', 3], ['shotgun', 3], ['charge', 3], ['slam', 3]];
        if (rage) opts.push(['summon', Game.enemies.filter(x => !x.dead).length < 4 ? 2 : 0]);
        let next;
        do { next = weightedPick(opts); } while (next === e.lastAtk && chance(0.7));
        e.lastAtk = next;
        e.state = next;
        e.step = 0; e.atkT = 0;
        e.vx = e.vy = 0;
        e.timer = { ring: 0.4, spiral: 3.0, shotgun: 0.35, charge: 0.7, slam: 0.6, summon: 1.0 }[next];
        if (next === 'charge') { e.charges = rage ? 3 : 2; e.chargeA = angleTo(e.x, e.y, p.x, p.y); Sfx.play('bossCharge'); }
        if (next === 'slam') { Sfx.play('bossCharge'); }
        if (next === 'summon') { Sfx.play('roar'); }
      }
      break;
    }
    case 'ring':
      e.vx = e.vy = 0;
      if (e.timer <= 0) {
        const n = rage ? 28 : 22;
        const off = e.step * (Math.PI / n);
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * TAU;
          Game.addEBullet(new Bullet({ x: bx, y: by, vx: Math.cos(a) * 85, vy: Math.sin(a) * 85, team: 'e', color: e.step % 2 ? '#ffb030' : '#ff3a4a', r: 3.2, life: 6 }));
        }
        FX.ring(bx, by, 26, '#ff5a4a', 0.35, 3);
        FX.addShake(2);
        Sfx.play('enemyCast');
        e.step++;
        e.timer = 0.38 / spd;
        if (e.step >= (rage ? 4 : 3)) { e.state = 'idle'; e.timer = 1.0 / spd; }
      }
      break;
    case 'spiral': {
      e.vx = e.vy = 0;
      e.spT = (e.spT || 0) - dt;
      if (e.spT <= 0) {
        e.spT = 0.07 / spd;
        const arms = rage ? 4 : 3;
        const base = e.atkT * 2.2;
        for (let i = 0; i < arms; i++) {
          const a = base + (i / arms) * TAU;
          Game.addEBullet(new Bullet({ x: bx, y: by, vx: Math.cos(a) * 95, vy: Math.sin(a) * 95, team: 'e', color: '#ff7a3a', r: 2.8, life: 6 }));
          if (rage) {
            const a2 = -base * 0.8 + (i / arms) * TAU;
            Game.addEBullet(new Bullet({ x: bx, y: by, vx: Math.cos(a2) * 70, vy: Math.sin(a2) * 70, team: 'e', color: '#ff3a8a', r: 2.6, life: 6 }));
          }
        }
        Sfx.play('enemyShoot', 0.12);
      }
      if (e.timer <= 0) { e.state = 'idle'; e.timer = 1.0 / spd; }
      break;
    }
    case 'shotgun':
      e.aim = angleTo(bx, by, p.x, p.y);
      e.moveTo(p.x, p.y, e.speed * 0.5);
      if (e.timer <= 0) {
        const n = rage ? 9 : 7;
        for (let i = 0; i < n; i++) {
          const a = e.aim + (i - (n - 1) / 2) * 0.13;
          Game.addEBullet(new Bullet({ x: bx, y: by, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, team: 'e', color: '#ff3a4a', r: 3, life: 4 }));
        }
        FX.muzzle(bx + Math.cos(e.aim) * 14, by + Math.sin(e.aim) * 14, e.aim, '#ff6a3a', 1.6);
        FX.addShake(2.5);
        Sfx.play('shotgun');
        e.step++;
        e.timer = 0.42 / spd;
        if (e.step >= 4) { e.state = 'idle'; e.timer = 0.9 / spd; }
      }
      break;
    case 'charge':
      if (e.step === 0) {
        // 蓄力: 显示冲锋方向
        e.vx = e.vy = 0;
        e.chargeA = angleTo(e.x, e.y, p.x, p.y);
        e.facing = Math.cos(e.chargeA) < 0 ? -1 : 1;
        if (Math.random() < 0.5) FX.dust(e.x - e.facing * 10, e.y, 2);
        if (e.timer <= 0) { e.step = 1; e.timer = 1.4; }
      } else {
        const sp = 290 * spd;
        e.vx = Math.cos(e.chargeA) * sp;
        e.vy = Math.sin(e.chargeA) * sp;
        e.anim += dt * 14;
        if (Math.random() < 0.8) FX.dust(e.x - e.facing * 10, e.y, 2);
        if (dist(e.x, e.y, p.x, p.y) < e.r + 7) p.hurt(2);
        if (e.lastHit || e.timer <= 0) {
          e.vx = e.vy = 0;
          if (e.lastHit) {
            FX.addShake(7);
            Sfx.play('slam');
            FX.debris(e.x, e.y - 10, ['#8a8478', '#5a564e', '#3a3438'], 10, 100);
            FX.smoke(e.x, e.y - 8, 6, { alpha: 0.5, big: 1.5 });
            const n = rage ? 16 : 12;
            for (let i = 0; i < n; i++) {
              const a = (i / n) * TAU;
              Game.addEBullet(new Bullet({ x: bx, y: by, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, team: 'e', color: '#ffb030', r: 3, life: 5 }));
            }
          }
          e.charges--;
          if (e.charges > 0) { e.step = 0; e.timer = 0.45; Sfx.play('bossCharge'); }
          else { e.state = 'idle'; e.timer = 1.0; e.stun = 0.5; }
        }
      }
      break;
    case 'slam':
      if (e.step === 0) {
        // 起跳
        e.vx = e.vy = 0;
        if (e.timer <= 0) { e.step = 1; e.timer = 0.9; e.vz = 0; e.slamX = p.x; e.slamY = p.y; FX.dust(e.x, e.y, 6); Sfx.play('slimeHop'); }
      } else if (e.step === 1) {
        // 空中追踪
        e.z = Math.min(80, e.z + dt * 220);
        e.slamX = lerp(e.slamX, p.x, 1 - Math.exp(-4 * dt));
        e.slamY = lerp(e.slamY, p.y, 1 - Math.exp(-4 * dt));
        e.moveTo(e.slamX, e.slamY, 200);
        if (e.timer <= 0) { e.step = 2; e.timer = 0.4; e.vx = e.vy = 0; }
      } else if (e.step === 2) {
        e.vx = e.vy = 0;
        if (e.timer < 0.2) e.z = Math.max(0, e.z - dt * 600);
        if (e.z <= 0 && e.timer < 0.2) {
          e.step = 3;
          e.z = 0;
          FX.addShake(10);
          FX.flash('#ffffff', 0.2);
          FX.hitstop = 0.06;
          Sfx.play('slam');
          FX.ring(e.x, e.y, 50, '#ffd080', 0.5, 4);
          FX.ring(e.x, e.y, 34, '#ffffff', 0.3, 2);
          FX.debris(e.x, e.y - 4, ['#8a8478', '#5a564e', '#3a3438'], 14, 140);
          FX.smoke(e.x, e.y, 10, { alpha: 0.5, big: 1.6, spd: 3 });
          Game.level.scorch(e.x, e.y, 22);
          if (dist(e.x, e.y, p.x, p.y) < 30) p.hurt(2);
          const n = rage ? 30 : 24;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU;
            Game.addEBullet(new Bullet({ x: e.x, y: e.y - 4, vx: Math.cos(a) * 75, vy: Math.sin(a) * 75, team: 'e', color: '#ffb030', r: 3, life: 6 }));
            if (rage) Game.addEBullet(new Bullet({ x: e.x, y: e.y - 4, vx: Math.cos(a + 0.1) * 50, vy: Math.sin(a + 0.1) * 50, team: 'e', color: '#ff3a4a', r: 2.6, life: 6 }));
          }
          e.timer = 0.9;
        }
      } else if (e.timer <= 0) { e.state = 'idle'; e.timer = 0.6; }
      break;
    case 'summon':
      e.vx = e.vy = 0;
      if (e.timer <= 0) {
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * TAU + rand(0.5);
          Game.spawnEnemy(choice(['goblin', 'shaman', 'bat']), e.x + Math.cos(a) * 50, e.y + Math.sin(a) * 40, e.room, false, 0.8);
        }
        e.state = 'idle';
        e.timer = 1.2;
      }
      break;
  }
}

// Boss 额外绘制 (冲锋预警 / 落点)
function drawBossTelegraph(g, e) {
  if (e.state === 'charge' && e.step === 0) {
    const L = 140;
    g.save();
    g.globalAlpha = 0.25 + Math.sin(Game.time * 30) * 0.15;
    g.strokeStyle = '#ff3040';
    g.lineWidth = e.r * 2;
    g.beginPath();
    g.moveTo(e.x, e.y - 4);
    g.lineTo(e.x + Math.cos(e.chargeA) * L, e.y - 4 + Math.sin(e.chargeA) * L);
    g.stroke();
    g.restore();
  }
  if (e.state === 'slam' && (e.step === 1 || e.step === 2)) {
    g.save();
    const k = e.step === 2 ? 1 : 1 - e.timer / 0.9;
    g.globalAlpha = 0.5;
    g.strokeStyle = '#ff3040';
    g.lineWidth = 1;
    g.beginPath(); g.ellipse(e.x, e.y, 30, 20, 0, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(255,40,60,0.25)';
    g.beginPath(); g.ellipse(e.x, e.y, 30 * k, 20 * k, 0, 0, TAU); g.fill();
    g.restore();
  }
}

// ================= 拾取物 =================
class Pickup {
  constructor(kind, x, y, value = 1) {
    this.kind = kind; this.x = x; this.y = y; this.value = value;
    this.z = 4; this.vz = rand(50, 80);
    const a = rand(TAU), s = rand(12, 38);
    this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s;
    this.r = 3; this.boxTop = 2; this.boxBot = 1;
    this.t = rand(10);
    this.dead = false;
    this.landed = false;
    this.magnet = false;
    this.age = 0;
  }
  update(dt) {
    this.t += dt;
    this.age += dt;
    const p = Game.player;
    if (!this.landed) {
      this.vz -= 300 * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        this.z = 0;
        if (this.vz < -40) this.vz = -this.vz * 0.4;
        else { this.vz = 0; this.landed = true; }
      }
      moveBody(this, this.vx * dt, this.vy * dt);
      this.vx *= Math.exp(-3 * dt); this.vy *= Math.exp(-3 * dt);
    }
    if (!p || p.dead) return;
    const d = dist(this.x, this.y, p.x, p.y - 4);
    const auto = this.kind === 'coin' || this.kind === 'energy';
    if (auto && this.age > 0.35 && (d < 46 || this.magnet)) {
      this.magnet = true;
      this.magT = (this.magT || 0) + dt;
      const step = Math.min(300, 70 + this.magT * 450) * dt;
      if (step >= d) { this.collect(p); return; }
      this.x += ((p.x - this.x) / d) * step;
      this.y += ((p.y - 4 - this.y) / d) * step;
      this.z = Math.max(0, this.z - dt * 60);
      this.landed = true;
    }
    if (d < (auto ? 6 : 8) && this.age > 0.3) this.collect(p);
  }
  collect(p) {
    if (this.kind === 'coin') {
      p.coins += this.value;
      Sfx.play('coin', 0.04);
      FX.stars(this.x, this.y - 4, '#ffd23a', 2, 3);
    } else if (this.kind === 'energy') {
      p.energy = Math.min(p.maxEnergy, p.energy + this.value * 4);
      Sfx.play('energy', 0.04);
    } else if (this.kind === 'potion') {
      if (p.hp >= p.maxHp) return;
      const h = p.heal(2);
      FX.text(p.x, p.y - 22, '+' + h + ' 生命', '#ff5a6a', 7);
      FX.stars(p.x, p.y - 8, '#ff7a8a', 8, 10);
      Sfx.play('potion');
    } else if (this.kind === 'potionB') {
      p.energy = Math.min(p.maxEnergy, p.energy + 80);
      FX.text(p.x, p.y - 22, '+80 能量', '#6ac8ff', 7);
      FX.stars(p.x, p.y - 8, '#6ac8ff', 8, 10);
      Sfx.play('potion');
    }
    this.dead = true;
  }
  draw(g) {
    const z = this.z + (this.landed && !this.magnet ? Math.sin(this.t * 4) * 1 + 1 : 0);
    if (this.kind === 'coin') {
      drawShadow(g, this.x, this.y, 2.5, 1, 0.3);
      const w = Math.abs(Math.cos(this.t * 5)) * 2.5 + 0.5;
      const y = this.y - 3 - z;
      g.fillStyle = OUTLINE;
      g.fillRect(this.x - w - 1, y - 3.5, w * 2 + 2, 7);
      g.fillStyle = '#c98d26';
      g.fillRect(this.x - w, y - 2.5, w * 2, 5);
      g.fillStyle = '#ffd257';
      g.fillRect(this.x - w, y - 2.5, Math.max(0.6, w * 1.4), 4);
      g.fillStyle = '#fff6c0';
      g.fillRect(this.x - w + 0.3, y - 2, Math.max(0.5, w * 0.5), 1.5);
    } else if (this.kind === 'energy') {
      drawShadow(g, this.x, this.y, 2.5, 1, 0.3);
      const y = this.y - 4 - z;
      const s = 3;
      g.fillStyle = OUTLINE;
      g.beginPath(); g.moveTo(this.x, y - s - 1.2); g.lineTo(this.x + s, y); g.lineTo(this.x, y + s + 1.2); g.lineTo(this.x - s, y); g.closePath(); g.fill();
      g.fillStyle = '#3a7aff';
      g.beginPath(); g.moveTo(this.x, y - s); g.lineTo(this.x + s - 1, y); g.lineTo(this.x, y + s); g.lineTo(this.x - s + 1, y); g.closePath(); g.fill();
      g.fillStyle = '#9fd8ff';
      g.fillRect(this.x - 1, y - 2, 1, 2);
    } else {
      drawShadow(g, this.x, this.y, 4, 1.5);
      drawSpr(g, this.kind === 'potion' ? SPR.potion : SPR.potionB, this.x, this.y - z + 1);
    }
  }
  drawGlow(g) {
    const z = this.z;
    const c = this.kind === 'coin' ? '#ffd23a' : this.kind === 'energy' ? '#3a8aff' : this.kind === 'potion' ? '#ff4a5a' : '#4aa8ff';
    const s = this.kind === 'coin' ? 5 : 7;
    g.globalAlpha = 0.5;
    g.drawImage(glowTex(c), this.x - s, this.y - 4 - z - s, s * 2, s * 2);
    g.globalAlpha = 1;
  }
}

// ================= 地上的武器 =================
class WeaponDrop {
  constructor(id, x, y) {
    this.id = id; this.x = x; this.y = y; this.z = 6; this.vz = 50; this.t = rand(10);
    this.isDrop = true;
  }
  get def() { return WEAPONS[this.id]; }
  update(dt) {
    this.t += dt;
    if (this.z > 0 || this.vz > 0) {
      this.vz -= 300 * dt;
      this.z = Math.max(0, this.z + this.vz * dt);
      if (this.z === 0) this.vz = 0;
    }
  }
  draw(g) {
    const bob = Math.sin(this.t * 3) * 1.2 + 3;
    drawShadow(g, this.x, this.y, 7, 2);
    const spr = SPR.w[this.def.spr];
    const rot = this.def.type === 'bow' ? 0 : -0.25;
    drawSpr(g, spr, this.x, this.y - this.z - bob - 3, { ax: spr.w / 2, ay: spr.h / 2, rot });
  }
  drawGlow(g) {
    const col = RARITY[this.def.rarity].color;
    const s = 14 + Math.sin(this.t * 4) * 2;
    g.globalAlpha = 0.35;
    g.drawImage(glowTex(col), this.x - s, this.y - 6 - s, s * 2, s * 2);
    g.globalAlpha = 1;
    if (Math.random() < 0.05) FX.p({ x: this.x + rand(-8, 8), y: this.y - rand(2, 10), vy: -10, kind: 'star', color: col, glow: true, life: 0.6, size: 1.5 });
  }
  prompt() {
    const d = this.def;
    return { title: d.name, color: RARITY[d.rarity].color, sub: `${RARITY[d.rarity].name} · 伤害 ${d.dmg}${d.pellets ? 'x' + d.pellets : ''} · 能耗 ${d.energy || (d.eps ? d.eps + '/s' : 0)}`, action: '拾取' };
  }
  interact(p) { p.pickWeapon(this); }
}

// ================= 宝箱 =================
class Chest {
  constructor(kind, x, y) {
    this.kind = kind; this.x = x; this.y = y;
    this.opened = false; this.t = 0; this.openT = 0;
    this.appear = 0.4;
  }
  get spr() {
    const k = { small: 'chest', weapon: 'wchest', gold: 'gchest' }[this.kind];
    return SPR[k + (this.opened ? 'Open' : '')];
  }
  update(dt) {
    this.t += dt;
    if (this.appear > 0) this.appear -= dt;
    if (this.opened) this.openT += dt;
  }
  draw(g) {
    const s = this.appear > 0 ? easeOutBack(1 - this.appear / 0.4) : 1;
    const shake = !this.opened && Math.sin(this.t * 2) > 0.95 ? Math.sin(this.t * 60) * 0.6 : 0;
    drawShadow(g, this.x, this.y, this.spr.w / 2 - 1, 2.5);
    drawSpr(g, this.spr, this.x + shake, this.y + 1, { sx: s, sy: s });
  }
  drawGlow(g) {
    if (this.opened && this.openT < 1.2) {
      const k = 1 - this.openT / 1.2;
      g.globalAlpha = k;
      const col = this.kind === 'small' ? '#fff0a0' : this.kind === 'weapon' ? '#a0d8ff' : '#ffe080';
      g.fillStyle = col;
      g.fillRect(this.x - 5, this.y - 60, 10, 52);
      g.drawImage(glowTex(col), this.x - 24, this.y - 32, 48, 48);
      g.globalAlpha = 1;
    } else if (!this.opened) {
      g.globalAlpha = 0.25 + Math.sin(this.t * 3) * 0.1;
      g.drawImage(glowTex(this.kind === 'weapon' ? '#4aa8ff' : '#ffd23a'), this.x - 14, this.y - 18, 28, 28);
      g.globalAlpha = 1;
    }
  }
  prompt() {
    return this.opened ? null : { title: { small: '奖励宝箱', weapon: '武器宝箱', gold: '酋长的宝藏' }[this.kind], color: '#ffd23a', action: '打开' };
  }
  interact() {
    if (this.opened) return;
    this.opened = true;
    Sfx.play('chest');
    FX.stars(this.x, this.y - 10, '#fff0a0', 12, 10);
    FX.addShake(2);
    if (this.kind === 'small') {
      Game.dropLoot(this.x, this.y - 6, 'coin', randi(4, 8));
      Game.dropLoot(this.x, this.y - 6, 'energy', randi(4, 8));
      if (chance(0.35)) Game.dropLoot(this.x, this.y - 6, chance(0.6) ? 'potion' : 'potionB', 1);
      if (chance(0.2)) Game.dropWeapon(this.x, this.y + 6);
    } else if (this.kind === 'weapon') {
      Game.dropWeapon(this.x, this.y + 6);
    } else {
      Game.dropWeapon(this.x - 12, this.y + 8, 3);
      Game.dropWeapon(this.x + 12, this.y + 8, 3);
      Game.dropLoot(this.x, this.y - 6, 'coin', 20);
    }
  }
}

// ================= 传送门 =================
class Portal {
  constructor(x, y) { this.x = x; this.y = y; this.t = 0; this.appear = 0.8; }
  update(dt) {
    this.t += dt;
    if (this.appear > 0) this.appear -= dt;
    FX.light(this.x, this.y - 6, 70, '#7a5aff', 1);
    if (Math.random() < dt * 30) {
      const a = rand(TAU), r = rand(10, 18);
      FX.p({ x: this.x + Math.cos(a) * r, y: this.y - 8 + Math.sin(a) * r * 0.8, vx: -Math.cos(a) * 20 + Math.sin(a) * 20, vy: -Math.sin(a) * 20 - Math.cos(a) * 20, color: choice(['#b49aff', '#7aeaff', '#ffffff']), glow: true, life: 0.6, size: 1.3, size2: 0 });
    }
  }
  draw(g) {
    const s = this.appear > 0 ? easeOutBack(1 - this.appear / 0.8) : 1;
    // 底座
    g.fillStyle = '#2a2240';
    g.beginPath(); g.ellipse(this.x, this.y, 15 * s, 6 * s, 0, 0, TAU); g.fill();
    g.fillStyle = '#4a3a6a';
    g.beginPath(); g.ellipse(this.x, this.y - 1, 13 * s, 5 * s, 0, 0, TAU); g.fill();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + this.t * 0.5;
      g.fillStyle = '#8a7aff';
      g.fillRect(this.x + Math.cos(a) * 11 * s - 0.5, this.y - 1 + Math.sin(a) * 4 * s - 0.5, 1.5, 1.5);
    }
  }
  drawGlow(g) {
    const s = this.appear > 0 ? easeOutBack(1 - this.appear / 0.8) : 1;
    const cx = this.x, cy = this.y - 12;
    g.save();
    g.translate(cx, cy);
    g.scale(s, s);
    g.drawImage(glowTex('#6a4aff'), -28, -28, 56, 56);
    for (let i = 0; i < 4; i++) {
      g.rotate(this.t * (1.5 + i * 0.4));
      g.strokeStyle = ['#6a4aff', '#9a7aff', '#7aeaff', '#ffffff'][i];
      g.lineWidth = 2.2 - i * 0.4;
      g.globalAlpha = 0.8;
      g.beginPath();
      g.ellipse(0, 0, 12 - i * 2.5, 15 - i * 3, 0, 0, Math.PI * 1.3);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(0, 0, 2.5, 3.5, 0, 0, TAU); g.fill();
    g.restore();
  }
  prompt() { return { title: '传送门', color: '#b49aff', action: Game.levelNum >= 3 ? '凯旋' : '前往下一层' }; }
  interact() { Game.nextLevel(); }
}
