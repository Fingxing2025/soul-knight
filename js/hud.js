'use strict';
// ============ HUD / 小地图 / 菜单界面 ============
const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

function uiText(g, str, x, y, size, color, o = {}) {
  g.font = `${o.weight || 'bold'} ${size}px ${FONT}`;
  g.textAlign = o.align || 'left';
  g.textBaseline = o.base || 'middle';
  if (o.outline !== false) {
    g.lineJoin = 'round';
    g.strokeStyle = o.outlineColor || '#120d1a';
    g.lineWidth = o.lw || Math.max(1.5, size / 4);
    g.strokeText(str, x, y);
  }
  g.fillStyle = color;
  g.fillText(str, x, y);
}

function panel(g, x, y, w, h, o = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  g.fillStyle = o.border || '#120d1a';
  g.fillRect(x + 1, y, w - 2, 1);
  g.fillRect(x + 1, y + h - 1, w - 2, 1);
  g.fillRect(x, y + 1, 1, h - 2);
  g.fillRect(x + w - 1, y + 1, 1, h - 2);
  g.fillStyle = o.bg || 'rgba(46,34,58,0.92)';
  g.fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle = o.hl || 'rgba(255,255,255,0.08)';
  g.fillRect(x + 1, y + 1, w - 2, 1);
}

function wrapText(g, str, cx, y, maxW, lineH, size, color) {
  g.font = `bold ${size}px ${FONT}`;
  const lines = [];
  let cur = '';
  for (const ch of str) {
    if (g.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch.trim(); }
    else cur += ch;
  }
  if (cur) lines.push(cur);
  lines.forEach((l, i) => uiText(g, l, cx, y + i * lineH, size, color, { align: 'center', lw: 1.2 }));
}

