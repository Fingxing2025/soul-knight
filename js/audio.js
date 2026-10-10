'use strict';
// ============ 合成音效 + 芯片音乐 (WebAudio, 无外部资源) ============
const Sfx = (() => {
  let ac = null, master, sfxBus, musicBus, noiseBuf, comp;
  let muted = false, musicOn = true;
  const last = {};

  function init() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    ac = new (window.AudioContext || window.webkitAudioContext)();
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master = ac.createGain();
    master.gain.value = 0.55;
    master.connect(comp);
    comp.connect(ac.destination);
    sfxBus = ac.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);
    musicBus = ac.createGain();
    musicBus.gain.value = 0.32;
    musicBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function env(gain, t, a, dur, vol) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function tone({ f = 440, f2 = null, dur = 0.1, type = 'square', vol = 0.15, a = 0.003, delay = 0, dest = sfxBus, detune = 0 }) {
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (detune) o.detune.value = detune;
    if (f2 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    env(g, t, a, dur, vol);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise({ dur = 0.1, vol = 0.2, f = 2000, f2 = null, q = 0.8, type = 'lowpass', a = 0.002, delay = 0, dest = sfxBus }) {
    const t = ac.currentTime + delay;
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    const fl = ac.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(f, t);
    if (f2 !== null) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur);
    fl.Q.value = q;
    const g = ac.createGain();
    env(g, t, a, dur, vol);
    s.connect(fl);
    fl.connect(g);
    g.connect(dest);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  const lib = {
    pistol() {
      tone({ f: 900, f2: 180, dur: 0.08, type: 'square', vol: 0.09 });
      noise({ dur: 0.06, vol: 0.18, f: 3500, f2: 800 });
    },
    smg() {
      tone({ f: 1200, f2: 300, dur: 0.05, type: 'square', vol: 0.06 });
      noise({ dur: 0.045, vol: 0.14, f: 4500, f2: 1200 });
    },
    shotgun() {
      noise({ dur: 0.28, vol: 0.4, f: 2200, f2: 200 });
      tone({ f: 160, f2: 40, dur: 0.22, type: 'sine', vol: 0.35 });
      noise({ dur: 0.08, vol: 0.12, f: 1800, type: 'bandpass', delay: 0.22 });
      noise({ dur: 0.06, vol: 0.1, f: 2400, type: 'bandpass', delay: 0.32 });
    },
    rocket() {
      noise({ dur: 0.45, vol: 0.25, f: 400, f2: 2400, type: 'bandpass', q: 1.2 });
      tone({ f: 120, f2: 60, dur: 0.2, type: 'sawtooth', vol: 0.1 });
    },
    explosion() {
      noise({ dur: 0.9, vol: 0.6, f: 1400, f2: 60 });
      tone({ f: 90, f2: 28, dur: 0.6, type: 'sine', vol: 0.5 });
      noise({ dur: 0.3, vol: 0.2, f: 5000, f2: 900, type: 'highpass' });
    },
    laserStart() {
      tone({ f: 300, f2: 1400, dur: 0.18, type: 'sawtooth', vol: 0.07 });
    },
    lightning() {
      noise({ dur: 0.25, vol: 0.35, f: 3000, type: 'highpass' });
      for (let i = 0; i < 4; i++) tone({ f: rand(600, 1800), f2: rand(80, 300), dur: 0.05, type: 'square', vol: 0.06, delay: i * 0.035 });
    },
    sword() {
      noise({ dur: 0.16, vol: 0.28, f: 600, f2: 4000, type: 'bandpass', q: 2 });
    },
    roll() {
      noise({ dur: 0.22, vol: 0.22, f: 300, f2: 1800, type: 'bandpass', q: 1.5 });
      tone({ f: 300, f2: 600, dur: 0.12, type: 'triangle', vol: 0.06 });
    },
    bowDraw() {
      tone({ f: 200, f2: 320, dur: 0.35, type: 'triangle', vol: 0.05 });
    },
    bow() {
      tone({ f: 420, f2: 160, dur: 0.14, type: 'triangle', vol: 0.18 });
      noise({ dur: 0.1, vol: 0.12, f: 2500, f2: 600, type: 'bandpass' });
    },
    staffOrb() {
      tone({ f: 520, f2: 1040, dur: 0.12, type: 'sine', vol: 0.12 });
      tone({ f: 780, f2: 1560, dur: 0.12, type: 'triangle', vol: 0.06 });
    },
    deflect() {
      tone({ f: 2400, f2: 1800, dur: 0.06, type: 'square', vol: 0.05 });
    },
    hit() {
      tone({ f: 320, f2: 120, dur: 0.06, type: 'square', vol: 0.08 });
      noise({ dur: 0.04, vol: 0.1, f: 1800 });
    },
    crit() {
      tone({ f: 1200, f2: 600, dur: 0.08, type: 'square', vol: 0.08 });
      noise({ dur: 0.06, vol: 0.14, f: 3000 });
    },
    wallHit() {
      noise({ dur: 0.04, vol: 0.06, f: 2600 });
    },
    enemyShoot() {
      tone({ f: 500, f2: 260, dur: 0.09, type: 'sine', vol: 0.09 });
    },
    enemyCast() {
      tone({ f: 300, f2: 900, dur: 0.25, type: 'triangle', vol: 0.09 });
      tone({ f: 450, f2: 1350, dur: 0.25, type: 'sine', vol: 0.05 });
    },
    enemyDie() {
      noise({ dur: 0.18, vol: 0.2, f: 1600, f2: 200 });
      tone({ f: 260, f2: 60, dur: 0.18, type: 'square', vol: 0.06 });
    },
    boarCharge() {
      tone({ f: 140, f2: 90, dur: 0.3, type: 'sawtooth', vol: 0.1 });
      noise({ dur: 0.3, vol: 0.08, f: 600 });
    },
    slimeHop() {
      tone({ f: 200, f2: 520, dur: 0.1, type: 'sine', vol: 0.08 });
    },
    slimeLand() {
      tone({ f: 260, f2: 90, dur: 0.12, type: 'sine', vol: 0.12 });
    },
    hurt() {
      tone({ f: 440, f2: 110, dur: 0.22, type: 'sawtooth', vol: 0.16 });
      noise({ dur: 0.12, vol: 0.2, f: 1400 });
    },
    armorBreak() {
      noise({ dur: 0.25, vol: 0.2, f: 6000, f2: 2000, type: 'highpass' });
      tone({ f: 1800, f2: 400, dur: 0.18, type: 'triangle', vol: 0.1 });
    },
    coin() {
      tone({ f: 988, dur: 0.06, type: 'square', vol: 0.05 });
      tone({ f: 1319, dur: 0.14, type: 'square', vol: 0.05, delay: 0.055 });
    },
    energy() {
      tone({ f: 600, f2: 1600, dur: 0.1, type: 'sine', vol: 0.07 });
    },
    potion() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ f, dur: 0.12, type: 'triangle', vol: 0.12, delay: i * 0.06 }));
    },
    pickup() {
      [392, 523, 784].forEach((f, i) => tone({ f, dur: 0.1, type: 'square', vol: 0.06, delay: i * 0.05 }));
    },
    swap() {
      tone({ f: 700, f2: 900, dur: 0.05, type: 'square', vol: 0.05 });
      noise({ dur: 0.05, vol: 0.08, f: 3000, type: 'bandpass', delay: 0.04 });
    },
    noEnergy() {
      tone({ f: 200, dur: 0.08, type: 'square', vol: 0.06 });
      tone({ f: 150, dur: 0.1, type: 'square', vol: 0.06, delay: 0.09 });
    },
    door() {
      noise({ dur: 0.35, vol: 0.2, f: 300, f2: 120 });
      tone({ f: 70, f2: 50, dur: 0.35, type: 'square', vol: 0.06 });
    },
    chest() {
      noise({ dur: 0.15, vol: 0.12, f: 900 });
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f, dur: 0.18, type: 'square', vol: 0.05, delay: 0.1 + i * 0.07 }));
    },
    spawn() {
      tone({ f: 200, f2: 800, dur: 0.3, type: 'sine', vol: 0.05 });
    },
    poof() {
      noise({ dur: 0.2, vol: 0.14, f: 900, f2: 300 });
    },
    skill() {
      [262, 330, 392, 523, 659, 784].forEach((f, i) => tone({ f, dur: 0.12, type: 'square', vol: 0.06, delay: i * 0.04 }));
      noise({ dur: 0.4, vol: 0.1, f: 500, f2: 4000, type: 'bandpass' });
    },
    portal() {
      tone({ f: 200, f2: 1200, dur: 0.8, type: 'sine', vol: 0.15 });
      noise({ dur: 0.8, vol: 0.15, f: 300, f2: 3000, type: 'bandpass', q: 2 });
    },
    roar() {
      tone({ f: 110, f2: 70, dur: 0.9, type: 'sawtooth', vol: 0.22 });
      tone({ f: 116, f2: 72, dur: 0.9, type: 'sawtooth', vol: 0.18 });
      noise({ dur: 0.9, vol: 0.2, f: 500, f2: 200 });
    },
    slam() {
      noise({ dur: 0.5, vol: 0.45, f: 800, f2: 60 });
      tone({ f: 70, f2: 30, dur: 0.5, type: 'sine', vol: 0.5 });
    },
    bossCharge() {
      tone({ f: 200, f2: 600, dur: 0.5, type: 'sawtooth', vol: 0.08 });
    },
    victory() {
      [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone({ f, dur: 0.22, type: 'square', vol: 0.07, delay: i * 0.12 }));
    },
    gameover() {
      [392, 370, 349, 330, 311, 294].forEach((f, i) => tone({ f, dur: 0.3, type: 'triangle', vol: 0.12, delay: i * 0.18 }));
    },
    uiMove() {
      tone({ f: 660, dur: 0.04, type: 'square', vol: 0.04 });
    },
    uiOk() {
      tone({ f: 660, dur: 0.05, type: 'square', vol: 0.06 });
      tone({ f: 990, dur: 0.1, type: 'square', vol: 0.06, delay: 0.05 });
    },
  };

  function play(name, minGap = 0.03) {
    if (!ac || muted) return;
    const now = ac.currentTime;
    if (last[name] && now - last[name] < minGap) return;
    last[name] = now;
    try { lib[name](); } catch (e) { /* ignore */ }
  }

  // ---- 激光持续音 ----
  let laser = null;
  function laserOn() {
    if (!ac || muted || laser) return;
    const o1 = ac.createOscillator(), o2 = ac.createOscillator(), lfo = ac.createOscillator();
    const lg = ac.createGain(), g = ac.createGain(), fl = ac.createBiquadFilter();
    o1.type = 'sawtooth'; o1.frequency.value = 220;
    o2.type = 'square'; o2.frequency.value = 331;
    lfo.frequency.value = 18; lg.gain.value = 30;
    lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
    fl.type = 'lowpass'; fl.frequency.value = 2200;
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.06, ac.currentTime + 0.05);
    o1.connect(fl); o2.connect(fl); fl.connect(g); g.connect(sfxBus);
    o1.start(); o2.start(); lfo.start();
    laser = { o1, o2, lfo, g };
  }
  function laserOff() {
    if (!laser) return;
    const { o1, o2, lfo, g } = laser;
    const t = ac.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    [o1, o2, lfo].forEach(o => o.stop(t + 0.1));
    laser = null;
  }

  // ---- 芯片音乐 ----
  const N = n => 440 * Math.pow(2, (n - 69) / 12);
  const SONGS = {
    // 和弦根音 (MIDI) + 琶音模式
    forest: { bpm: 112, roots: [57, 53, 48, 55], minor: [1, 0, 0, 0], lead: [69, 72, 76, 74, 72, 69, 67, 69, 65, 69, 72, 69, 67, 64, 67, 71] },
    ice: { bpm: 100, roots: [52, 48, 55, 50], minor: [1, 0, 0, 1], lead: [64, 67, 71, 74, 72, 71, 67, 64, 60, 64, 67, 72, 71, 67, 62, 66] },
    lava: { bpm: 138, roots: [52, 52, 48, 50], minor: [1, 1, 0, 0], lead: [76, 74, 71, 74, 76, 79, 76, 74, 72, 71, 67, 71, 74, 72, 71, 67] },
    boss: { bpm: 150, roots: [45, 45, 41, 43], minor: [1, 1, 0, 0], lead: [69, 72, 69, 76, 74, 72, 74, 69, 65, 69, 72, 77, 76, 74, 72, 71] },
    title: { bpm: 96, roots: [57, 53, 48, 52], minor: [1, 0, 0, 1], lead: [76, 74, 72, 71, 72, 69, 72, 76, 77, 76, 74, 72, 71, 67, 71, 74] },
  };
  let song = null, step = 0, nextT = 0, timer = null;

  function playMusic(name) {
    if (!ac) return;
    if (song === SONGS[name]) return;
    song = SONGS[name] || null;
    step = 0;
    nextT = ac.currentTime + 0.1;
    if (!timer) timer = setInterval(schedule, 25);
  }
  function stopMusic() { song = null; }

  function schedule() {
    if (!song || !ac) return;
    const spb = 60 / song.bpm / 4; // 16分音符
    while (nextT < ac.currentTime + 0.12) {
      if (musicOn && !muted) playStep(step, nextT - ac.currentTime);
      step++;
      nextT += spb;
    }
  }
  function playStep(s, delay) {
    const bar = Math.floor(s / 16) % 4;
    const i = s % 16;
    const root = song.roots[bar];
    const third = song.minor[bar] ? 3 : 4;
    const chord = [root, root + third, root + 7, root + 12];
    // 低音
    if (i % 4 === 0) tone({ f: N(root - 12), dur: 0.22, type: 'triangle', vol: 0.32, delay, dest: musicBus });
    if (i % 4 === 2 && song.bpm > 130) tone({ f: N(root - 12), dur: 0.1, type: 'triangle', vol: 0.22, delay, dest: musicBus });
    // 琶音
    if (i % 2 === 0) tone({ f: N(chord[(i / 2) % 4] + 12), dur: 0.09, type: 'square', vol: 0.035, delay, dest: musicBus });
    // 旋律 (每两小节)
    if (i % 2 === 0 && (Math.floor(s / 16) % 8) >= 4) {
      const n = song.lead[(i / 2 + bar * 8) % 16];
      tone({ f: N(n), dur: 0.16, type: 'square', vol: 0.045, delay, dest: musicBus, detune: 6 });
    }
    // 鼓
    if (i % 8 === 0) tone({ f: 150, f2: 40, dur: 0.12, type: 'sine', vol: 0.35, delay, dest: musicBus });
    if (i % 8 === 4) noise({ dur: 0.1, vol: 0.12, f: 1800, type: 'bandpass', delay, dest: musicBus });
    if (i % 2 === 1) noise({ dur: 0.03, vol: 0.05, f: 7000, type: 'highpass', delay, dest: musicBus });
  }

  return {
    init, play, laserOn, laserOff, playMusic, stopMusic,
    toggleMute() { muted = !muted; if (muted) laserOff(); return muted; },
    get muted() { return muted; },
  };
})();
