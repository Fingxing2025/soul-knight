// 测试辅助 (仅开发时注入)
window.stepN = (n, fn) => { for (let i = 0; i < n; i++) { if (fn) fn(i); const fr = Game.update(1 / 60); if (!fr) Input.endFrame(); } Game.render(); };
window.useW = id => { const p = Game.player; p.weapons = [new Weapon(id)]; p.cur = 0; p.energy = 200; };
window.snap = async (name = 'shot.png', crop = null, scale = 1) => {
  const c = Game.canvas; let src = c;
  if (crop || scale !== 1) {
    const [x, y, w, h] = crop || [0, 0, c.width, c.height];
    const o = document.createElement('canvas'); o.width = w * scale; o.height = h * scale;
    const g = o.getContext('2d'); g.imageSmoothingEnabled = scale < 1; g.drawImage(c, x, y, w, h, 0, 0, w * scale, h * scale); src = o;
  }
  const r = await fetch('http://127.0.0.1:8766/' + name, { method: 'POST', body: src.toDataURL('image/png') });
  return r.status;
};
window.startGame = (lvl = 1, test = false, cls = 'knight') => {
  Game.newRun(test, cls); Game.fadeTarget = 0; Game.fade = 0; Game.fadeCb = null;
  if (lvl > 1) Game.loadLevel(lvl);
  Game.godMode = true;
};
window.goRoom = type => { const r = Game.level.rooms.find(r => r.type === type); Game.player.x = r.cx; Game.player.y = r.cy + 20; Game.cam.cx = r.cx; Game.cam.cy = r.cy; return r; };
'dev loaded';
