// 효과음: Web Audio API로 소리를 직접 합성한다. 다른 파일은 GameSound.play('이름')으로 쓴다.
(function () {
  const STORE_KEY = 'dudeoji-sound-on';
  let ctx = null;
  let enabled = true;
  try { enabled = localStorage.getItem(STORE_KEY) !== 'off'; } catch (e) { /* 저장소를 못 쓰면 켜진 채로 둔다 */ }

  // 브라우저는 사용자가 누른 뒤에만 소리를 허용하므로, 입력이 있을 때마다 깨운다.
  function unlock() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      try { ctx = new AudioCtx(); } catch (e) { return; }
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, ms, opts) {
    const o = Object.assign({ type: 'square', gain: 0.06, to: freq, delay: 0 }, opts);
    const start = ctx.currentTime + o.delay;
    const end = start + ms / 1000;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(o.to, end);
    amp.gain.setValueAtTime(o.gain, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(amp).connect(ctx.destination);
    osc.start(start);
    osc.stop(end);
  }

  function melody(notes, ms, gap, opts) {
    notes.forEach((freq, i) => tone(freq, ms, Object.assign({}, opts, { delay: i * gap })));
  }

  const SOUNDS = {
    start() { melody([523, 784], 90, 0.08); },
    hitNormal() { tone(260, 90, { to: 110, gain: 0.09 }); },
    hitSilver() { melody([880, 1175], 90, 0.06, { type: 'triangle', gain: 0.1 }); },
    hitGold() { melody([784, 988, 1319, 1568], 100, 0.055); },
    fake() {
      tone(110, 320, { to: 38, type: 'sine', gain: 0.35 });
      tone(70, 220, { to: 35, type: 'triangle', gain: 0.2 });
    },
    miss() { tone(130, 50, { to: 90, type: 'triangle', gain: 0.05 }); },
    bonus() { tone(1319, 80, { type: 'triangle', gain: 0.07, delay: 0.1 }); },
    fanfare() { melody([523, 659, 784, 1047, 784, 1047, 1319], 150, 0.12, { gain: 0.07 }); },
    fail() { melody([523, 440, 349], 220, 0.17, { gain: 0.06 }); },
    blockMove() { tone(420, 30, { gain: 0.025 }); },
    blockRotate() { tone(620, 50, { to: 760, gain: 0.04 }); },
    blockLock() { tone(170, 70, { to: 100, type: 'triangle', gain: 0.1 }); },
    blockDrop() { tone(320, 90, { to: 90, gain: 0.07 }); },
    blockLine() { melody([523, 659, 784, 1047], 80, 0.05); },
    blockLevel() { melody([659, 880, 1175], 120, 0.09, { gain: 0.07 }); },
    skillFireball() { tone(220, 260, { to: 520, type: 'sawtooth', gain: 0.06 }); tone(900, 180, { to: 300, gain: 0.03 }); },
    runJump() { tone(360, 110, { to: 720, type: 'triangle', gain: 0.07 }); },
    runPoint() { melody([880, 1175], 70, 0.06, { gain: 0.05 }); },
    runHit() { melody([300, 220, 150], 140, 0.11, { gain: 0.08 }); },
    blockOver() { melody([440, 370, 311, 220], 230, 0.18, { gain: 0.06 }); },
    arrowHit() {
      tone(900, 110, { to: 180, type: 'sawtooth', gain: 0.08 });
      tone(90, 200, { to: 45, type: 'sine', gain: 0.25 });
    },
    swordSwing() { tone(1500, 110, { to: 300, type: 'sawtooth', gain: 0.05 }); },
    fistSwing() { tone(300, 70, { to: 150, type: 'triangle', gain: 0.07 }); },
    bowShoot() { tone(500, 130, { to: 1300, type: 'triangle', gain: 0.09 }); },
    shieldBlock() {
      tone(1760, 140, { to: 1200, type: 'triangle', gain: 0.12 });
      tone(2640, 90, { to: 2000, type: 'square', gain: 0.03 });
    },
    bossHit() { tone(180, 110, { to: 70, gain: 0.11 }); },
    bossAppear() { melody([110, 98, 82, 65], 260, 0.2, { type: 'sawtooth', gain: 0.09 }); },
    bossRage() {
      tone(90, 700, { to: 220, type: 'sawtooth', gain: 0.13 });
      tone(120, 700, { to: 300, type: 'square', gain: 0.05 });
    },
    summon() { melody([196, 247, 311, 392], 110, 0.09, { type: 'sawtooth', gain: 0.07 }); },
    bombFall() { tone(1400, 900, { to: 220, type: 'sine', gain: 0.07 }); },
    bossHeal() { melody([784, 1175], 120, 0.06, { type: 'sine', gain: 0.1 }); },
    laser() { tone(1700, 70, { to: 500, type: 'square', gain: 0.025 }); },
    meteorHit() { tone(520, 50, { to: 300, type: 'triangle', gain: 0.05 }); },
    meteorBlast() {
      tone(240, 180, { to: 50, type: 'sawtooth', gain: 0.09 });
      tone(120, 220, { to: 40, type: 'square', gain: 0.04 });
    },
    earthHit() {
      tone(80, 480, { to: 28, type: 'sine', gain: 0.38 });
      tone(160, 240, { to: 50, type: 'sawtooth', gain: 0.08 });
    },
    shipLaunch() {
      tone(90, 900, { to: 900, type: 'sawtooth', gain: 0.07 });
      tone(180, 900, { to: 1400, type: 'triangle', gain: 0.05 });
    },
    allyJoin() { melody([659, 784, 988, 1319, 1568], 130, 0.09, { type: 'triangle', gain: 0.12 }); },
    partyAttack() { tone(420, 90, { to: 180, type: 'square', gain: 0.07 }); },
    skillHeal() { melody([659, 880, 1109, 1319], 130, 0.08, { type: 'sine', gain: 0.11 }); },
    skillGuard() { tone(330, 320, { to: 660, type: 'triangle', gain: 0.12 }); },
    skillTriple() { tone(900, 90, { to: 1500, type: 'triangle', gain: 0.09 }); },
    skillSlash() {
      tone(2000, 220, { to: 180, type: 'sawtooth', gain: 0.09 });
      tone(90, 240, { to: 45, type: 'sine', gain: 0.2 });
    },
    skillLaser() {
      tone(2400, 520, { to: 300, type: 'sawtooth', gain: 0.08 });
      tone(1200, 520, { to: 150, type: 'square', gain: 0.04 });
    },
    bossBody() { tone(110, 260, { to: 40, type: 'sine', gain: 0.32 }); },
    bossBeam() { tone(300, 650, { to: 1800, type: 'sawtooth', gain: 0.08 }); },
    bossMeteors() { melody([240, 200, 170, 140], 170, 0.11, { type: 'sawtooth', gain: 0.09 }); },
    bossStar() { tone(1500, 120, { to: 350, type: 'triangle', gain: 0.1 }); },
    bossBlackhole() { tone(600, 800, { to: 45, type: 'sawtooth', gain: 0.1 }); },
    bossRecover() { melody([392, 523, 659], 190, 0.14, { type: 'sine', gain: 0.12 }); },
    starShot() { tone(1250, 70, { to: 1900, type: 'triangle', gain: 0.045 }); },
    hammerThrow() {
      tone(500, 240, { to: 1100, type: 'square', gain: 0.07 });
      tone(1100, 180, { to: 500, type: 'triangle', gain: 0.07, delay: 0.1 });
    },
    hammerHit() { melody([1400, 700], 90, 0.05, { type: 'square', gain: 0.1 }); },
    bossBlock() { tone(1900, 70, { to: 1500, type: 'triangle', gain: 0.05 }); },
    bossBarrier() { melody([988, 740, 988], 130, 0.1, { type: 'triangle', gain: 0.09 }); },
    finalEnding() { melody([392, 523, 659, 784, 1047, 784, 1047, 1319, 1568, 2093], 200, 0.15, { gain: 0.07 }); },
    bossEnding() { melody([523, 659, 784, 1047, 1319, 1047, 1319, 1568, 2093], 170, 0.13, { gain: 0.07 }); },
  };

  window.GameSound = {
    unlock,
    play(name) {
      if (!enabled) return;
      unlock();
      if (ctx && SOUNDS[name]) SOUNDS[name]();
    },
    isEnabled() { return enabled; },
    setEnabled(on) {
      enabled = on;
      try { localStorage.setItem(STORE_KEY, on ? 'on' : 'off'); } catch (e) { /* 이번 실행에서만 적용된다 */ }
    },
  };
})();
