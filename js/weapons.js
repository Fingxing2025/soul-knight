'use strict';
// ============ 武器 & 子弹 ============
const RARITY = [
  { name: '普通', color: '#e8e8e8' },
  { name: '优秀', color: '#6ad84a' },
  { name: '稀有', color: '#4aa8ff' },
  { name: '史诗', color: '#c86aff' },
  { name: '传说', color: '#ffa030' },
];

const WEAPONS = {
  pistol: { name: '破旧的手枪', rarity: 0, spr: 'pistol', type: 'gun', energy: 0, dmg: 3, rate: 4.5, spread: 0.05, speed: 300, bullet: 'bolt', color: '#ffd84a', grip: [2, 4], muzzle: [10, 1.5], recoil: 2, shake: 0.6, sfx: 'pistol', shell: true },
  wand: { name: '新手法杖', rarity: 0, spr: 'wand', type: 'gun', energy: 0, dmg: 4, rate: 4, spread: 0.04, speed: 210, bullet: 'magic', color: '#c86aff', grip: [3, 1], muzzle: [14, 1], recoil: 1, shake: 0.4, sfx: 'staffOrb', bounce: 2, flash: 0.9 },
  smg: { name: '冲锋枪', rarity: 1, spr: 'smg', type: 'gun', energy: 1, dmg: 2, rate: 11, spread: 0.13, speed: 340, bullet: 'bolt', color: '#ffc040', grip: [5, 4], muzzle: [13, 1.5], recoil: 1.5, shake: 0.5, sfx: 'smg', shell: true },
  shotgun: { name: '霰弹枪', rarity: 1, spr: 'shotgun', type: 'gun', energy: 3, dmg: 3, pellets: 6, rate: 1.7, spread: 0.36, speed: 300, speedVar: 0.25, life: 0.42, bullet: 'pellet', color: '#ffb040', grip: [6, 3], muzzle: [19, 1], recoil: 5, shake: 3, knock: 90, sfx: 'shotgun', shell: true, shellColor: '#d23a3a', flash: 1.6, delayShell: 0.25 },
  gatling: { name: '加特林', rarity: 3, spr: 'gatling', type: 'gun', energy: 1, dmg: 2, rate: 19, spread: 0.17, speed: 380, bullet: 'bolt', color: '#ffe060', grip: [4, 5], muzzle: [20, 2.5], recoil: 1.2, shake: 0.7, sfx: 'smg', shell: true, spin: 0.7 },
  frost: { name: '寒冰法杖', rarity: 2, spr: 'frost', type: 'gun', energy: 2, dmg: 5, rate: 3.2, spread: 0.02, speed: 230, bullet: 'ice', color: '#9fe8ff', grip: [4, 2.5], muzzle: [20, 2.5], recoil: 1, shake: 0.6, sfx: 'staffOrb', slow: 1.8, flash: 1.2 },
  laser: { name: '激光枪', rarity: 3, spr: 'laser', type: 'beam', energy: 0, eps: 8, dmg: 2, tick: 0.075, range: 240, color: '#3fd8ff', grip: [5, 4], muzzle: [18, 2], recoil: 0.6, shake: 0.25 },
  rocket: { name: '火箭筒', rarity: 4, spr: 'rocket', type: 'gun', energy: 5, dmg: 6, splash: 9, radius: 36, rate: 1.25, spread: 0.02, speed: 120, accel: 520, maxSpeed: 380, life: 2, bullet: 'rocket', color: '#ff8a30', grip: [7, 5], muzzle: [21, 2.5], recoil: 6, shake: 2.5, sfx: 'rocket', flash: 1.4 },
  staff: { name: '雷电法杖', rarity: 3, spr: 'staff', type: 'lightning', energy: 3, dmg: 6, chains: 4, range: 150, chainRange: 75, rate: 2.6, color: '#c8a0ff', grip: [5, 2.5], muzzle: [19, 2.5], recoil: 1.5, shake: 1.5 },
  sword: { name: '骑士大剑', rarity: 2, spr: 'sword', type: 'melee', energy: 0, dmg: 7, rate: 2.8, range: 26, arc: 2.3, color: '#cfe8ff', grip: [2, 2.5], recoil: 0, shake: 1.2, knock: 140 },
  bow: { name: '猎弓', rarity: 2, spr: 'bow', type: 'bow', energy: 0, dmg: 4, maxDmg: 15, charge: 0.75, speed: 260, maxSpeed: 500, bullet: 'arrow', color: '#ffe9a0', grip: [1, 8], muzzle: [6, 8], recoil: 2, shake: 1 },
};
const WEAPON_POOL = [['smg', 10], ['shotgun', 10], ['frost', 8], ['sword', 8], ['bow', 8], ['gatling', 5], ['laser', 5], ['staff', 5], ['rocket', 3]];

