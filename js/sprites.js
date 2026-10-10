'use strict';
// ============ 像素美术 (字符画 -> Canvas, 自动描边/闪白/着色) ============
const OUTLINE = '#120d1a';

function buildSprite(rows, pal, opts = {}) {
  const outline = opts.outline !== false;
  const h = rows.length;
  const w = Math.max(...rows.map(r => r.length));
  const pad = outline ? 1 : 0;
  const W = w + pad * 2, H = h + pad * 2;
  const [c, g] = makeCanvas(W, H);
  const img = g.createImageData(W, H);
  const d = img.data;
  const palRgb = {};
  for (const k in pal) palRgb[k] = hexToRgb(pal[k]);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const rgb = palRgb[row[x]];
      if (!rgb) continue;
      const i = ((y + pad) * W + x + pad) * 4;
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
    }
  }
  if (outline) {
    const oc = hexToRgb(opts.outlineColor || OUTLINE);
    const A = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) A[i] = d[i * 4 + 3];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x;
      if (A[k]) continue;
      if ((x > 0 && A[k - 1]) || (x < W - 1 && A[k + 1]) || (y > 0 && A[k - W]) || (y < H - 1 && A[k + W])) {
        d[k * 4] = oc[0]; d[k * 4 + 1] = oc[1]; d[k * 4 + 2] = oc[2]; d[k * 4 + 3] = 255;
      }
    }
  }
  g.putImageData(img, 0, 0);
  return { c, w: W, h: H, flash: silhouette(c, '#ffffff'), pad, pal };
}