const HUD = {
  dispHp: 7, dispArmor: 6, dispEnergy: 200, dispBoss: 1,
  banner: null,

  showBanner(title, sub, dur = 2.6) { this.banner = { title, sub, t: 0, dur }; },

  update(dt) {
    const p = Game.player;
    if (p) {
      this.dispHp = approach(this.dispHp, p.hp, dt * 6);
      this.dispArmor = approach(this.dispArmor, p.armor, dt * 8);
      this.dispEnergy = approach(this.dispEnergy, p.energy, dt * 240);
    }
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.dur) this.banner = null;
    }
  },

  draw(g, U, vw, vh) {
    g.setTransform(U, 0, 0, U, 0, 0);
    const p = Game.player;
    if (!p) return;
    this.drawStats(g, p);
    this.drawMinimap(g, vw);
    this.drawWeaponBox(g, p, vw, vh);
    this.drawBossBar(g, vw);
    this.drawBanner(g, vw, vh);
    // 层数
    if (!this.banner && !Game.boss) {
      uiText(g, `${Game.levelLabel()}`, vw / 2, 8, 6, '#e8e0f0', { align: 'center' });
    }
  },

  bar(g, x, y, w, h, frac, fracGhost, col, colDark, icon, label) {
    g.fillStyle = '#120d1a';
    g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle = '#2a2034';
    g.fillRect(x, y, w, h);
    if (fracGhost > frac) {
      g.fillStyle = '#ffffff';
      g.fillRect(x, y, Math.round(w * fracGhost), h);
    }
    const fw = Math.round(w * clamp(frac, 0, 1));
    g.fillStyle = colDark;
    g.fillRect(x, y, fw, h);
    g.fillStyle = col;
    g.fillRect(x, y, fw, h - 2);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(x, y, fw, 1);
    drawPixelText(g, label, x + w / 2, y + 1, '#ffffff', { align: 'center' });
    icon(g, x - 9, y - 1);
  },

  drawStats(g, p) {
    panel(g, 3, 3, 80, 33);
    const x = 15, w = 64;
    const heart = (g, x, y) => {
      g.fillStyle = '#120d1a'; g.fillRect(x, y + 1, 7, 4); g.fillRect(x + 1, y, 2, 6); g.fillRect(x + 4, y, 2, 6); g.fillRect(x + 2, y + 5, 3, 2);
      g.fillStyle = '#ff4a5a'; g.fillRect(x + 1, y + 1, 2, 4); g.fillRect(x + 4, y + 1, 2, 4); g.fillRect(x + 2, y + 2, 3, 4); g.fillRect(x + 3, y + 5, 1, 1);
      g.fillStyle = '#ffb0b8'; g.fillRect(x + 1, y + 1, 1, 1);
    };
    const shield = (g, x, y) => {
      g.fillStyle = '#120d1a'; g.fillRect(x, y, 7, 5); g.fillRect(x + 1, y + 5, 5, 1); g.fillRect(x + 2, y + 6, 3, 1);
      g.fillStyle = '#9aa8c0'; g.fillRect(x + 1, y + 1, 5, 4); g.fillRect(x + 2, y + 5, 3, 1);
      g.fillStyle = '#e0e8f4'; g.fillRect(x + 1, y + 1, 2, 2);
    };
    const gem = (g, x, y) => {
      g.fillStyle = '#120d1a'; g.fillRect(x + 2, y - 1, 3, 9); g.fillRect(x + 1, y, 5, 7); g.fillRect(x, y + 2, 7, 3);
      g.fillStyle = '#3a8aff'; g.fillRect(x + 3, y, 1, 7); g.fillRect(x + 2, y + 1, 3, 5); g.fillRect(x + 1, y + 3, 5, 1);
      g.fillStyle = '#b8e0ff'; g.fillRect(x + 2, y + 2, 1, 2);
    };
    const hpG = this.dispHp / p.maxHp;
    this.bar(g, x, 7, w, 6, p.hp / p.maxHp, hpG, '#e8404e', '#a02030', heart, `${Math.ceil(p.hp)}/${p.maxHp}`);
    this.bar(g, x, 17, w, 6, p.armor / p.maxArmor, this.dispArmor / p.maxArmor, '#a8b4cc', '#6a7896', shield, `${p.armor}/${p.maxArmor}`);
    this.bar(g, x, 27, w, 6, this.dispEnergy / p.maxEnergy, 0, '#3a8aff', '#2a5ad0', gem, `${Math.round(p.energy)}/${p.maxEnergy}`);
    // 金币
    panel(g, 3, 38, 36, 11);
    g.fillStyle = '#120d1a'; g.fillRect(6, 40, 7, 7);
    g.fillStyle = '#ffd257'; g.fillRect(7, 41, 5, 5);
    g.fillStyle = '#c98d26'; g.fillRect(10, 42, 2, 4);
    g.fillStyle = '#fff6c0'; g.fillRect(7, 41, 2, 2);
    drawPixelText(g, String(p.coins), 16, 41, '#ffe080');
  },

  drawMinimap(g, vw) {
    const L = Game.level;
    if (!L) return;
    const cs = 11, n = L.grid;
    const W = n * cs + 6;
    const x0 = Math.round(vw - W - 3), y0 = 3;
    panel(g, x0, y0, W, W, { bg: 'rgba(20,14,28,0.75)' });
    const cur = Game.curRoom;
    const pos = r => [x0 + 3 + r.gx * cs + 1.5, y0 + 3 + r.gy * cs + 1.5];
    for (const [a, b] of L.links) {
      if (!(a.seen || a.visited) || !(b.seen || b.visited)) continue;
      const [ax, ay] = pos(a), [bx, by] = pos(b);
      g.fillStyle = (a.visited && b.visited) ? '#a89cc0' : '#4a4060';
      g.fillRect(Math.min(ax, bx) + 3, Math.min(ay, by) + 3, Math.abs(bx - ax) + 2, Math.abs(by - ay) + 2);
    }
    for (const r of L.rooms) {
      if (!r.seen && !r.visited) continue;
      const [x, y] = pos(r);
      const isCur = r === cur;
      g.fillStyle = '#120d1a';
      g.fillRect(x - 1, y - 1, 10, 10);
      g.fillStyle = isCur ? '#ffffff' : r.visited ? '#b8acd0' : '#5a5070';
      g.fillRect(x, y, 8, 8);
      if (r.state === 'active') { g.fillStyle = '#ff4050'; g.fillRect(x, y, 8, 8); }
      const icon = { chest: '#ffd23a', end: '#9a7aff', boss: '#ff3040', start: '#6ad84a' }[r.type];
      if (icon) {
        g.fillStyle = '#120d1a'; g.fillRect(x + 2, y + 2, 4, 4);
        g.fillStyle = icon; g.fillRect(x + 2.5, y + 2.5, 3, 3);
      }
      if (isCur && Math.sin(Game.time * 8) > 0) {
        g.fillStyle = '#ff5a6a';
        g.fillRect(x + 3, y + 3, 2, 2);
      }
    }
  },

  drawWeaponBox(g, p, vw, vh) {
    const w = p.weapon, d = w.def;
    const bw = 64, bh = 30;
    const x = Math.round(vw - bw - 4), y = Math.round(vh - bh - 4);
    panel(g, x, y, bw, bh);
    // 稀有度条
    g.fillStyle = RARITY[d.rarity].color;
    g.fillRect(x + 1, y + 1, 2, bh - 2);
    const spr = w.spr;
    const sc = Math.min(2, 44 / spr.w, 18 / spr.h);
    g.save();
    g.translate(x + 28, y + 13);
    g.scale(sc, sc);
    if (d.type === 'bow') g.rotate(-0.0);
    g.drawImage(spr.c, -spr.w / 2, -spr.h / 2);
    g.restore();
    // 能耗
    const cost = d.eps ? d.eps + '/S' : String(d.energy);
    g.fillStyle = '#3a8aff';
    g.fillRect(x + 47, y + 4, 3, 5);
    g.fillStyle = '#b8e0ff';
    g.fillRect(x + 47, y + 4, 1, 2);
    drawPixelText(g, cost.replace('/S', ''), x + 52, y + 4, '#9fd0ff');
    uiText(g, d.name, x + 33, y + bh - 5, 5, RARITY[d.rarity].color, { align: 'center' });
    // 副武器
    if (p.weapons.length > 1) {
      const o = p.weapons[1 - p.cur];
      const ox = x - 26, oy = y + 8;
      panel(g, ox, oy, 24, 20, { bg: 'rgba(30,22,40,0.85)' });
      const s2 = o.spr;
      const sc2 = Math.min(1, 20 / s2.w, 14 / s2.h);
      g.save();
      g.translate(ox + 12, oy + 10);
      g.scale(sc2, sc2);
      g.globalAlpha = 0.85;
      g.drawImage(s2.c, -s2.w / 2, -s2.h / 2);
      g.restore();
      g.globalAlpha = 1;
      uiText(g, 'Q', ox + 3, oy + 3, 4, '#ffffff', { lw: 1.2 });
    }
    // 技能按钮
    const sx = x + 4, sy = y - 26;
    const r = 10;
    const cx = sx + r + 36, cy = sy + r;
    g.fillStyle = '#120d1a';
    g.beginPath(); g.arc(cx, cy, r + 1, 0, TAU); g.fill();
    g.fillStyle = p.skillT > 0 ? p.C.color : p.skillCd > 0 ? '#3a3046' : shadeHex(p.C.color, -0.15);
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
    if (p.skillCd > 0 && p.skillT <= 0) {
      const k = p.skillCd / p.skillMaxCd;
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * k); g.closePath(); g.fill();
    }
    // 技能图标 (按职业)
    g.save();
    g.translate(cx, cy);
    const sk = p.C.skill;
    if (sk === 'dual') {
      for (const s of [-1, 1]) {
        g.save();
        g.rotate(s * 0.7);
        g.fillStyle = '#120d1a'; g.fillRect(-1.5, -7, 3, 12);
        g.fillStyle = '#eef2f8'; g.fillRect(-0.5, -6, 1, 8);
        g.fillStyle = '#ffd257'; g.fillRect(-2, 2, 4, 1);
        g.fillStyle = '#8d5e36'; g.fillRect(-0.5, 3, 1, 2);
        g.restore();
      }
    } else if (sk === 'roll') {
      // 旋转箭头
      g.strokeStyle = '#120d1a'; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, 5, -2.6, 1.4); g.stroke();
      g.strokeStyle = '#eafff0'; g.lineWidth = 1.4;
      g.beginPath(); g.arc(0, 0, 5, -2.6, 1.4); g.stroke();
      g.fillStyle = '#120d1a'; g.fillRect(-0.5, 3, 4, 4);
      g.fillStyle = '#eafff0'; g.fillRect(0.5, 4, 2, 2);
      g.fillStyle = '#eafff0'; g.fillRect(-6, -1, 2, 2);
    } else {
      // 闪电
      const bolt = [[1.5, -7], [-3, 0.5], [0, 0.5], [-1.5, 7], [3.5, -1], [0.5, -1], [2.5, -7]];
      g.beginPath(); bolt.forEach(([bx, by], i) => (i ? g.lineTo(bx, by) : g.moveTo(bx, by))); g.closePath();
      g.lineWidth = 2; g.strokeStyle = '#120d1a'; g.stroke();
      g.fillStyle = '#fff6c0'; g.fill();
    }
    g.restore();
    if (p.skillCd > 0 && p.skillT <= 0 && p.rollT <= 0) {
      const v = p.skillMaxCd < 5 ? p.skillCd.toFixed(1) : String(Math.ceil(p.skillCd));
      drawPixelText(g, v, cx, cy - 2, '#ffffff', { align: 'center' });
    }
    if (p.skillT > 0) {
      g.strokeStyle = '#fff0a0';
      g.lineWidth = 1;
      g.beginPath(); g.arc(cx, cy, r + 2, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, p.skillT / p.C.skillDur)); g.stroke();
      // 剩余时间 (击杀可延长)
      drawPixelText(g, String(Math.ceil(p.skillT)), cx, cy - r - 8, '#ffd23a', { align: 'center' });
    }
    // 手刃提示
    const kx = cx - 26, ky = cy;
    g.globalAlpha = p.meleeReady ? 1 : 0.35;
    panel(g, kx - 9, ky - 7, 18, 14, { bg: p.meleeReady ? 'rgba(160,210,255,0.3)' : 'rgba(30,22,42,0.8)', border: p.meleeReady ? '#9fd0ff' : '#120d1a' });
    g.save();
    g.translate(kx, ky);
    g.rotate(-0.6);
    g.drawImage(SPR.w.knife.c, -SPR.w.knife.w / 2, -SPR.w.knife.h / 2);
    g.restore();
    g.globalAlpha = 1;
    uiText(g, '手刃', kx, ky + 11, 4, p.meleeReady ? '#cfe8ff' : '#8a80a0', { align: 'center', lw: 1.2 });
    uiText(g, '空格', cx, cy + r + 4, 4, '#c8c0d8', { align: 'center', lw: 1.2 });
    if (p.autoAim) uiText(g, '自动瞄准', x + bw / 2 - 18, y - 31, 4, '#6ad84a', { align: 'center', lw: 1.2 });
  },

  drawBossBar(g, vw) {
    const b = Game.boss;
    if (!b || b.dead && !Game.bossDying) return;
    const w = Math.min(160, vw - 120), x = Math.round((vw - w) / 2), y = 20;
    const k = clamp(b.hp / b.maxHp, 0, 1);
    this.dispBoss = approach(this.dispBoss, k, 0.004);
    if (this.dispBoss < k) this.dispBoss = k;
    uiText(g, ENEMY_TYPES.boss.name, vw / 2, y - 6, 6, '#ffd0d0', { align: 'center' });
    g.fillStyle = '#120d1a';
    g.fillRect(x - 2, y - 1, w + 4, 8);
    g.fillStyle = '#2a1018';
    g.fillRect(x - 1, y, w + 2, 6);
    g.fillStyle = '#ffffff';
    g.fillRect(x, y + 1, Math.round(w * this.dispBoss), 4);
    g.fillStyle = Game.bossHit > 0 ? '#ffffff' : b.raged ? '#ff2a3a' : '#e84050';
    g.fillRect(x, y + 1, Math.round(w * k), 4);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(x, y + 1, Math.round(w * k), 1);
  },

  drawBanner(g, vw, vh) {
    const b = this.banner;
    if (!b) return;
    const a = b.t < 0.4 ? b.t / 0.4 : b.t > b.dur - 0.5 ? (b.dur - b.t) / 0.5 : 1;
    const y = vh * 0.3;
    g.globalAlpha = a * 0.75;
    const gr = g.createLinearGradient(0, 0, vw, 0);
    gr.addColorStop(0, 'rgba(10,6,16,0)');
    gr.addColorStop(0.5, 'rgba(10,6,16,0.9)');
    gr.addColorStop(1, 'rgba(10,6,16,0)');
    g.fillStyle = gr;
    g.fillRect(0, y - 16, vw, 32);
    g.globalAlpha = a;
    const slide = (1 - easeOut(Math.min(1, b.t / 0.4))) * 20;
    uiText(g, b.title, vw / 2 - slide, y - 4, 14, '#ffffff', { align: 'center', lw: 3 });
    if (b.sub) uiText(g, b.sub, vw / 2 + slide, y + 10, 6, '#ffd890', { align: 'center' });
    g.globalAlpha = 1;
  },

  // 世界空间的交互提示
  drawPrompt(g, obj) {
    const pr = obj.prompt && obj.prompt();
    if (!pr) return;
    const x = obj.x, y = obj.y - 26 - (obj.isDrop ? 6 : 0);
    g.font = `bold 6px ${FONT}`;
    const tw = Math.max(g.measureText(pr.title).width, pr.sub ? g.measureText(pr.sub).width * 0.75 : 0);
    const w = Math.round(tw + 22), h = pr.sub ? 19 : 12;
    const bx = Math.round(x - w / 2), by = Math.round(y - h);
    panel(g, bx, by, w, h, { bg: 'rgba(20,14,28,0.88)' });
    // E 键
    g.fillStyle = '#120d1a'; g.fillRect(bx + 3, by + 2, 9, 8);
    g.fillStyle = '#e8e0f0'; g.fillRect(bx + 4, by + 3, 7, 6);
    g.fillStyle = '#9a90b0'; g.fillRect(bx + 4, by + 8, 7, 1);
    uiText(g, 'E', bx + 7.5, by + 5.8, 5, '#120d1a', { align: 'center', outline: false });
    uiText(g, pr.title, bx + 15, by + 6.5, 6, pr.color, { lw: 1.5 });
    if (pr.sub) uiText(g, pr.sub, bx + w / 2, by + 14, 4.5, '#c8c0d8', { align: 'center', lw: 1.2 });
    // 小三角
    g.fillStyle = '#120d1a';
    g.fillRect(Math.round(x) - 2, by + h, 5, 1);
    g.fillRect(Math.round(x) - 1, by + h + 1, 3, 1);
  },

  drawCrosshair(g, U) {
    const m = Input.mouse;
    const dpr = Game.dpr;
    const x = m.sx * dpr, y = m.sy * dpr;
    const p = Game.player;
    const firing = Input.mouse.left && p && !p.dead;
    const s = U * (firing ? 4.5 : 3.5);
    const t = U;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const draw = (col, grow) => {
      g.fillStyle = col;
      g.fillRect(x - s - t * 2 - grow, y - t / 2 - grow, t * 2 + grow * 2, t + grow * 2);
      g.fillRect(x + s - grow, y - t / 2 - grow, t * 2 + grow * 2, t + grow * 2);
      g.fillRect(x - t / 2 - grow, y - s - t * 2 - grow, t + grow * 2, t * 2 + grow * 2);
      g.fillRect(x - t / 2 - grow, y + s - grow, t + grow * 2, t * 2 + grow * 2);
      g.fillRect(x - t / 2 - grow, y - t / 2 - grow, t + grow * 2, t + grow * 2);
    };
    draw('#120d1a', U * 0.6);
    draw('#ffffff', 0);
  },
};