class Weapon {
  constructor(id) {
    this.id = id;
    this.def = WEAPONS[id];
    this.cd = 0;
    this.recoil = 0;
    this.charge = 0;
    this.swing = 0; // 挥砍动画计时
    this.swingDir = 1;
    this.spin = 0;
    this.spinAng = 0;
    this.beam = null;
    this.beamTick = 0;
    this.energyAcc = 0;
    this.drawSnd = false;
  }
  get spr() { return SPR.w[this.def.spr]; }

  // 枪口世界坐标
  muzzlePos(hx, hy, aim) {
    const d = this.def;
    const flip = Math.cos(aim) < 0 ? -1 : 1;
    const lx = d.muzzle[0] - d.grip[0] - this.recoil;
    const ly = (d.muzzle[1] - d.grip[1]) * flip;
    const c = Math.cos(aim), s = Math.sin(aim);
    return { x: hx + lx * c - ly * s, y: hy + lx * s + ly * c };
  }

  update(dt, owner, trigger, hx, hy, aim) {
    const d = this.def;
    this.cd -= dt;
    this.recoil = approach(this.recoil, 0, dt * 30);
    if (this.swing > 0) this.swing -= dt;

    if (d.type === 'gun') {
      if (d.spin) {
        this.spin = approach(this.spin, trigger ? 1 : 0, dt / (trigger ? d.spin : 0.5));
        this.spinAng += this.spin * dt * 40;
        if (trigger && this.spin < 0.35 && Math.random() < 0.3) Sfx.play('wallHit', 0.05);
        if (trigger && this.spin >= 0.35 && this.cd <= 0) {
          this.fireGun(owner, hx, hy, aim);
          this.cd = 1 / (d.rate * this.spin);
        }
      } else if (trigger && this.cd <= 0) {
        if (this.fireGun(owner, hx, hy, aim)) this.cd = 1 / d.rate;
        else this.cd = 0.3;
      }
    } else if (d.type === 'beam') {
      this.updateBeam(dt, owner, trigger, hx, hy, aim);
    } else if (d.type === 'melee') {
      if (trigger && this.cd <= 0) {
        this.doSwing(owner, hx, hy, aim);
        this.cd = 1 / d.rate;
      }
    } else if (d.type === 'lightning') {
      if (trigger && this.cd <= 0) {
        if (this.castLightning(owner, hx, hy, aim)) this.cd = 1 / d.rate;
        else this.cd = 0.3;
      }
    } else if (d.type === 'bow') {
      if (trigger && this.cd <= 0) {
        if (this.charge === 0) Sfx.play('bowDraw');
        this.charge = Math.min(d.charge, this.charge + dt);
        if (this.charge >= d.charge && !this.drawSnd) {
          this.drawSnd = true;
          const m = this.muzzlePos(hx, hy, aim);
          FX.stars(m.x, m.y, '#ffe9a0', 4, 4);
          Sfx.play('uiMove');
        }
      } else if (!trigger && this.charge > 0) {
        this.releaseArrow(owner, hx, hy, aim);
        this.charge = 0;
        this.drawSnd = false;
        this.cd = 0.18;
      }
    }
  }

  // 技能期间: 只推进冷却/后坐力, 保留蓄力、预热等状态
  hold(dt) {
    this.cd -= dt;
    this.recoil = approach(this.recoil, 0, dt * 30);
    if (this.swing > 0) this.swing -= dt;
    this.pause();
  }
  // 暂停持续光束 (光束依赖实时坐标, 恢复射击时会立刻重新出现)
  pause() {
    if (this.beam) { this.beam = null; Sfx.laserOff(); }
  }

  stop() {
    this.pause();
    this.charge = 0;
    this.drawSnd = false;
    this.spin = 0;
  }

