// 두더지 잡기 게임(1단계): 1분 안에 목표 점수를 채우면 main.js가 넘겨준 onSuccess로 다음 단계에 넘어간다.
(function () {
  const MOLE_GOAL = 100; // 목표 점수. 이 숫자만 바꾸면 점수판과 카드 문구도 함께 바뀐다.
  const ROUND_MS = 60000;
  const AUTO_NEXT_MS = 3500;
  const STORE_KEY = 'dudeoji-mole-best';
  const STAR_PATHS = [['-90%', '-70%'], ['90%', '-80%'], ['0%', '-130%']];
  // life는 일반 두더지 대비 올라와 있는 시간 비율이다.
  const TYPES = {
    normal: { points: 1, weight: 50, life: 1, sound: 'hitNormal' },
    silver: { points: 10, weight: 25, life: 0.75, sound: 'hitSilver' },
    gold: { points: 20, weight: 9, life: 0.5, sound: 'hitGold' },
    fake: { points: -5, weight: 16, life: 1.1, sound: 'fake' },
  };
  const KEY_TO_HOLE = {};
  [7, 8, 9, 4, 5, 6, 1, 2, 3].forEach((n, i) => {
    KEY_TO_HOLE['Numpad' + n] = i;
    KEY_TO_HOLE['Digit' + n] = i; // 숫자패드가 없는 노트북용
  });

  const $ = id => document.getElementById(id);
  const screen = $('moleScreen');
  const holes = [];
  let onSuccess = () => {};
  let playing = false;
  let frameId = 0, autoNextTimer = 0, lastFrame = 0;
  let clock = 0, nextSpawn = 0, lastHole = -1;
  let score = 0, combo = 0, hits = 0, swings = 0, best = 0;

  /* 그림 */
  function moleArt(type) {
    const line = 'stroke="#2b1a10" stroke-width="2.5"';
    const fur = { normal: '#8a5a35', silver: '#aeb9c4', gold: '#eeb51c', fake: '#8a5a35' }[type];
    const belly = { normal: '#d9b48a', silver: '#eef2f5', gold: '#fff0a8', fake: '#d9b48a' }[type];
    const nose = type === 'fake' ? '#2f7fe0' : '#e8788a';
    const teeth = type === 'fake'
      ? `<path d="M38 66h24l-4 13-4-9-4 9-4-9-4 9Z" fill="#fff" ${line} stroke-linejoin="round"/>`
      : `<path d="M44 66h12v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2Z" fill="#fff" ${line}/><path d="M50 66v10" stroke="#2b1a10" stroke-width="2"/>`;
    const brows = type === 'fake'
      ? '<path d="M25 30l20 9M75 30l-20 9" stroke="#1c120c" stroke-width="5" stroke-linecap="round"/>'
      : '';
    const sparkle = type === 'silver' || type === 'gold'
      ? `<g class="sparkle" fill="#fff"><path d="M16 18l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" ${line}/><path d="M84 12l2.400 5.600 5.600 2.400-5.600 2.400-2.400 5.600-2.400-5.600-5.600-2.400 5.600-2.400Z" ${line}/></g>`
      : '';
    return `<svg viewBox="0 0 100 110" aria-hidden="true">
      <path d="M10 112V50a40 40 0 0 1 80 0v62Z" fill="${fur}" ${line}/>
      <ellipse cx="50" cy="94" rx="26" ry="28" fill="${belly}"/>
      <ellipse cx="50" cy="60" rx="20" ry="14" fill="${belly}"/>
      <g class="eyes"><circle cx="36" cy="44" r="6" fill="#1c120c"/><circle cx="64" cy="44" r="6" fill="#1c120c"/>
      <circle cx="38" cy="42" r="2" fill="#fff"/><circle cx="66" cy="42" r="2" fill="#fff"/></g>
      <path class="ko" d="M30 38l12 12M42 38 30 50M58 38l12 12M70 38 58 50" stroke="#1c120c" stroke-width="4" stroke-linecap="round" fill="none"/>
      ${brows}
      <ellipse cx="50" cy="55" rx="7" ry="5" fill="${nose}" ${line}/>
      ${teeth}
      <ellipse cx="20" cy="88" rx="10" ry="7" fill="${belly}" ${line}/>
      <ellipse cx="80" cy="88" rx="10" ry="7" fill="${belly}" ${line}/>
      ${sparkle}
    </svg>`;
  }

  function buildHoles() {
    const parent = $('moleHoles');
    [7, 8, 9, 4, 5, 6, 1, 2, 3].forEach((n, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'hole';
      el.setAttribute('aria-label', `${n}번 구멍`);
      el.innerHTML = `<span class="pit"></span><span class="clip"><span class="critter"></span></span><span class="key-hint">${n}</span>`;
      parent.append(el);
      holes.push({ el, critter: el.querySelector('.critter'), type: null, phase: null, until: 0 });
      el.addEventListener('pointerdown', e => {
        e.preventDefault();
        whack(i);
      });
      el.addEventListener('click', e => { // 키보드로 포커스해 Enter를 누른 경우
        if (e.detail === 0) whack(i);
      });
    });
  }

  /* 화면 갱신 */
  function showCard(id) {
    ['moleStartCard', 'moleSuccessCard', 'moleFailCard'].forEach(card => { $(card).hidden = card !== id; });
    if (id) $(id).querySelector('button').focus({ preventScroll: true });
  }
  function renderStats() {
    $('moleScore').textContent = score;
    $('moleCombo').textContent = combo;
    $('moleBest').textContent = best;
  }
  function renderTime() {
    const left = Math.max(0, ROUND_MS - clock);
    $('moleTime').textContent = Math.ceil(left / 1000);
    const bar = $('moleTimeBar');
    bar.style.transform = `scaleX(${left / ROUND_MS})`;
    bar.classList.toggle('low', left <= 10000);
  }
  function popFloat(hole, text, cls) {
    const span = document.createElement('span');
    span.className = `float ${cls}`;
    span.textContent = text;
    hole.el.append(span);
    setTimeout(() => span.remove(), 780);
  }
  function popStars(hole) {
    STAR_PATHS.forEach(([dx, dy]) => {
      const star = document.createElement('span');
      star.className = 'star';
      star.style.setProperty('--dx', dx);
      star.style.setProperty('--dy', dy);
      hole.el.append(star);
      setTimeout(() => star.remove(), 440);
    });
  }

  /* 두더지 등장 */
  function pace() { // 시간이 갈수록 더 자주, 더 짧게, 동시에 최대 3마리까지
    const t = Math.min(clock / ROUND_MS, 1);
    return {
      up: 1350 - 650 * t,
      gap: 900 - 520 * t,
      max: t < 0.25 ? 1 : t < 0.6 ? 2 : 3,
    };
  }
  function pickType() {
    const names = Object.keys(TYPES);
    let roll = Math.random() * names.reduce((sum, name) => sum + TYPES[name].weight, 0);
    for (const name of names) {
      roll -= TYPES[name].weight;
      if (roll <= 0) return name;
    }
    return 'normal';
  }
  function spawn() {
    const { up, max } = pace();
    if (holes.filter(h => h.phase === 'up').length >= max) return false;
    const free = holes.map((h, i) => (h.type ? -1 : i)).filter(i => i >= 0 && i !== lastHole);
    if (!free.length) return false;
    const i = free[Math.floor(Math.random() * free.length)];
    const hole = holes[i];
    const type = pickType();
    lastHole = i;
    hole.type = type;
    hole.phase = 'up';
    hole.until = clock + up * TYPES[type].life;
    hole.critter.innerHTML = moleArt(type);
    hole.el.dataset.type = type;
    hole.el.classList.remove('hit');
    void hole.critter.offsetWidth;
    hole.el.classList.add('up');
    return true;
  }
  function retract(hole) {
    hole.phase = 'down';
    hole.until = clock + 180;
    hole.el.classList.remove('up', 'hit');
  }
  function clearHoles() {
    holes.forEach(hole => {
      hole.type = null;
      hole.phase = null;
      hole.el.classList.remove('up', 'hit');
      delete hole.el.dataset.type;
    });
  }

  /* 때리기 */
  function whack(i) {
    if (!playing) return;
    const hole = holes[i];
    if (hole.phase !== 'up') {
      if (hole.type) return; // 방금 맞힌 두더지를 또 친 경우는 세지 않는다
      swings++;
      GameSound.play('miss');
      return;
    }
    const info = TYPES[hole.type];
    swings++;
    hole.phase = 'hit';
    hole.until = clock + 240;
    hole.el.classList.add('hit');
    popStars(hole);
    GameSound.play(info.sound);

    if (hole.type === 'fake') {
      score = Math.max(0, score + info.points);
      combo = 0;
      popFloat(hole, `−${-info.points}`, 'bad');
      screen.classList.remove('shake');
      void screen.offsetWidth;
      screen.classList.add('shake');
      renderStats();
      return;
    }

    hits++;
    combo++;
    score += info.points;
    popFloat(hole, `+${info.points}`, hole.type);
    if (combo % 5 === 0) {
      score += 1;
      popFloat(hole, '콤보 보너스 +1', 'bonus');
      GameSound.play('bonus');
    }
    renderStats();
    if (score >= MOLE_GOAL) succeed();
  }

  /* 진행 */
  function frame(now) {
    const dt = Math.min(now - lastFrame, 100); // 탭을 벗어나면 시간도 멈춘다
    lastFrame = now;
    clock += dt;
    renderTime();
    if (clock >= ROUND_MS) { fail(); return; }

    holes.forEach(hole => {
      if (!hole.type || clock < hole.until) return;
      if (hole.phase === 'up') {
        if (hole.type !== 'fake' && combo) {
          combo = 0;
          renderStats();
        }
        retract(hole);
      } else if (hole.phase === 'hit') {
        retract(hole);
      } else {
        hole.type = null;
        hole.phase = null;
      }
    });

    if (clock >= nextSpawn && spawn()) {
      nextSpawn = clock + pace().gap * (0.75 + Math.random() * 0.5);
    }
    frameId = requestAnimationFrame(frame);
  }
  function halt() {
    playing = false;
    cancelAnimationFrame(frameId);
    clearTimeout(autoNextTimer);
    holes.forEach(hole => {
      if (hole.type) {
        hole.type = null;
        hole.phase = null;
      }
      hole.el.classList.remove('up', 'hit');
      delete hole.el.dataset.type;
    });
  }
  function saveBest() {
    if (score <= best) return;
    best = score;
    try { localStorage.setItem(STORE_KEY, String(best)); } catch (e) { /* 이번 실행에서만 유지된다 */ }
  }
  function start() {
    halt();
    score = combo = hits = swings = 0;
    clock = 0;
    nextSpawn = 300;
    lastHole = -1;
    clearHoles();
    renderStats();
    renderTime();
    showCard(null);
    playing = true;
    GameSound.play('start');
    lastFrame = performance.now();
    frameId = requestAnimationFrame(frame);
  }
  function succeed() {
    halt();
    saveBest();
    renderStats();
    $('moleSuccessTime').textContent = `${(clock / 1000).toFixed(1)}초`;
    showCard('moleSuccessCard');
    GameSound.play('fanfare');
    gainAlly('normal');
    autoNextTimer = setTimeout(goToBonus, AUTO_NEXT_MS);
  }
  function fail() {
    halt();
    saveBest();
    renderStats();
    $('moleShort').textContent = MOLE_GOAL - score;
    $('moleHits').textContent = hits;
    $('moleAccuracy').textContent = `${swings ? Math.round(hits / swings * 100) : 0}%`;
    showCard('moleFailCard');
    GameSound.play('fail');
  }
  function goToBonus() {
    clearTimeout(autoNextTimer);
    onSuccess(score);
  }

  window.MoleGame = {
    init(options) {
      onSuccess = options.onSuccess;
      try { best = Number(localStorage.getItem(STORE_KEY)) || 0; } catch (e) { best = 0; }
      document.querySelectorAll('.mole-goal').forEach(el => { el.textContent = MOLE_GOAL; });
      buildHoles();
      document.querySelectorAll('.rule-icon').forEach(icon => { icon.innerHTML = moleArt(icon.dataset.mole); });
      $('moleStartBtn').addEventListener('click', start);
      $('moleRetryBtn').addEventListener('click', start);
      $('moleBonusBtn').addEventListener('click', goToBonus);
      this.showStart();
    },
    // 게임을 멈추고 시작 카드가 보이는 처음 상태로 돌린다.
    showStart() {
      halt();
      score = combo = hits = swings = 0;
      clock = 0;
      clearHoles();
      renderStats();
      renderTime();
      showCard('moleStartCard');
    },
    stop: halt,
    // main.js가 넘겨주는 키 입력. 처리했으면 true를 돌려준다.
    handleKey(e) {
      const i = KEY_TO_HOLE[e.code];
      if (!playing || i === undefined) return false;
      if (!e.repeat) whack(i);
      return true;
    },
  };
})();
