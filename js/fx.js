'use strict';
// ============ 特效系统: 粒子 / 光照 / 特效对象 / 飘字 ============

const PIXEL_FONT = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001111', '/': '001001010100100', '+': '000010111010000',
  '-': '000000111000000', '!': '010010010000010', 'x': '000101010101000', ':': '000010000010000',
  '.': '000000000000010', ' ': '000000000000000',
};
function drawPixelText(g, str, x, y, color, opts = {}) {
  const s = opts.scale || 1;
  const outline = opts.outline !== false ? (opts.outlineColor || '#120d1a') : null;
  const w = str.length * 4 * s - s;
  let ox = opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x;
  ox = Math.round(ox); y = Math.round(y);
  const pass = (col, grow) => {
    g.fillStyle = col;
    let cx = ox;
    for (const ch of str) {
      const gl = PIXEL_FONT[ch] || PIXEL_FONT[' '];
      for (let i = 0; i < 15; i++) {
        if (gl[i] === '1') {
          const px = cx + (i % 3) * s, py = y + Math.floor(i / 3) * s;
          g.fillRect(px - grow, py - grow, s + grow * 2, s + grow * 2);
        }
      }
      cx += 4 * s;
    }
  };
  if (outline) pass(outline, s);
  pass(color, 0);
  return w;
}