  fireGun(owner, hx, hy, aim) {
    const d = this.def;
    if (!owner.useEnergy(d.energy)) return false;
    const m = this.muzzlePos(hx, hy, aim);
    // 枪口在墙内则从手部发射
    const sx = Game.level.solidNoProp(Math.floor(m.x / TILE), Math.floor(m.y / TILE)) ? hx : m.x;
    const sy = sx === hx ? hy : m.y;
    const n = d.pellets || 1;
    for (let i = 0; i < n; i++) {
      const a = n > 1 ? aim + lerp(-d.spread / 2, d.spread / 2, i / (n - 1)) + rand(-0.05, 0.05) : aim + rand(-d.spread, d.spread) * 0.5;
      const sp = d.speed * (1 + (d.speedVar ? rand(-d.speedVar, d.speedVar) : 0));
      Game.addBullet(new Bullet({
        x: sx, y: sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, team: 'p', style: d.bullet, color: d.color,
        dmg: d.dmg, knock: d.knock || 40, splash: d.splash, radius: d.radius,
        accel: d.accel, maxSpeed: d.maxSpeed, slow: d.slow, bounce: d.bounce || 0, life: d.life || (d.bounce ? 2 : 1.4), r: d.bullet === 'pellet' ? 2 : d.bullet === 'rocket' ? 3 : 2.5,
      }));
    }
    this.recoil = d.recoil;
    FX.muzzle(m.x, m.y, aim, d.color, d.flash || 1);
    FX.addShake(d.shake);
    FX.kick(aim, d.recoil * 0.6);
    if (d.shell) {
      if (d.delayShell) setTimeout(() => FX.shell(hx, hy, aim, d.shellColor), d.delayShell * 1000);
      else FX.shell(hx, hy, aim, d.shellColor);
    }
    if (d.bullet === 'rocket') FX.smoke(hx - Math.cos(aim) * 8, hy - Math.sin(aim) * 8, 4, { alpha: 0.5 });
    if (d.knock && owner.push) owner.push(-Math.cos(aim) * 60, -Math.sin(aim) * 60);
    Sfx.play(d.sfx || 'pistol', 0.02);
    return true;
  }

  updateBeam(dt, owner, trigger, hx, hy, aim) {
    const d = this.def;
    if (trigger) {
      // 按秒消耗能量
      this.energyAcc += d.eps * dt;
      while (this.energyAcc >= 1) {
        this.energyAcc -= 1;
        if (!owner.useEnergy(1)) { trigger = false; break; }
      }
    }
    if (!trigger) {
      if (this.beam) { this.beam = null; Sfx.laserOff(); }
      return;
    }
    if (!this.beam) { this.beam = { t: 0 }; Sfx.play('laserStart'); Sfx.laserOn(); }
    const m = this.muzzlePos(hx, hy, aim);
    const c = Math.cos(aim), s = Math.sin(aim);
    let ex = m.x, ey = m.y, len = 0;
    const L = Game.level;
    let hitWall = false;
    while (len < d.range) {
      const nx = ex + c * 2, ny = ey + s * 2;
      const tx = Math.floor(nx / TILE), ty = Math.floor(ny / TILE);
      if (L.solidNoProp(tx, ty)) { hitWall = true; break; }
      const p = L.props[L.idx(tx, ty)];
      if (p) { hitWall = true; if (this.beamTick <= 0) p.hit(d.dmg, L); break; }
      ex = nx; ey = ny; len += 2;
    }
    this.beam.t += dt;
    Object.assign(this.beam, { x0: m.x, y0: m.y, x1: ex, y1: ey, hitWall });
    this.recoil = d.recoil * (0.6 + Math.random() * 0.4);
    FX.addShake(d.shake * dt * 20);
    FX.light((m.x + ex) / 2, (m.y + ey) / 2, len / 2 + 30, d.color, 0.6);
    FX.light(ex, ey, 30, d.color, 1);
    if (Math.random() < 0.7) FX.sparks(ex, ey, aim + Math.PI, d.color, 1, 120, 1.2);
    if (Math.random() < 0.2) FX.sparks(ex, ey, aim + Math.PI, '#ffffff', 1, 80, 1.2);
    this.beamTick -= dt;
    if (this.beamTick <= 0) {
      this.beamTick = d.tick;
      for (const e of Game.enemies) {
        if (e.dead || e.spawning) continue;
        const hx2 = e.x, hy2 = e.y - e.hitY;
        // 点到线段距离
        const t = clamp(((hx2 - m.x) * c + (hy2 - m.y) * s), 0, len);
        const px = m.x + c * t, py = m.y + s * t;
        if (dist2(px, py, hx2, hy2) < (e.hitR + 3) ** 2) {
          e.hurt(rollDmg(d.dmg), c * 25, s * 25);
          FX.sparks(px, py, aim + Math.PI + rand(-0.5, 0.5), d.color, 2, 100);
        }
      }
    }
  }