function silhouette(src, color) {
  const [c, g] = makeCanvas(src.width, src.height);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

function tintSprite(spr, color, amt) {
  const [c, g] = makeCanvas(spr.w, spr.h);
  g.drawImage(spr.c, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = amt;
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return { ...spr, c, flash: spr.flash };
}

function mirrorRows(half) {
  return half.map(r => r + r.split('').reverse().join(''));
}

// 绘制精灵: 锚点默认底部中心
function drawSpr(g, spr, x, y, o = {}) {
  const img = o.flash ? spr.flash : spr.c;
  const ax = o.ax !== undefined ? o.ax : spr.w / 2;
  const ay = o.ay !== undefined ? o.ay : spr.h;
  const sx = o.sx || 1, sy = o.sy || 1;
  if (o.alpha !== undefined) g.globalAlpha = o.alpha;
  if (!o.rot && sx === 1 && sy === 1 && !o.flipX) {
    g.drawImage(img, Math.round((x - ax) * 4) / 4, Math.round((y - ay) * 4) / 4);
  } else {
    g.save();
    g.translate(x, y);
    if (o.rot) g.rotate(o.rot);
    g.scale(o.flipX ? -sx : sx, sy);
    g.drawImage(img, -ax, -ay);
    g.restore();
  }
  if (o.alpha !== undefined) g.globalAlpha = 1;
}

function drawShadow(g, x, y, rx, ry, a = 0.32) {
  g.fillStyle = `rgba(10,6,20,${a})`;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, TAU);
  g.fill();
}

const SPR = {};

// ---------------- 角色 ----------------
const PAL_KNIGHT = {
  '1': '#f5f8ff', '2': '#c8d2e4', '3': '#8f9cb8', '4': '#606d8c', '5': '#414a66',
  v: '#191b2b', e: '#7ff4ff', R: '#ee4d5a', r: '#ad2c42', p: '#ff9a9a',
  G: '#ffd257', g: '#c98d26', B: '#4277e0', b: '#2b4ba0', k: '#2c3047',
};
const KNIGHT_BODY = [
  '.....rRRRp....',
  '....rRRRRRp...',
  '...r53222211..',
  '..r5332222211.',
  '..r5332222221.',
  '...533vvvvvvv.',
  '...53vvevvvev.',
  '...533vvvvvvv.',
  '...5533333332.',
  '....55444443..',
  '...gGGGGGGGg..',
  '..43BBBBBBB34.',
  '..54BBGGgBB45.',
  '...5bbbbbbb5..',
];
const KNIGHT_LEGS = [
  ['.....kk.kk....', '.....55.55....'],
  ['....kk...kk...', '...55.....55..'],
  ['.....kk.kk....', '.....55.55....'],
  ['......kkk.....', '.....55555....'],
];

// 游侠: 绿色兜帽 + 红围巾 + 皮甲
const PAL_RANGER = {
  H: '#4fa84a', h: '#2f6e34', L: '#86d470', s: '#f2c8a0', S: '#c8946c', e: '#2a1e2a',
  R: '#e04a4a', r: '#9a2a34', B: '#a8743f', b: '#6a4428', G: '#ffd257', k: '#3a3046', n: '#5a3a24',
};
const RANGER_BODY = [
  '....hhhh......',
  '...hHHHHh.....',
  '..hHHLLHHh....',
  '..hHLHHHHHh...',
  '.hHHHHHHHHHh..',
  '.hHHhsssssSh..',
  '.hHhsesssesh..',
  '.hHhsssssssh..',
  '..hhRRRRRRRr..',
  '...rBBBBBBBr..',
  '..sbBBGGBBBbs.',
  '...bBBBBBBBb..',
];
const RANGER_LEGS = [
  ['.....kk.kk....', '.....nn.nn....'],
  ['....kk...kk...', '...nn.....nn..'],
  ['.....kk.kk....', '.....nn.nn....'],
  ['......kkk.....', '.....nnnnn....'],
];

// 法师: 尖顶星星帽 + 白胡子 + 紫袍
const PAL_WIZARD = {
  P: '#4a5ad8', p: '#2e3a9a', L: '#8a9af8', Y: '#ffe066', s: '#f2c8a0', S: '#c8946c', e: '#2a1e2a',
  W: '#f4f0e8', w: '#c8c0b8', R: '#8a52e0', r: '#55309c', G: '#ffd257', k: '#3a2a4a',
};
const WIZARD_BODY = [
  '.......pP.....',
  '......pPP.....',
  '.....pPLP.....',
  '....pPPLPP....',
  '....pPYPPP....',
  '...pPPPPPPP...',
  '.ppPPPPPPPPPp.',
  '..ppppppppppp.',
  '...sssssssS...',
  '...sesssesS...',
  '...WWsssWWw...',
  '..rWWWWWWWWr..',
  '..sRWWWWWWRs..',
  '..rRRGRRRRRr..',
];
const WIZARD_LEGS = [
  ['..rRRRRRRRRr..', '....kk..kk....'],
  ['..rRRRRRRRRr..', '...kk....kk...'],
  ['..rRRRRRRRRr..', '....kk..kk....'],
  ['..rRRRRRRRRr..', '.....kkkk.....'],
];

const PAL_GOBLIN = {
  h: '#a6e57a', G: '#74c24c', g: '#4f9136', d: '#356b27', e: '#ff4040', w: '#f4f0e0',
  T: '#9a6a3c', t: '#6a4428', b: '#3a2a24', k: '#3a2a24',
};
const GOBLIN_BODY = [
  '.....hGGGg.....',
  '....hGGGGGGg...',
  '.dggGGGGGGGGggd',
  '..ddgGGeGGGeGd.',
  '...dgGGGGGGGg..',
  '....dgGGwwGg...',
  '.....dgggggd...',
  '....tTTTTTTt...',
  '...gtTTbbTTtg..',
  '...dtTTTTTTtd..',
  '....tttttttt...',
];
const GOBLIN_LEGS = [
  ['.....kk..kk....', '.....kk..kk....'],
  ['....kk....kk...', '...kk......kk..'],
  ['.....kk..kk....', '.....kk..kk....'],
  ['......kk.kk....', '......kkkk.....'],
];

const PAL_SHAMAN = {
  P: '#9b5de5', p: '#5e2f9a', y: '#ffd257', G: '#74c24c', g: '#4f9136', d: '#356b27',
  e: '#ffe14a', k: '#2a1e2a',
};
const SHAMAN_BODY = [
  '......pP.......',
  '.....pPPPp.....',
  '....pPPPPPp....',
  '...pPPPPPPPp...',
  '.dgpPGGGGGGPpgd',
  '..dpGGeGGGeGp..',
  '...pGGGGGGGGp..',
  '...ppdGGGGgpp..',
  '...pPPPPPPPPp..',
  '..pPPPyPPPPPPp.',
  '..pPPPyPPPPPPp.',
  '...ppppppppp...',
];
const SHAMAN_LEGS = [
  ['.....kk..kk....'],
  ['....kk....kk...'],
  ['.....kk..kk....'],
  ['......kk.kk....'],
];

const PAL_BOAR = {
  M: '#3a2418', D: '#4a2a1a', F: '#9a6440', f: '#6b4128', h: '#c48a5a',
  n: '#e89a9a', N: '#b86a6a', w: '#f4ecd8', e: '#ff3030', k: '#2a1a12',
};
const BOAR_BODY = [
  '......M.M.M.........',
  '....MMMMMMMMM.......',
  '..MMDFFhhhhFFFf.....',
  '.MDFFFFFFFFFFFFFf...',
  'MDFFFFFFFFFFFFFFFf..',
  'DFFFFFFFFFFFFFFeFFf.',
  'DfFFFFFFFFFFFFFFFnnN',
  'DffFFFFFFFFFFFFFwnnN',
  '.DffffFFFFFFFFffwwN.',
  '..DfffffffffffffD...',
];
const BOAR_LEGS = [
  ['...Dk.Dk....Dk.Dk...', '...kk.kk....kk.kk...'],
  ['..Dk...Dk..Dk...Dk..', '..kk...kk..kk...kk..'],
  ['...Dk.Dk....Dk.Dk...', '...kk.kk....kk.kk...'],
  ['....DkDk.....DkDk...', '....kkkk.....kkkk...'],
];

const PAL_SLIME = { S: '#4fd1c5', s: '#2b9aa0', d: '#1d6575', h: '#c8fff6', w: '#ffffff', e: '#16233a' };
const SLIME = [
  '.....sss.....',
  '...ssSSSss...',
  '..sShhSSSSs..',
  '.sShSSSSSSSs.',
  '.sSSSwSSSwSs.',
  'sSSSSeSSSeSSs',
  'sSSSSSSSSSSSs',
  'dsSSSSSSSSSsd',
  '.ddsssssssdd.',
];

const PAL_BAT = { B: '#5a4580', b: '#3a2a5a', W: '#8a64c0', w: '#55398a', e: '#ffe04a', t: '#ffffff' };
const BAT_UP = [
  'W...............W',
  'WW.............WW',
  'WWw...b...b...wWW',
  '.WWw.bBBBBBb.wWW.',
  '..WWwBBeBeBBwWW..',
  '...wwBBBBBBBww...',
  '......BtBtB......',
  '.......bbb.......',
];
const BAT_DOWN = [
  '......b...b......',
  '.....bBBBBBb.....',
  '....wBBeBeBBw....',
  '..wWWBBBBBBBWWw..',
  '.wWWw.BtBtB.wWWw.',
  'wWWw...bbb...wWWw',
  'WW.............WW',
  'W...............W',
];

const PAL_BOSS = {
  N: '#efe3c8', n: '#a89878', I: '#b9bfd0', H: '#7a8096', i: '#4a4f66',
  A: '#f0b840', a: '#a8742a', G: '#6fbf4a', g: '#4a8f35', d: '#2f6324', h: '#a6e57a',
  e: '#ffeb3b', E: '#ff2a2a', w: '#f4f0e0', C: '#d0384a', c: '#7e1e2e', T: '#6a4428', k: '#2a1e1a',
};
const BOSS_HALF = [
  'N...........',
  'nN..........',
  'nNN.........',
  '.nNN...IIIII',
  '.nNNNIIHHHHH',
  '..nNiHHHHHHH',
  '...niHHHHHHH',
  '....iHAAAAAA',
  '....iHAaAaAa',
  'dg..iiHHHHHH',
  'dgGgGGiiiiii',
  '.dgGGGGGGGGG',
  '..dGGGeeGGGG',
  '..dGGGeEGGGG',
  '..dgGGGGGGGh',
  '...dgGwGwGGG',
  '....dgggggGG',
  '..cCCaAAAAAA',
  '.cCaAAaaAAAA',
  '.cCaAATTTTTT',
  'cCCgGaTTTTTT',
  'cCCgGaTTkkkk',
  'cCCdgaTTkkkA',
  'cCC..TTTTTTT',
  '.cc..TTTTTTT',
];
const BOSS_LEGS = [
  ['....kkkk....', '....kkkk....'],
  ['...kkkk.....', '...kkkk.....'],
  ['....kkkk....', '....kkkk....'],
  ['.....kkkk...', '.....kkkk...'],
];

// ---------------- 武器 ----------------
const PAL_W = {
  k: '#2a2d3a', d: '#4a5064', m: '#7a8398', l: '#b4bccb', w: '#eef2f8',
  b: '#5e3d24', B: '#8d5e36', W: '#b8834f', g: '#c98d26', G: '#ffd257',
  c: '#2fc8ff', C: '#b8f6ff', r: '#b8283a', R: '#ff5a4a', o: '#4f5e26', O: '#7f9440',
  p: '#6a2fb0', P: '#b45cff', V: '#e8c4ff', y: '#ffe9a0',
};
const WSPR = {
  pistol: [
    '..dmmmmmml',
    '.dmlllllww',
    '.dmmmmmmmd',
    '.bBdkd....',
    '.bBb......',
    '.bb.......',
  ],
  smg: [
    '...dmmmmmmmm.',
    'kdmmlllllllww',
    'kdmmmmmmmmmd.',
    '.kk.dBd.kd...',
    '....dBd.kd...',
    '....bb..kd...',
    '........k....',
  ],
  shotgun: [
    '.......dmmmmmmmmmmm',
    'bBBWW.dmllllllllllw',
    'bBBBBBdmmmBWWBmmmd.',
    '.bbbBBmdkdBBBBd....',
    '...bbbkd..bbbb.....',
  ],
  laser: [
    '....llllllll......',
    '..lwwwwwwwwwwlll..',
    'kdmlcCCCCCCclmmwwc',
    'kdmlllllllllldddd.',
    '.kdd.dkd..........',
    '....dmd...........',
    '....dd............',
  ],
  rocket: [
    '...ooooooooooooooo...',
    '..oOOOOOOOOOOOOOOOoRr',
    'kdoOOOOOOOOOOOOOOOoRR',
    'kdoOOOOdmdOOOOOOOOorr',
    '..ooooodmdooooooooo..',
    '......dmd.kd.........',
    '......dmd.kd.........',
    '......dd.............',
  ],
  staff: [
    '...............G...G.',
    '..............GgPPPgG',
    'bbBBWWBBWWBBWWBGPVwVP',
    '.bbbbbbbbbbbbbbGPVVVP',
    '..............GgPPPgG',
    '...............G...G.',
  ],
  sword: [
    '....gG................',
    '....gG.llllllllllllll.',
    'bBWBgGlwwwwwwwwwwwwwwl',
    'bbBbGGmmmmmmmmmmmmmmmw',
    '....gGdddddddddddddd..',
    '....gG................',
  ],
  bow: [
    'bB.....',
    '.bB....',
    '..bB...',
    '...bB..',
    '...bB..',
    '....bB.',
    '....bB.',
    '....GG.',
    '....GG.',
    '....GG.',
    '....bB.',
    '....bB.',
    '...bB..',
    '...bB..',
    '..bB...',
    '.bB....',
    'bB.....',
  ],
  gatling: [
    '....dmmmmmmmmmmmmm..',
    '..ddlwwwwwwwwwwwwwl.',
    'kdmmmmmmmmmmmmmmmmmw',
    'kdGGmlllllllllllllw.',
    '.kdmmdddddddddddddd.',
    '..kdBd...dmd........',
    '....Bb...dmd........',
    '....bb..............',
  ],
  frost: [
    '...............C.C...',
    '..............CcwcC..',
    'ddmmllmmllmmllmCwCwCc',
    '.dddddddddddddmcCwCc.',
    '..............CcCcC..',
    '...............C.C...',
  ],
  wand: [
    '...........PP.',
    'bbBBWWBBWWBPVP',
    '...........PP.',
  ],
  knife: [
    '...g.......',
    'bBBgwwwwwwl',
    'bbBgmmmmml.',
    '...g.......',
  ],
  egun: [
    'kdmmmmmml',
    'kddddddd.',
    '.bB......',
    '.bb......',
  ],
  estaff: [
    '...........pP',
    'bbBBBBBBBBpPV',
    '...........pP',
  ],
};

// ---------------- 道具 / 场景物件 ----------------
const PAL_WOOD = { W: '#d69a5c', B: '#a86e3c', b: '#74482a', k: '#4a2c16', m: '#9aa0ae', h: '#f0c08a' };
const CRATE = [
  'mhhhhhhhhhhhhm',
  'hWWWWWWWWWWWWB',
  'hWWWWWWWWWWWWB',
  'mBBBBBBBBBBBBm',
  'bbbbbbbbbbbbbb',
  'bWBBBBBBBBBBBb',
  'bBBBBBBBBBBBkb',
  'bkkkkkkkkkkkkb',
  'bWBBBBBBBBBBBb',
  'bBBBBBBBBBBBkb',
  'bkkkkkkkkkkkkb',
  'bWBBBBBBBBBBBb',
  'bBBBBBBBBBBBkb',
  'mbbbbbbbbbbbbm',
];
const PAL_BARREL = { W: '#c88a50', B: '#9a6236', b: '#643c20', m: '#4a4f5e', l: '#8c93a4', Y: '#ffd257', k: '#2a2a2a', w: '#f4f0e0' };
const PAL_XBARREL = { W: '#ff6a5a', B: '#d23a3a', b: '#7a1a22', m: '#4a4f5e', l: '#8c93a4', Y: '#ffd257', k: '#2a2a2a', w: '#f4f0e0' };
const BARREL = [
  '..bBBBBBBb..',
  '.bWWWWWWWWb.',
  '.bWbbbbbbWb.',
  '.bBWWWWWWBb.',
  'mllllllllllm',
  'bBWBBBBBBBbb',
  'bBWBBBBBBBbb',
  'bBWBBBBBBBbb',
  'mllllllllllm',
  'bBWBBBBBBBbb',
  '.bBWBBBBBbb.',
  '..bbbbbbbb..',
];
const XBARREL = [
  '..bBBBBBBb..',
  '.bWWWWWWWWb.',
  '.bWbbkkbbWb.',
  '.bBWWWWWWBb.',
  'mllllllllllm',
  'bBWBwwwBBBbb',
  'bBYkYkYkYkbb',
  'bBWBwkwBBBbb',
  'mllllllllllm',
  'bBWBBBBBBBbb',
  '.bBWBBBBBbb.',
  '..bbbbbbbb..',
];
const PAL_POT = { W: '#e8a46a', B: '#b8693a', b: '#7a3e22', h: '#ffd0a0' };
const POT = [
  '...bbbb...',
  '..bhWWWb..',
  '...bBBb...',
  '..bBWWBb..',
  '.bBhWBBBb.',
  'bBhWBBBBBb',
  'bBWBBBBBBb',
  'bBBBBBBBbb',
  '.bBBBBBbb.',
  '..bbbbbb..',
];
const PAL_POTION = { k: '#8a5e36', g: '#d8ecff', R: '#ff4d5e', r: '#b8283a', w: '#ffffff' };
const POTION = [
  '..kkk..',
  '..kkk..',
  '..ggg..',
  '.gRRRg.',
  'gRwRRRg',
  'gRwRRRg',
  'gRRRRrg',
  '.grrrg.',
  '..ggg..',
];
const PAL_POTION_B = { k: '#8a5e36', g: '#d8ecff', R: '#4aa8ff', r: '#2a5ad0', w: '#ffffff' };

function chestRows(w, open) {
  const rep = (ch, n) => ch.repeat(Math.max(0, n));
  const m = w - 2;
  const half = (m - 2) / 2;
  const rows = [];
  if (!open) {
    rows.push('.g' + rep('b', w - 4) + 'g.');
    rows.push('gG' + rep('W', w - 4) + 'Gg');
    rows.push('gB' + rep('W', w - 4) + 'Bg');
    rows.push('g' + rep('B', m) + 'g');
  } else {
    rows.push('.g' + rep('b', w - 4) + 'g.');
    rows.push('gG' + rep('b', w - 4) + 'Gg');
    rows.push('g' + rep('k', m) + 'g');
    rows.push('gk' + rep('y', m - 2) + 'kg');
  }
  rows.push('g' + rep('G', half) + 'gk' + rep('G', half) + 'g');
  rows.push('g' + rep('B', half) + (open ? 'BB' : 'GG') + rep('B', half) + 'g');
  rows.push('g' + rep('B', half) + (open ? 'BB' : 'kk') + rep('B', half) + 'g');
  rows.push('g' + rep('B', m) + 'g');
  rows.push('g' + rep('b', m) + 'g');
  rows.push(rep('g', w));
  return rows;
}
const PAL_CHEST = { W: '#c88a50', B: '#9a6236', b: '#643c20', g: '#b07a20', G: '#ffd257', k: '#2a1a12', y: '#fff3b0' };
const PAL_CHEST_BLUE = { W: '#6aa4ff', B: '#3a6ad0', b: '#22408a', g: '#b07a20', G: '#ffd257', k: '#141a30', y: '#d8f0ff' };
const PAL_CHEST_GOLD = { W: '#ffe07a', B: '#e0a830', b: '#a06a18', g: '#7a4a10', G: '#fff2b0', k: '#2a1a08', y: '#ffffff' };

function initSprites() {
  const compose = (body, legs, pal, o) => legs.map(l => buildSprite([...body, ...l], pal, o));
  SPR.knight = compose(KNIGHT_BODY, KNIGHT_LEGS, PAL_KNIGHT);
  SPR.ranger = compose(RANGER_BODY, RANGER_LEGS, PAL_RANGER);
  SPR.wizard = compose(WIZARD_BODY, WIZARD_LEGS, PAL_WIZARD);
  SPR.goblin = compose(GOBLIN_BODY, GOBLIN_LEGS, PAL_GOBLIN);
  SPR.shaman = compose(SHAMAN_BODY, SHAMAN_LEGS, PAL_SHAMAN);
  SPR.boar = compose(BOAR_BODY, BOAR_LEGS, PAL_BOAR);
  SPR.slime = [buildSprite(SLIME, PAL_SLIME)];
  SPR.bat = [buildSprite(BAT_UP, PAL_BAT), buildSprite(BAT_DOWN, PAL_BAT)];
  // 精英怪: 红色描边 + 轻微红调
  const EL = { outlineColor: '#e8203c' };
  const elite = arr => arr.map(s => tintSprite(s, '#ff2040', 0.1));
  SPR.goblinElite = elite(compose(GOBLIN_BODY, GOBLIN_LEGS, PAL_GOBLIN, EL));
  SPR.shamanElite = elite(compose(SHAMAN_BODY, SHAMAN_LEGS, PAL_SHAMAN, EL));
  SPR.boarElite = elite(compose(BOAR_BODY, BOAR_LEGS, PAL_BOAR, EL));
  SPR.slimeElite = elite([buildSprite(SLIME, PAL_SLIME, EL)]);
  SPR.batElite = elite([buildSprite(BAT_UP, PAL_BAT, EL), buildSprite(BAT_DOWN, PAL_BAT, EL)]);
  const bossBody = mirrorRows(BOSS_HALF);
  SPR.boss = BOSS_LEGS.map(l => buildSprite([...bossBody, ...mirrorRows(l)], PAL_BOSS));
  SPR.bossRage = SPR.boss.map(s => tintSprite(s, '#ff2030', 0.3));


  SPR.w = {};
  for (const k in WSPR) SPR.w[k] = buildSprite(WSPR[k], PAL_W);

  SPR.crate = buildSprite(CRATE, PAL_WOOD);
  SPR.barrel = buildSprite(BARREL, PAL_BARREL);
  SPR.xbarrel = buildSprite(XBARREL, PAL_XBARREL);
  SPR.pot = buildSprite(POT, PAL_POT);
  SPR.potion = buildSprite(POTION, PAL_POTION);
  SPR.potionB = buildSprite(POTION, PAL_POTION_B);
  SPR.chest = buildSprite(chestRows(14, false), PAL_CHEST);
  SPR.chestOpen = buildSprite(chestRows(14, true), PAL_CHEST);
  SPR.wchest = buildSprite(chestRows(18, false), PAL_CHEST_BLUE);
  SPR.wchestOpen = buildSprite(chestRows(18, true), PAL_CHEST_BLUE);
  SPR.gchest = buildSprite(chestRows(20, false), PAL_CHEST_GOLD);
  SPR.gchestOpen = buildSprite(chestRows(20, true), PAL_CHEST_GOLD);

  SPR.glow = makeGlow();
  SPR.light = makeGlow(128, [[0, 0.9], [0.15, 0.75], [0.35, 0.45], [0.55, 0.22], [0.75, 0.08], [1, 0]]);
}

// 柔光贴图 (白色, 叠加时着色)
function makeGlow(size = 64, stops = [[0, 1], [0.25, 0.7], [0.6, 0.18], [1, 0]]) {
  const [c, g] = makeCanvas(size, size);
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

// 着色光晕缓存
const _glowCache = new Map();
function glowTex(color, kind = 'glow') {
  const key = color + kind;
  let c = _glowCache.get(key);
  if (c) return c;
  const src = kind === 'light' ? SPR.light : SPR.glow;
  const [cc, g] = makeCanvas(src.width, src.height);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, cc.width, cc.height);
  _glowCache.set(key, cc);
  return cc;
}