const FX = {
  parts: [],
  effects: [],
  texts: [],
  lights: [],
  shakeAmt: 0,
  kickX: 0, kickY: 0,
  hitstop: 0,
  slowmo: 0,
  screenFlash: { color: '#ffffff', a: 0 },
  hurtFlash: 0,

  reset() {
    this.parts.length = 0;
    this.effects.length = 0;
    this.texts.length = 0;
    this.shakeAmt = 0;
    this.kickX = this.kickY = 0;
    this.screenFlash.a = 0;
    this.hurtFlash = 0;
  },

  addShake(a) { this.shakeAmt = Math.min(14, this.shakeAmt + a); },
  kick(ang, amt) { this.kickX -= Math.cos(ang) * amt; this.kickY -= Math.sin(ang) * amt; },
  flash(color, a) { this.screenFlash.color = color; this.screenFlash.a = Math.max(this.screenFlash.a, a); },
  light(x, y, r, color, a = 1) { this.lights.push({ x, y, r, color, a }); },

  p(o) {
    if (this.parts.length > 2600) this.parts.shift();
    const p = Object.assign({
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.5, size: 1, size2: null, color: '#fff', color2: null,
      kind: 'px', drag: 0, grav: 0, rot: 0, vr: 0, glow: false, bounce: 0, t: 0, alpha: 1, ground: false,
    }, o);
    p.max = p.life;
    this.parts.push(p);
    return p;
  },

  update(dt) {
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * (8 + this.shakeAmt * 4));
    const kd = Math.exp(-dt * 14);
    this.kickX *= kd; this.kickY *= kd;
    this.screenFlash.a = Math.max(0, this.screenFlash.a - dt * 3);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.2);

    const P = this.parts;
    let j = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.life -= dt;
      p.t += dt;
      if (p.life <= 0) continue;
      if (p.drag) {
        const d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vy *= d;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.grav) {
        p.vz -= p.grav * dt;
        p.z += p.vz * dt;
        if (p.z <= 0) {
          p.z = 0;
          if (p.bounce && Math.abs(p.vz) > 20) {
            p.vz = -p.vz * p.bounce;
            p.vx *= 0.6; p.vy *= 0.6; p.vr *= 0.5;
          } else {
            p.vz = 0; p.vx *= 0.85; p.vy *= 0.85; p.vr *= 0.8;
            if (p.kind === 'shell' || p.kind === 'debris') p.ground = true;
          }
        }
      }
      p.rot += p.vr * dt;
      P[j++] = p;
    }
    P.length = j;

    this.effects = this.effects.filter(e => e.update(dt) !== false);

    for (const t of this.texts) {
      t.life -= dt;
      t.t += dt;
      t.y += t.vy * dt;
      t.vy *= Math.exp(-dt * 4);
    }
    this.texts = this.texts.filter(t => t.life > 0);
  },

  // ------- 绘制 -------
  drawParts(g, ground) {
    for (const p of this.parts) {
      if (p.glow || (p.ground || p.kind === 'blood') !== ground) continue;
      const k = p.life / p.max;
      switch (p.kind) {
        case 'px': case 'blood': {
          const s = p.size2 !== null ? lerp(p.size2, p.size, k) : p.size;
          g.globalAlpha = p.alpha * Math.min(1, k * 3);
          g.fillStyle = p.color2 && k < 0.5 ? p.color2 : p.color;
          g.fillRect(p.x - s / 2, p.y - p.z - s / 2, s, s);
          break;
        }
        case 'smoke': {
          const s = lerp(p.size2, p.size, k);
          g.globalAlpha = p.alpha * k;
          g.fillStyle = p.color;
          g.beginPath();
          g.arc(p.x, p.y - p.z, s, 0, TAU);
          g.fill();
          break;
        }
        case 'shell': case 'debris': {
          g.globalAlpha = Math.min(1, p.life * 2);
          if (p.z > 0.5) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(p.x - 1, p.y - 0.5, 2, 1); }
          g.save();
          g.translate(p.x, p.y - p.z);
          g.rotate(p.rot);
          g.fillStyle = p.color;
          const w = p.kind === 'shell' ? 2.5 : p.size, h = p.kind === 'shell' ? 1.2 : p.size;
          g.fillRect(-w / 2, -h / 2, w, h);
          if (p.kind === 'shell') { g.fillStyle = '#fff6c0'; g.fillRect(-w / 2, -h / 2, 1, h / 2); }
          else if (p.color2) { g.fillStyle = p.color2; g.fillRect(-w / 2, -h / 2, w, 1); }
          g.restore();
          break;
        }
      }
    }
    g.globalAlpha = 1;
  },

  drawGlowParts(g) {
    for (const p of this.parts) {
      if (!p.glow) continue;
      const k = p.life / p.max;
      g.globalAlpha = p.alpha * Math.min(1, k * 2);
      if (p.kind === 'spark') {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const len = Math.min(p.size * 6, sp * 0.03) * k + 0.5;
        g.strokeStyle = p.color;
        g.lineWidth = p.size * (0.4 + 0.6 * k);
        g.beginPath();
        g.moveTo(p.x, p.y - p.z);
        g.lineTo(p.x - (p.vx / sp) * len, p.y - p.z - (p.vy / sp) * len);
        g.stroke();
      } else if (p.kind === 'star') {
        const s = p.size * (0.5 + Math.sin(k * Math.PI) * 0.8);
        g.fillStyle = p.color;
        g.fillRect(p.x - s, p.y - p.z - 0.5, s * 2, 1);
        g.fillRect(p.x - 0.5, p.y - p.z - s, 1, s * 2);
        g.fillStyle = '#ffffff';
        g.fillRect(p.x - 0.5, p.y - p.z - 0.5, 1, 1);
      } else if (p.kind === 'orb') {
        const s = (p.size2 !== null ? lerp(p.size2, p.size, k) : p.size);
        g.drawImage(glowTex(p.color), p.x - s, p.y - p.z - s, s * 2, s * 2);
      } else {
        const s = p.size2 !== null ? lerp(p.size2, p.size, k) : p.size;
        g.fillStyle = p.color2 && k < 0.5 ? p.color2 : p.color;
        g.fillRect(p.x - s / 2, p.y - p.z - s / 2, s, s);
      }
    }
    g.globalAlpha = 1;
  },

  drawEffects(g) { for (const e of this.effects) if (e.draw) e.draw(g); },
  drawEffectsGlow(g) { for (const e of this.effects) if (e.drawGlow) e.drawGlow(g); },
  drawEffectsGround(g) { for (const e of this.effects) if (e.drawGround) e.drawGround(g); },

  drawTexts(g) {
    for (const t of this.texts) {
      const k = t.life / t.max;
      const pop = t.t < 0.12 ? 1 + (1 - t.t / 0.12) * 0.6 : 1;
      g.globalAlpha = Math.min(1, k * 3);
      if (t.num !== undefined) {
        const s = (t.crit ? 1 : 1) * pop;
        g.save();
        g.translate(t.x, t.y);
        g.scale(s, s);
        drawPixelText(g, t.num, 0, 0, t.color, { align: 'center', scale: t.crit ? 1 : 1 });
        g.restore();
      } else {
        g.save();
        g.translate(t.x, t.y);
        g.scale(pop, pop);
        g.font = `bold ${t.size}px "PingFang SC","Microsoft YaHei",sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 2;
        g.strokeStyle = '#120d1a';
        g.lineJoin = 'round';
        g.strokeText(t.str, 0, 0);
        g.fillStyle = t.color;
        g.fillText(t.str, 0, 0);
        g.restore();
      }
    }
    g.globalAlpha = 1;
  },

  // ------- 生成器 -------
  dmg(x, y, n, crit, color) {
    this.texts.push({ x: x + rand(-3, 3), y: y - 4, num: String(n) + (crit ? '!' : ''), crit, color: color || (crit ? '#ffd23a' : '#ffffff'), life: 0.7, max: 0.7, vy: -45, t: 0 });
  },
  text(x, y, str, color = '#ffffff', size = 7, life = 1.1) {
    this.texts.push({ x, y, str, color, size, life, max: life, vy: -28, t: 0 });
  },

  sparks(x, y, ang, color, n = 6, spd = 120, spread = 0.8, size = 1) {
    for (let i = 0; i < n; i++) {
      const a = ang + rand(-spread, spread);
      const s = spd * rand(0.4, 1.1);
      this.p({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, kind: 'spark', color, glow: true, life: rand(0.12, 0.3), drag: 6, size });
    }
  },
  burst(x, y, color, n = 10, spd = 80, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), s = spd * rand(0.3, 1);
      this.p(Object.assign({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color, life: rand(0.25, 0.55), drag: 5, size: rand(1, 2.5), size2: 0 }, o));
    }
  },
  smoke(x, y, n = 4, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), s = rand(5, 25) * (o.spd || 1);
      this.p(Object.assign({ x: x + rand(-2, 2), y: y + rand(-2, 2), vx: Math.cos(a) * s, vy: Math.sin(a) * s - 8, kind: 'smoke', color: o.color || '#d8d4e0', alpha: o.alpha || 0.5, life: rand(0.4, 0.8), size: rand(1, 2.5), size2: rand(4, 7) * (o.big || 1), drag: 2 }, o.extra || {}));
    }
  },
  dust(x, y, n = 2) {
    for (let i = 0; i < n; i++) {
      this.p({ x: x + rand(-2, 2), y: y + rand(-1, 1), vx: rand(-12, 12), vy: rand(-6, 0), kind: 'smoke', color: '#e8e4d8', alpha: 0.35, life: rand(0.3, 0.5), size: 0.8, size2: rand(2, 3.5), drag: 3 });
    }
  },
  shell(x, y, ang, color = '#e8b84a') {
    const side = Math.cos(ang) >= 0 ? -1 : 1;
    this.p({ x, y, z: 6, vx: side * rand(25, 55), vy: rand(-10, 10), vz: rand(50, 90), grav: 320, bounce: 0.45, kind: 'shell', color, life: rand(1.2, 2.0), rot: rand(TAU), vr: rand(-25, 25) });
  },
  debris(x, y, colors, n = 8, spd = 70) {
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), s = spd * rand(0.3, 1);
      this.p({ x, y, z: rand(2, 8), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, vz: rand(40, 110), grav: 300, bounce: 0.35, kind: 'debris', color: choice(colors), color2: null, size: rand(1.5, 3), life: rand(1.5, 2.6), rot: rand(TAU), vr: rand(-20, 20) });
    }
  },
  embers(x, y, color, n = 6, spd = 40) {
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), s = rand(10, spd);
      this.p({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 15, color, glow: true, life: rand(0.4, 0.9), size: rand(1, 1.8), size2: 0, drag: 2.5 });
    }
  },
  stars(x, y, color, n = 5, r = 10) {
    for (let i = 0; i < n; i++) {
      this.p({ x: x + rand(-r, r), y: y + rand(-r, r), vy: rand(-15, -4), kind: 'star', color, glow: true, life: rand(0.4, 0.8), size: rand(1.5, 3) });
    }
  },

  muzzle(x, y, ang, color = '#ffe080', size = 1) {
    this.effects.push(new MuzzleFlash(x, y, ang, color, size));
    this.light(x, y, 40 * size, color, 0.9);
    this.sparks(x, y, ang, color, Math.round(3 * size), 140 * size, 0.5);
    this.p({ x: x + Math.cos(ang) * 3, y: y + Math.sin(ang) * 3, kind: 'smoke', color: '#cfcbd8', alpha: 0.35, life: 0.35, size: 1, size2: 3 + size * 2, vx: Math.cos(ang) * 20, vy: Math.sin(ang) * 20 - 8, drag: 4 });
  },
  hitWall(x, y, color) {
    this.sparks(x, y, rand(TAU), color, 5, 90, Math.PI);
    this.p({ x, y, kind: 'orb', color, glow: true, life: 0.12, size: 7, size2: 2 });
    this.smoke(x, y, 1, { alpha: 0.3, big: 0.6 });
  },
  explosion(x, y, r = 32, color = '#ffa040') {
    this.effects.push(new Explosion(x, y, r, color));
    this.addShake(r / 5);
    this.flash('#fff2c0', 0.25);
    this.hitstop = Math.max(this.hitstop, 0.04);
    for (let i = 0; i < 14; i++) {
      const a = rand(TAU), s = rand(20, 70) * r / 32;
      this.p({ x: x + Math.cos(a) * r * 0.3, y: y + Math.sin(a) * r * 0.3, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 10, kind: 'smoke', color: choice(['#4a4250', '#5c5466', '#3a3440']), alpha: 0.75, life: rand(0.7, 1.4), size: rand(3, 6) * r / 32, size2: rand(8, 14) * r / 32, drag: 2.5 });
    }
    this.embers(x, y, '#ffb040', 18, 160 * r / 32);
    this.sparks(x, y, 0, '#fff0a0', 16, 260 * r / 32, Math.PI, 1.5);
    this.debris(x, y, ['#3a3038', '#2a2228', '#5a4a40'], 10, 120);
  },
  slash(x, y, ang, dir, radius, color, width) {
    this.effects.push(new Slash(x, y, ang, dir, radius, color, width));
  },
  lightning(pts, color = '#9fe8ff', width = 1.6) {
    this.effects.push(new Lightning(pts, color, width));
  },
  ring(x, y, r, color, life = 0.4, width = 2) {
    this.effects.push(new Ring(x, y, r, color, life, width));
  },
  spawnCircle(x, y, dur, color) {
    const e = new SpawnCircle(x, y, dur, color);
    this.effects.push(e);
    return e;
  },
};

// ---------- 特效对象 ----------
class MuzzleFlash {
  constructor(x, y, ang, color, size) {
    Object.assign(this, { x, y, ang, color, size, t: 0, life: 0.06 });
    this.spikes = Array.from({ length: 5 }, () => rand(0.5, 1));
  }
  update(dt) { this.t += dt; return this.t < this.life; }
  drawGlow(g) {
    const k = 1 - this.t / this.life;
    const s = this.size * (5 + 3 * k);
    g.save();
    g.translate(this.x, this.y);
    g.rotate(this.ang);
    g.globalAlpha = k;
    g.drawImage(glowTex(this.color), -s * 1.6, -s * 1.6, s * 3.2, s * 3.2);
    // 星形火焰
    g.fillStyle = this.color;
    g.beginPath();
    g.moveTo(-1, 0);
    g.lineTo(s * 0.4, -s * 0.55 * this.spikes[0]);
    g.lineTo(s * 1.6 * this.spikes[1], 0);
    g.lineTo(s * 0.4, s * 0.55 * this.spikes[2]);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(s * 0.3, -s * 0.25);
    g.lineTo(s * 0.9, 0);
    g.lineTo(s * 0.3, s * 0.25);
    g.closePath();
    g.fill();
    g.restore();
    g.globalAlpha = 1;
  }
}

class Explosion {
  constructor(x, y, r, color) {
    Object.assign(this, { x, y, r, color, t: 0, life: 0.5 });
    this.blobs = Array.from({ length: 7 }, () => [rand(TAU), rand(0.2, 0.7), rand(0.35, 0.6)]);
  }
  update(dt) {
    this.t += dt;
    const k = 1 - this.t / this.life;
    if (k > 0) FX.light(this.x, this.y, this.r * 3 * k + 20, '#ffa040', k);
    return this.t < this.life;
  }
  drawGround(g) {
    const k = this.t / this.life;
    g.globalAlpha = (1 - k) * 0.6;
    g.strokeStyle = '#ffe0a0';
    g.lineWidth = 2 * (1 - k) + 0.5;
    g.beginPath();
    g.ellipse(this.x, this.y, this.r * (0.4 + k * 1.1), this.r * (0.3 + k * 0.8), 0, 0, TAU);
    g.stroke();
    g.globalAlpha = 1;
  }
  drawGlow(g) {
    const k = this.t / this.life;
    const r = this.r;
    // 火球
    if (k < 0.1) {
      g.globalAlpha = 0.8;
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(this.x, this.y, r * (0.3 + k * 4), 0, TAU); g.fill();
    }
    const fr = r * (0.45 + easeOut(Math.min(1, k * 2)) * 0.4) * (1 - k * 0.5);
    g.globalAlpha = (1 - k) * 0.8;
    g.drawImage(glowTex('#ff7a20'), this.x - fr * 2, this.y - fr * 2, fr * 4, fr * 4);
    // 火球团块
    g.globalAlpha = (1 - k) * 0.85;
    for (let i = 0; i < this.blobs.length; i++) {
      const [a, d, s] = this.blobs[i];
      const bx = this.x + Math.cos(a) * d * fr * (0.6 + k), by = this.y + Math.sin(a) * d * fr * (0.5 + k) - k * 6;
      g.fillStyle = k < 0.25 ? '#ffe080' : k < 0.5 ? '#ff9a30' : '#d84a20';
      g.beginPath(); g.arc(bx, by, s * fr * (1 - k * 0.8), 0, TAU); g.fill();
    }
    g.fillStyle = k < 0.3 ? '#fff8e0' : '#ffd060';
    g.beginPath(); g.arc(this.x, this.y - fr * 0.1, fr * 0.45 * (1 - k), 0, TAU); g.fill();
    g.globalAlpha = 1;
  }
}

class Slash {
  constructor(x, y, ang, dir, radius, color, width = 7) {
    Object.assign(this, { x, y, ang, dir, radius, color, width, t: 0, life: 0.2 });
  }
  update(dt) { this.t += dt; return this.t < this.life; }
  drawGlow(g) {
    const k = this.t / this.life;
    const sweep = 2.4;
    const prog = easeOut(Math.min(1, k * 2.2));
    const a0 = this.ang - (sweep / 2) * this.dir;
    const a1 = a0 + sweep * prog * this.dir;
    const steps = 18;
    // 月牙形: 外层彩色 + 内层白芯
    for (let layer = 0; layer < 2; layer++) {
      const w = layer === 0 ? this.width : this.width * 0.4;
      const R = this.radius;
      g.globalAlpha = (1 - k * k) * (layer === 0 ? 0.55 : 0.9);
      g.fillStyle = layer === 0 ? this.color : '#ffffff';
      g.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const a = lerp(a0, a1, t);
        const rr = R + 1;
        if (i === 0) g.moveTo(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr);
        else g.lineTo(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr);
      }
      for (let i = steps; i >= 0; i--) {
        const t = i / steps;
        const a = lerp(a0, a1, t);
        const thick = Math.sin(t * Math.PI) * w * (layer ? 1 : 1) * (0.5 + 0.5 * t);
        const rr = R - thick;
        g.lineTo(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
  }
}

class Lightning {
  constructor(pts, color, width) {
    Object.assign(this, { pts, color, width, t: 0, life: 0.2, segs: null, regen: 0 });
    this.build();
  }
  build() {
    this.segs = [];
    for (let i = 0; i < this.pts.length - 1; i++) {
      const [ax, ay] = this.pts[i], [bx, by] = this.pts[i + 1];
      this.segs.push(jagged(ax, ay, bx, by, 6));
      if (chance(0.7)) {
        const m = this.segs[this.segs.length - 1];
        const s = m[(m.length * rand(0.2, 0.7)) | 0];
        const a = angleTo(ax, ay, bx, by) + rand(-1.2, 1.2);
        const l = rand(8, 18);
        this.segs.push(jagged(s[0], s[1], s[0] + Math.cos(a) * l, s[1] + Math.sin(a) * l, 3, true));
      }
    }
  }
  update(dt) {
    this.t += dt;
    this.regen -= dt;
    if (this.regen <= 0) { this.regen = 0.04; this.build(); }
    for (const [x, y] of this.pts) FX.light(x, y, 40, this.color, 1 - this.t / this.life);
    return this.t < this.life;
  }
  drawGlow(g) {
    const k = 1 - this.t / this.life;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const passes = [[this.width * 4, this.color, 0.25], [this.width * 1.8, this.color, 0.8], [this.width * 0.7, '#ffffff', 1]];
    for (const [w, c, a] of passes) {
      g.strokeStyle = c;
      g.lineWidth = w * (0.6 + 0.4 * k);
      g.globalAlpha = a * k;
      for (const s of this.segs) {
        g.beginPath();
        g.moveTo(s[0][0], s[0][1]);
        for (let i = 1; i < s.length; i++) g.lineTo(s[i][0], s[i][1]);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }
}
function jagged(ax, ay, bx, by, n, branch) {
  const pts = [[ax, ay]];
  const d = dist(ax, ay, bx, by);
  const segs = Math.max(2, Math.round(d / n));
  const nx = -(by - ay) / (d || 1), ny = (bx - ax) / (d || 1);
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const off = rand(-1, 1) * Math.min(6, d * 0.12) * (branch ? 1 - t : Math.sin(t * Math.PI));
    pts.push([lerp(ax, bx, t) + nx * off, lerp(ay, by, t) + ny * off]);
  }
  pts.push([bx, by]);
  return pts;
}

class Ring {
  constructor(x, y, r, color, life, width) { Object.assign(this, { x, y, r, color, life, width, t: 0 }); }
  update(dt) { this.t += dt; return this.t < this.life; }
  drawGlow(g) {
    const k = this.t / this.life;
    g.globalAlpha = 1 - k;
    g.strokeStyle = this.color;
    g.lineWidth = this.width * (1 - k) + 0.5;
    g.beginPath();
    g.ellipse(this.x, this.y, this.r * easeOut(k), this.r * easeOut(k) * 0.75, 0, 0, TAU);
    g.stroke();
    g.globalAlpha = 1;
  }
}

class SpawnCircle {
  constructor(x, y, dur, color = '#ff5a8a') { Object.assign(this, { x, y, dur, color, t: 0 }); }
  update(dt) {
    this.t += dt;
    if (Math.random() < 0.5) FX.p({ x: this.x + rand(-8, 8), y: this.y + rand(-4, 4), vy: rand(-30, -12), color: this.color, glow: true, life: 0.5, size: 1.2, size2: 0 });
    FX.light(this.x, this.y, 26, this.color, 0.7);
    return this.t < this.dur + 0.15;
  }
  drawGround(g) {
    const k = Math.min(1, this.t / 0.25);
    const fade = this.t > this.dur ? 1 - (this.t - this.dur) / 0.15 : 1;
    const r = 11 * easeOutBack(k);
    g.save();
    g.translate(this.x, this.y);
    g.scale(1, 0.6);
    g.globalAlpha = fade * 0.9;
    g.strokeStyle = this.color;
    g.lineWidth = 1;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
    g.beginPath(); g.arc(0, 0, r * 0.7, 0, TAU); g.stroke();
    g.rotate(this.t * 3);
    // 符文三角
    for (let j = 0; j < 2; j++) {
      g.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + j * Math.PI;
        const px = Math.cos(a) * r * 0.7, py = Math.sin(a) * r * 0.7;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
      g.stroke();
    }
    g.fillStyle = this.color;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      g.fillRect(Math.cos(a) * r - 0.5, Math.sin(a) * r - 0.5, 1.5, 1.5);
    }
    g.restore();
    g.globalAlpha = 1;
  }
}