  doSwing(owner, hx, hy, aim) {
    const d = this.def;
    this.swingDir = -this.swingDir;
    this.swing = 0.22;
    this.swingAim = aim;
    const cx = hx + Math.cos(aim) * 4, cy = hy + Math.sin(aim) * 4;
    FX.slash(cx, cy, aim, this.swingDir, d.range, '#5ab4ff', 8);
    Sfx.play('sword');
    FX.addShake(d.shake);
    FX.kick(aim, -2);
    owner.push && owner.push(Math.cos(aim) * 50, Math.sin(aim) * 50);
    let hitAny = false;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning) continue;
      const ex = e.x, ey = e.y - e.hitY;
      const dd = dist(cx, cy, ex, ey);
      if (dd > d.range + e.hitR + 2) continue;
      if (dd > 8 && Math.abs(angDiff(aim, angleTo(cx, cy, ex, ey))) > d.arc / 2) continue;
      const a = angleTo(hx, hy, ex, ey);
      e.hurt(rollDmg(d.dmg), Math.cos(a) * d.knock, Math.sin(a) * d.knock);
      FX.sparks(ex, ey, a, '#ffffff', 5, 140);
      hitAny = true;
    }
    if (hitAny) { FX.hitstop = Math.max(FX.hitstop, 0.05); Sfx.play('hit'); }
    // 斩断子弹
    for (const b of Game.ebullets) {
      if (b.dead) continue;
      const dd = dist(cx, cy, b.x, b.y);
      if (dd < d.range + 5 && (dd < 8 || Math.abs(angDiff(aim, angleTo(cx, cy, b.x, b.y))) < d.arc / 2)) {
        b.dead = true;
        FX.sparks(b.x, b.y, rand(TAU), b.color, 4, 100, Math.PI);
        FX.p({ x: b.x, y: b.y, kind: 'orb', color: b.color, glow: true, life: 0.15, size: 6, size2: 1 });
        Sfx.play('deflect');
      }
    }
    // 打道具
    const L = Game.level;
    for (let i = -1; i <= 1; i++) {
      const a = aim + i * 0.6;
      const p = L.propAtPx(cx + Math.cos(a) * d.range * 0.8, cy + Math.sin(a) * d.range * 0.8);
      if (p) p.hit(d.dmg, L);
    }
  }

  castLightning(owner, hx, hy, aim) {
    const d = this.def;
    if (!owner.useEnergy(d.energy)) return false;
    const m = this.muzzlePos(hx, hy, aim);
    const L = Game.level;
    // 选目标: 瞄准方向锥形内最近
    let best = null, bestScore = Infinity;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning) continue;
      const ex = e.x, ey = e.y - e.hitY;
      const dd = dist(m.x, m.y, ex, ey);
      if (dd > d.range) continue;
      const ad = Math.abs(angDiff(aim, angleTo(m.x, m.y, ex, ey)));
      if (ad > 0.55) continue;
      if (!L.los(m.x, m.y, ex, ey)) continue;
      const score = dd * (1 + ad * 2);
      if (score < bestScore) { bestScore = score; best = e; }
    }
    const pts = [[m.x, m.y]];
    if (best) {
      const hit = new Set();
      let cur = best;
      for (let i = 0; i < d.chains && cur; i++) {
        hit.add(cur);
        const cx = cur.x, cy = cur.y - cur.hitY;
        pts.push([cx, cy]);
        const a = angleTo(pts[pts.length - 2][0], pts[pts.length - 2][1], cx, cy);
        cur.hurt(rollDmg(d.dmg), Math.cos(a) * 30, Math.sin(a) * 30);
        cur.stun = Math.max(cur.stun || 0, 0.25);
        FX.sparks(cx, cy, rand(TAU), '#e8d0ff', 6, 120, Math.PI);
        let nxt = null, nd = d.chainRange;
        for (const e of Game.enemies) {
          if (e.dead || e.spawning || hit.has(e)) continue;
          const dd = dist(cx, cy, e.x, e.y - e.hitY);
          if (dd < nd && L.los(cx, cy, e.x, e.y - e.hitY)) { nd = dd; nxt = e; }
        }
        cur = nxt;
      }
    } else {
      // 没有目标: 劈向前方
      let ex = m.x, ey = m.y;
      for (let l = 0; l < 90; l += 3) {
        const nx = ex + Math.cos(aim) * 3, ny = ey + Math.sin(aim) * 3;
        if (L.solid(Math.floor(nx / TILE), Math.floor(ny / TILE))) {
          const p = L.propAtPx(nx, ny);
          if (p) p.hit(d.dmg, L);
          break;
        }
        ex = nx; ey = ny;
      }
      pts.push([ex, ey]);
      FX.sparks(ex, ey, rand(TAU), '#e8d0ff', 5, 90, Math.PI);
    }
    FX.lightning(pts, d.color, 1.6);
    FX.muzzle(m.x, m.y, aim, d.color, 1.2);
    FX.addShake(d.shake);
    this.recoil = d.recoil;
    Sfx.play('lightning');
    return true;
  }

  releaseArrow(owner, hx, hy, aim) {
    const d = this.def;
    if (!owner.useEnergy(d.energy)) return;
    const k = clamp(this.charge / d.charge, 0.15, 1);
    const full = this.charge >= d.charge;
    const m = this.muzzlePos(hx, hy, aim);
    const sp = lerp(d.speed, d.maxSpeed, k);
    Game.addBullet(new Bullet({
      x: m.x, y: m.y, vx: Math.cos(aim) * sp, vy: Math.sin(aim) * sp, team: 'p', style: 'arrow',
      color: full ? '#ffe060' : d.color, dmg: Math.round(lerp(d.dmg, d.maxDmg, k * k)), life: 1.2, knock: 60 + 80 * k,
      pierce: full ? 3 : 0, r: 2.5, charged: full,
    }));
    this.recoil = d.recoil * k;
    FX.addShake(d.shake * k);
    if (full) { FX.sparks(m.x, m.y, aim, '#ffe060', 6, 160, 0.4); FX.light(m.x, m.y, 40, '#ffe060', 1); }
    Sfx.play('bow');
  }

  // ---- 绘制 ----
  draw(g, hx, hy, aim, flash) {
    const d = this.def;
    const flip = Math.cos(aim) < 0 ? -1 : 1;
    let rot = aim;
    if (d.type === 'melee') {
      // 未挥砍时剑向上斜举; 挥砍时扫过弧线
      if (this.swing > 0) {
        const t = 1 - this.swing / 0.22;
        const e = easeOut(clamp(t * 1.6, 0, 1));
        rot = aim + lerp(-1.3, 1.3, e) * this.swingDir;
      } else {
        rot = aim - 0.9 * flip;
      }
    }
    const back = this.recoil;
    const x = hx - Math.cos(aim) * back, y = hy - Math.sin(aim) * back;
    const spr = this.spr;
    drawSpr(g, spr, x, y, { ax: d.grip[0] + 1, ay: d.grip[1] + 1, rot, sy: flip, flash });

    if (d.spin && this.spin > 0) {
      // 转管条纹
      g.save();
      g.translate(x, y); g.rotate(rot); g.scale(1, flip);
      g.fillStyle = 'rgba(20,20,30,0.7)';
      for (let i = 0; i < 3; i++) {
        const o = ((this.spinAng + i * 1.2) % 3.6) / 3.6;
        g.fillRect(-d.grip[0] + 6, -d.grip[1] + 1 + o * 5, 13, 0.8);
      }
      g.restore();
    }

    if (d.type === 'bow') {
      // 弓弦 + 箭
      const k = this.charge / d.charge;
      const pull = k * 5;
      g.save();
      g.translate(x, y); g.rotate(aim); g.scale(1, flip);
      const ox = -d.grip[0], oy = -d.grip[1];
      g.strokeStyle = '#f0e8d8';
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(ox + 0.5, oy + 0.5);
      g.lineTo(ox + 1 - pull, 0);
      g.lineTo(ox + 0.5, oy + 16.5);
      g.stroke();
      if (this.charge > 0 || this.cd <= 0) {
        const ax0 = ox + 1 - pull;
        g.fillStyle = '#8a5e36';
        g.fillRect(ax0, -0.5, 13, 1);
        g.fillStyle = '#dfe6f0';
        g.fillRect(ax0 + 12, -1, 2, 2);
        g.fillRect(ax0 + 14, -0.5, 1, 1);
        g.fillStyle = '#ff5a4a';
        g.fillRect(ax0, -1.5, 2, 1);
        g.fillRect(ax0, 0.5, 2, 1);
      }
      g.restore();
    }
  }

  drawGlow(g, hx, hy, aim) {
    const d = this.def;
    if (this.beam && this.beam.x1 !== undefined) {
      const b = this.beam;
      const t = performance.now() / 1000;
      const wob = 1 + Math.sin(t * 50) * 0.15;
      g.lineCap = 'round';
      const layers = [[9 * wob, d.color, 0.18], [5 * wob, d.color, 0.55], [2.6 * wob, '#bff4ff', 0.9], [1.2, '#ffffff', 1]];
      for (const [w, c, a] of layers) {
        g.globalAlpha = a;
        g.strokeStyle = c;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(b.x0, b.y0);
        g.lineTo(b.x1, b.y1);
        g.stroke();
      }
      // 端点光球
      const s = 10 + Math.sin(t * 40) * 2;
      g.globalAlpha = 1;
      g.drawImage(glowTex(d.color), b.x1 - s, b.y1 - s, s * 2, s * 2);
      g.drawImage(glowTex('#ffffff'), b.x0 - 5, b.y0 - 5, 10, 10);
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(b.x1, b.y1, 2.5, 0, TAU); g.fill();
    }
    if (d.type === 'lightning' || d.id === 'frost' || d.spr === 'frost') {
      const m = this.muzzlePos(hx, hy, aim);
      const s = 6 + Math.sin(performance.now() / 120) * 1.5;
      g.globalAlpha = 0.8;
      g.drawImage(glowTex(d.color), m.x - s, m.y - s, s * 2, s * 2);
      g.globalAlpha = 1;
    }
    if (d.type === 'bow' && this.charge > 0) {
      const k = this.charge / d.charge;
      const m = this.muzzlePos(hx, hy, aim);
      const s = 3 + k * 6;
      g.globalAlpha = k;
      g.drawImage(glowTex(k >= 1 ? '#ffe060' : '#ffe9a0'), m.x - s + Math.cos(aim) * 6, m.y - s + Math.sin(aim) * 6, s * 2, s * 2);
      g.globalAlpha = 1;
    }
  }
}

// 玩家造成的伤害: 职业伤害加成 + 暴击
function rollDmg(base, scaled = true) {
  const p = Game.player;
  const mul = scaled && p ? p.C.dmgMul || 1 : 1;
  const n = Math.max(1, Math.round(base * mul));
  const crit = Math.random() < 0.12 || (p && p.critT > 0);
  return { n: crit ? n * 2 : n, crit };
}

// ============ 子弹 ============
class Bullet {
  constructor(o) {
    Object.assign(this, {
      x: 0, y: 0, vx: 0, vy: 0, team: 'p', style: 'bolt', color: '#ffd84a', dmg: 1, life: 1.5, r: 2.5,
      pierce: 0, bounce: 0, knock: 40, splash: 0, radius: 0, accel: 0, maxSpeed: 0, slow: 0, t: 0,
      dead: false, homing: 0, curve: 0,
    }, o);
    this.trail = [];
    this.hitSet = null;
  }
  update(dt) {
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) { this.die(false); return; }
    if (this.accel) {
      const sp = Math.hypot(this.vx, this.vy);
      const ns = Math.min(this.maxSpeed, sp + this.accel * dt);
      this.vx *= ns / sp; this.vy *= ns / sp;
      if (Math.random() < 0.8) {
        const a = Math.atan2(this.vy, this.vx);
        FX.p({ x: this.x - Math.cos(a) * 5, y: this.y - Math.sin(a) * 5, vx: rand(-8, 8), vy: rand(-8, 8), kind: 'smoke', color: '#bcb6c8', alpha: 0.55, life: rand(0.4, 0.7), size: 1, size2: rand(3, 5), drag: 2 });
        FX.p({ x: this.x - Math.cos(a) * 4, y: this.y - Math.sin(a) * 4, vx: -Math.cos(a) * 40 + rand(-10, 10), vy: -Math.sin(a) * 40 + rand(-10, 10), color: choice(['#ffb040', '#ffe080']), glow: true, life: 0.15, size: 1.5, size2: 0 });
      }
    }
    if (this.curve) {
      const a = Math.atan2(this.vy, this.vx) + this.curve * dt;
      const sp = Math.hypot(this.vx, this.vy);
      this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
    }
    if (this.homing && Game.player && !Game.player.dead) {
      const p = Game.player;
      const want = angleTo(this.x, this.y, p.x, p.y - 6);
      const cur = Math.atan2(this.vy, this.vx);
      const a = cur + clamp(angDiff(cur, want), -this.homing * dt, this.homing * dt);
      const sp = Math.hypot(this.vx, this.vy);
      this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
    }
    if (this.style === 'magic' && Math.random() < 0.6) {
      FX.p({ x: this.x + rand(-1, 1), y: this.y + rand(-1, 1), vx: rand(-8, 8), vy: rand(-8, 8), color: choice(['#e0a8ff', '#c86aff', '#ffffff']), glow: true, life: 0.3, size: 1.2, size2: 0 });
    }
    if (this.style === 'ice' && Math.random() < 0.5) {
      FX.p({ x: this.x, y: this.y, vx: rand(-10, 10), vy: rand(-10, 10), kind: 'star', color: '#bff4ff', glow: true, life: 0.35, size: 1.4 });
    }
    this.trail.push(this.x, this.y);
    if (this.trail.length > 10) this.trail.splice(0, 2);

    const L = Game.level;
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    const tx = Math.floor(nx / TILE), ty = Math.floor(ny / TILE);
    if (L.solidNoProp(tx, ty)) {
      if (this.bounce > 0) {
        this.bounce--;
        const bx = L.solidNoProp(Math.floor(nx / TILE), Math.floor(this.y / TILE));
        const by = L.solidNoProp(Math.floor(this.x / TILE), Math.floor(ny / TILE));
        if (bx) this.vx = -this.vx;
        if (by) this.vy = -this.vy;
        if (!bx && !by) { this.vx = -this.vx; this.vy = -this.vy; }
        FX.sparks(this.x, this.y, rand(TAU), this.color, 3, 60, Math.PI);
        return;
      }
      this.die(true);
      return;
    }
    const prop = L.props[L.idx(tx, ty)];
    if (prop) {
      prop.hit(this.dmg, L);
      this.die(true);
      return;
    }
    this.x = nx; this.y = ny;

    if (this.team === 'p') {
      for (const e of Game.enemies) {
        if (e.dead || e.spawning || e.z > 30) continue;
        if (this.hitSet && this.hitSet.has(e)) continue;
        if (dist2(this.x, this.y, e.x, e.y - e.hitY) < (this.r + e.hitR) ** 2) {
          const sp = Math.hypot(this.vx, this.vy) || 1;
          const dm = rollDmg(this.dmg);
          e.hurt(dm, (this.vx / sp) * this.knock, (this.vy / sp) * this.knock);
          if (this.slow) e.slow = this.slow;
          FX.sparks(this.x, this.y, Math.atan2(-this.vy, -this.vx), this.color, 4, 110, 0.9);
          if (this.pierce > 0) {
            this.pierce--;
            (this.hitSet || (this.hitSet = new Set())).add(e);
          } else {
            this.die(true, e);
            return;
          }
        }
      }
    } else {
      const p = Game.player;
      if (p && !p.dead && dist2(this.x, this.y, p.x, p.y - 6) < (this.r + 3.5) ** 2) {
        if (p.hurt(this.dmg, this)) { this.die(false); }
      }
    }
  }
  die(impact) {
    if (this.dead) return;
    this.dead = true;
    if (this.splash) {
      Game.explode(this.x, this.y, this.radius, this.splash, 'p');
      return;
    }
    if (impact) {
      if (this.style === 'ice') {
        FX.sparks(this.x, this.y, rand(TAU), '#bff4ff', 7, 100, Math.PI);
        for (let i = 0; i < 5; i++) FX.p({ x: this.x, y: this.y, z: 4, vx: rand(-50, 50), vy: rand(-30, 30), vz: rand(30, 70), grav: 250, bounce: 0.3, kind: 'debris', color: choice(['#bff4ff', '#7ad8ff', '#ffffff']), size: rand(1, 2), life: 0.8, rot: rand(TAU), vr: 10 });
        FX.ring(this.x, this.y, 10, '#9fe8ff', 0.3, 1.5);
      } else {
        FX.hitWall(this.x, this.y, this.color);
      }
      Sfx.play('wallHit', 0.05);
    } else if (this.team === 'e') {
      FX.p({ x: this.x, y: this.y, kind: 'orb', color: this.color, glow: true, life: 0.15, size: 6, size2: 1 });
    }
  }

  drawGlow(g) {
    const s = this.team === 'e' ? this.r * 3.2 : this.style === 'rocket' ? 12 : this.r * 3.5;
    g.drawImage(glowTex(this.color), this.x - s, this.y - s, s * 2, s * 2);
    if (this.team === 'p' && this.trail.length >= 4 && this.style !== 'rocket') {
      g.strokeStyle = this.color;
      g.lineCap = 'round';
      const n = this.trail.length / 2;
      for (let i = 1; i < n; i++) {
        g.globalAlpha = (i / n) * 0.5;
        g.lineWidth = (i / n) * this.r * 1.4;
        g.beginPath();
        g.moveTo(this.trail[(i - 1) * 2], this.trail[(i - 1) * 2 + 1]);
        g.lineTo(this.trail[i * 2], this.trail[i * 2 + 1]);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
  }
  draw(g) {
    const a = Math.atan2(this.vy, this.vx);
    if (this.team === 'e') {
      const r = this.r;
      const pulse = 1 + Math.sin(this.t * 20) * 0.08;
      g.fillStyle = shadeHex(this.color, -0.45);
      g.beginPath(); g.arc(this.x, this.y, r * pulse + 0.8, 0, TAU); g.fill();
      g.fillStyle = this.color;
      g.beginPath(); g.arc(this.x, this.y, r * pulse, 0, TAU); g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(this.x - r * 0.25, this.y - r * 0.25, r * 0.45, 0, TAU); g.fill();
      return;
    }
    g.save();
    g.translate(this.x, this.y);
    g.rotate(a);
    switch (this.style) {
      case 'bolt':
        g.fillStyle = this.color;
        g.fillRect(-4, -1.5, 7, 3);
        g.fillStyle = '#ffffff';
        g.fillRect(-2, -0.75, 5, 1.5);
        break;
      case 'pellet':
        g.fillStyle = this.color;
        g.fillRect(-2, -1.5, 4, 3);
        g.fillStyle = '#fff8d0';
        g.fillRect(-1, -0.75, 2.5, 1.5);
        break;
      case 'rocket':
        g.fillStyle = '#2a2d3a';
        g.fillRect(-6, -2.5, 10, 5);
        g.fillStyle = '#7f9440';
        g.fillRect(-5, -1.5, 8, 3);
        g.fillStyle = '#b8c860';
        g.fillRect(-5, -1.5, 8, 1);
        g.fillStyle = '#d23a3a';
        g.fillRect(3, -1.5, 3, 3);
        g.fillStyle = '#ff7a6a';
        g.fillRect(3, -1.5, 2, 1);
        g.fillStyle = '#4a4f5e';
        g.fillRect(-7, -3.5, 3, 2); g.fillRect(-7, 1.5, 3, 2);
        // 尾焰
        const f = rand(3, 6);
        g.fillStyle = '#ffb040';
        g.fillRect(-7 - f, -1.5, f, 3);
        g.fillStyle = '#fff2b0';
        g.fillRect(-7 - f * 0.5, -0.75, f * 0.5, 1.5);
        break;
      case 'arrow':
        g.fillStyle = '#8a5e36';
        g.fillRect(-8, -0.5, 11, 1);
        g.fillStyle = this.charged ? '#fff6c0' : '#dfe6f0';
        g.fillRect(3, -1.5, 2, 3);
        g.fillRect(5, -0.5, 1.5, 1);
        g.fillStyle = '#ff5a4a';
        g.fillRect(-8, -2, 3, 1.2);
        g.fillRect(-8, 0.8, 3, 1.2);
        break;
      case 'magic': {
        const s = 3 + Math.sin(this.t * 25) * 0.4;
        g.fillStyle = '#5a2a9a';
        g.beginPath(); g.arc(0, 0, s + 0.8, 0, TAU); g.fill();
        g.fillStyle = '#c86aff';
        g.beginPath(); g.arc(0, 0, s, 0, TAU); g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(0.6, -0.6, s * 0.45, 0, TAU); g.fill();
        break;
      }
      case 'ice':
        g.fillStyle = '#2a6ab0';
        g.beginPath(); g.moveTo(6, 0); g.lineTo(0, -3); g.lineTo(-5, 0); g.lineTo(0, 3); g.closePath(); g.fill();
        g.fillStyle = '#9fe8ff';
        g.beginPath(); g.moveTo(5, 0); g.lineTo(0, -2); g.lineTo(-4, 0); g.lineTo(0, 2); g.closePath(); g.fill();
        g.fillStyle = '#ffffff';
        g.fillRect(-1, -1, 4, 1);
        break;
    }
    g.restore();
  }
}
