// 지구 지키기(6단계): 우주선을 몰고 레이저로 운석을 부숴 지구를 지킨다.
// 목표 개수를 부수면 main.js가 넘겨준 onSuccess로 최종 결전에 넘어간다.
(function () {
  const SPACE_GOAL = 100; // 목표 개수. 이 숫자만 바꾸면 점수판과 카드 문구도 함께 바뀐다.
  const AUTO_NEXT_MS = 4000;
  // 난이도: 부순 개수가 늘수록 시작값에서 끝값으로 바뀐다. 간격은 최솟값과 최댓값 사이에서 고른다.
  const SPAWN_GAP_START_MIN = 220, SPAWN_GAP_START_MAX = 300;
  const SPAWN_GAP_END_MIN = 90, SPAWN_GAP_END_MAX = 150;
  const DOUBLE_CHANCE_START = 0.5, DOUBLE_CHANCE_END = 0.8; // 두 개가 한꺼번에 나올 확률
  const FALL_SPEED_START = 70, FALL_SPEED_END = 165;
  const BIG_CHANCE_START = 0.12, BIG_CHANCE_END = 0.4;
  const W = 400, H = 560; // 그리기와 계산에 쓰는 논리 크기
  const EARTH_R = 340, EARTH_Y = H + 280, EARTH_WARN = 30;
  const SHIP_R = 15, SHIP_SPEED = 230, SHIP_TOP = H / 2, SHIP_BOTTOM = 482, WING_X = 16, BEAM_GAP = 3;
  const MAX_HEARTS = 3, INVINCIBLE_MS = 1000;
  const FIRE_EVERY_MS = 170, LASER_SPEED = 640;
  const SMALL = { r: 14, hp: 1, earthDamage: 4 };
  const BIG = { r: 26, hp: 3, earthDamage: 8 };
  const STAR_COUNT = 60;
  const MOVE_KEYS = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  };
  const FIRE_KEYS = ['Space', 'KeyJ'];
  const STORE_KEY = 'dudeoji-space-best';

  const $ = id => document.getElementById(id);
  const wrap = $('spaceWrap');
  const canvas = $('spaceCanvas');
  const ctx = canvas.getContext('2d');
  ctx.scale(canvas.width / W, canvas.height / H);

  let playing = false;
  let frameId = 0, lastFrame = 0, clock = 0;
  let ship, meteors, shots, sparks, stars;
  let destroyed = 0, earth = 100, hearts = MAX_HEARTS, best = 0;
  let invincibleUntil = 0, nextMeteorAt = 0, nextFireAt = 0, volley = 0;
  let moves = { up: false, down: false, left: false, right: false };
  let fireHeld = false;
  let autoNextTimer = 0;
  let onSuccess = () => {};

  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function pace() { // 많이 부술수록 더 자주, 더 빠르게, 큰 운석도 더 많이
    const t = Math.min(destroyed / SPACE_GOAL, 1);
    return {
      gapMin: SPAWN_GAP_START_MIN + (SPAWN_GAP_END_MIN - SPAWN_GAP_START_MIN) * t,
      gapMax: SPAWN_GAP_START_MAX + (SPAWN_GAP_END_MAX - SPAWN_GAP_START_MAX) * t,
      doubleChance: DOUBLE_CHANCE_START + (DOUBLE_CHANCE_END - DOUBLE_CHANCE_START) * t,
      speed: FALL_SPEED_START + (FALL_SPEED_END - FALL_SPEED_START) * t,
      bigChance: BIG_CHANCE_START + (BIG_CHANCE_END - BIG_CHANCE_START) * t,
    };
  }

  /* 운석 */
  function makeMeteor(kind, x, y, vx, vy) {
    return {
      kind, x, y, vx, vy,
      r: kind.r,
      hp: kind.hp,
      rot: rand(0, Math.PI * 2),
      spin: rand(-1.5, 1.5),
      bumps: Array.from({ length: 9 }, () => rand(0.72, 1.08)), // 울퉁불퉁한 모양
      flashUntil: 0,
      lastVolley: -1,
      dead: false,
    };
  }
  function spawnMeteor() {
    const { speed, bigChance } = pace();
    const kind = Math.random() < bigChance ? BIG : SMALL;
    meteors.push(makeMeteor(kind, rand(kind.r, W - kind.r), -kind.r, rand(-18, 18), speed * rand(0.85, 1.15) * (kind === BIG ? 0.8 : 1)));
  }
  function spawnWave() {
    spawnMeteor();
    if (Math.random() < pace().doubleChance) spawnMeteor();
  }
  function burst(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2), speed = rand(40, 200);
      sparks.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: rand(2, 5),
        color: Math.random() < 0.5 ? color : '#ffb347',
        born: clock,
        until: clock + rand(300, 600),
      });
    }
  }
  function destroyMeteor(m) {
    m.dead = true;
    destroyed++;
    burst(m.x, m.y, m.kind === BIG ? 22 : 12, '#a08570');
    GameSound.play('meteorBlast');
    renderStats();
    if (destroyed >= SPACE_GOAL) { win(); return; }
    if (m.kind === BIG) {
      const speed = Math.max(m.vy, FALL_SPEED_START);
      meteors.push(makeMeteor(SMALL, m.x - 12, m.y, -55, speed));
      meteors.push(makeMeteor(SMALL, m.x + 12, m.y, 55, speed));
    }
  }
  function hitMeteor(m, shot) {
    if (m.lastVolley === shot.volley) return; // 한 번 쏜 레이저 묶음은 운석 하나에 1방으로 친다
    m.lastVolley = shot.volley;
    m.hp--;
    m.flashUntil = clock + 90;
    if (m.hp <= 0) {
      destroyMeteor(m);
    } else {
      burst(shot.x, shot.y, 4, '#ffe08a');
      GameSound.play('meteorHit');
    }
  }
  function shakeScreen() {
    wrap.classList.remove('shake');
    void wrap.offsetWidth;
    wrap.classList.add('shake');
  }
  function hitEarth(m) {
    m.dead = true;
    earth = Math.max(0, earth - m.kind.earthDamage);
    burst(m.x, m.y, 16, '#ff7a3c');
    shakeScreen();
    GameSound.play('earthHit');
    renderStats();
    if (earth <= 0) lose();
  }
  function hitShip(m) {
    m.dead = true;
    hearts--;
    invincibleUntil = clock + INVINCIBLE_MS;
    burst(m.x, m.y, 12, '#a08570');
    GameSound.play('arrowHit');
    renderStats();
    if (hearts <= 0) lose();
  }

  /* 진행 */
  function moveShip(sec) {
    const dx = (moves.right ? 1 : 0) - (moves.left ? 1 : 0);
    const dy = (moves.down ? 1 : 0) - (moves.up ? 1 : 0);
    if (!dx && !dy) return;
    const len = Math.hypot(dx, dy); // 대각선이 더 빠르지 않게 한다
    ship.x = clamp(ship.x + dx / len * SHIP_SPEED * sec, SHIP_R, W - SHIP_R);
    ship.y = clamp(ship.y + dy / len * SHIP_SPEED * sec, SHIP_TOP, SHIP_BOTTOM);
  }
  function fire() {
    if (clock < nextFireAt) return;
    nextFireAt = clock + FIRE_EVERY_MS;
    volley++;
    [-WING_X, WING_X].forEach(wing => {
      [-BEAM_GAP, BEAM_GAP].forEach(gap => {
        const y = ship.y - 4;
        shots.push({ x: ship.x + wing + gap, y, prevY: y, volley });
      });
    });
    GameSound.play('laser');
  }
  function updateShots(sec) {
    shots = shots.filter(shot => {
      shot.prevY = shot.y;
      shot.y -= LASER_SPEED * sec;
      if (shot.y < -20) return false;
      const target = meteors.find(m => !m.dead
        && Math.abs(shot.x - m.x) < m.r + 2
        && shot.y <= m.y + m.r && shot.prevY >= m.y - m.r); // 빠른 레이저가 뚫고 지나가지 않게 지나온 구간을 본다
      if (!target) return true;
      hitMeteor(target, shot);
      return false;
    });
    meteors = meteors.filter(m => !m.dead);
  }
  function updateMeteors(sec) {
    for (const m of meteors) {
      m.x += m.vx * sec;
      m.y += m.vy * sec;
      m.rot += m.spin * sec;
      if ((m.x < m.r && m.vx < 0) || (m.x > W - m.r && m.vx > 0)) m.vx = -m.vx; // 벽에서 튕겨 지구로 향한다
      if (Math.hypot(m.x - W / 2, m.y - EARTH_Y) < EARTH_R + m.r * 0.5) {
        hitEarth(m);
      } else if (clock >= invincibleUntil && Math.hypot(m.x - ship.x, m.y - ship.y) < m.r + SHIP_R - 4) {
        hitShip(m); // 그림보다 살짝 작게 판정한다
      }
      if (!playing) return;
    }
    meteors = meteors.filter(m => !m.dead);
  }
  function update(sec) {
    moveShip(sec);
    if (fireHeld) fire();
    stars.forEach(star => {
      star.y += star.speed * sec;
      if (star.y > H) {
        star.y = 0;
        star.x = rand(0, W);
      }
    });
    if (clock >= nextMeteorAt) {
      spawnWave();
      const { gapMin, gapMax } = pace();
      nextMeteorAt = clock + rand(gapMin, gapMax);
    }
    updateShots(sec);
    if (!playing) return;
    updateMeteors(sec);
    if (!playing) return;
    sparks = sparks.filter(spark => {
      spark.x += spark.vx * sec;
      spark.y += spark.vy * sec;
      return clock < spark.until;
    });
  }
  function frame(now) {
    const dt = Math.min(now - lastFrame, 100); // 탭을 벗어나면 시간도 멈춘다
    lastFrame = now;
    clock += dt;
    update(dt / 1000);
    if (!playing) return;
    draw();
    frameId = requestAnimationFrame(frame);
  }

  /* 그리기 */
  function drawSpace() {
    ctx.fillStyle = '#070b24';
    ctx.fillRect(0, 0, W, H);
    stars.forEach(star => {
      ctx.fillStyle = `rgba(255,255,255,${star.alpha})`;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    });
  }
  function drawEarth() {
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, EARTH_Y, EARTH_R, 0, Math.PI * 2);
    ctx.fillStyle = '#2f7fd0';
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = '#58a84a';
    [[70, 530, 58, 26], [210, 515, 44, 16], [335, 540, 66, 30], [150, 556, 40, 14]].forEach(([x, y, rx, ry]) => {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0.2, 0, Math.PI * 2);
      ctx.fill();
    });
    if (earth <= EARTH_WARN && Math.floor(clock / 220) % 2 === 0) {
      ctx.fillStyle = 'rgba(226,32,42,.62)'; // 위험할 때 빨갛게 깜빡인다
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(150,210,255,.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(W / 2, EARTH_Y, EARTH_R + 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  function drawMeteor(m) {
    // 꼬리 불꽃은 떨어지는 방향의 반대쪽에 그린다
    const len = Math.max(Math.hypot(m.vx, m.vy), 1);
    const ux = m.vx / len, uy = m.vy / len;
    const tail = m.r * (2.2 + Math.sin(clock / 60 + m.x) * 0.35);
    ctx.fillStyle = 'rgba(255,122,40,.8)';
    ctx.beginPath();
    ctx.moveTo(m.x - uy * m.r * 0.85, m.y + ux * m.r * 0.85);
    ctx.lineTo(m.x - ux * tail, m.y - uy * tail);
    ctx.lineTo(m.x + uy * m.r * 0.85, m.y - ux * m.r * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,220,120,.9)';
    ctx.beginPath();
    ctx.moveTo(m.x - uy * m.r * 0.45, m.y + ux * m.r * 0.45);
    ctx.lineTo(m.x - ux * tail * 0.6, m.y - uy * tail * 0.6);
    ctx.lineTo(m.x + uy * m.r * 0.45, m.y - ux * m.r * 0.45);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.rot);
    ctx.fillStyle = clock < m.flashUntil ? '#ffffff' : m.kind === BIG ? '#7d6653' : '#94796a';
    ctx.strokeStyle = '#2b1a10';
    ctx.lineWidth = 2;
    ctx.beginPath();
    m.bumps.forEach((bump, i) => {
      const angle = i / m.bumps.length * Math.PI * 2;
      const px = Math.cos(angle) * m.r * bump, py = Math.sin(angle) * m.r * bump;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(43,26,16,.4)';
    [[-0.3, -0.2, 0.2], [0.3, 0.25, 0.14]].forEach(([px, py, size]) => {
      ctx.beginPath();
      ctx.arc(m.r * px, m.r * py, m.r * size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
  function drawShip() {
    if (clock < invincibleUntil && Math.floor(clock / 90) % 2) return; // 깜빡이는 무적 상태
    const x = ship.x, y = ship.y;
    ctx.fillStyle = Math.floor(clock / 70) % 2 ? '#ff9a3c' : '#ffd35a';
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 14);
    ctx.lineTo(x, y + 28);
    ctx.lineTo(x + 6, y + 14);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#10152e';
    ctx.fillStyle = '#c5d0dd';
    ctx.beginPath(); // 날개
    ctx.moveTo(x - 24, y + 14);
    ctx.lineTo(x - 18, y - 6);
    ctx.lineTo(x + 18, y - 6);
    ctx.lineTo(x + 24, y + 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e2452f';
    [-WING_X, WING_X].forEach(wing => ctx.fillRect(x + wing - 5, y - 10, 10, 6));
    ctx.fillStyle = '#eef2f6';
    ctx.beginPath(); // 몸통
    ctx.moveTo(x, y - 24);
    ctx.quadraticCurveTo(x + 12, y - 8, x + 10, y + 15);
    ctx.lineTo(x - 10, y + 15);
    ctx.quadraticCurveTo(x - 12, y - 8, x, y - 24);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#8a5a35'; // 조종석의 두더지
    ctx.beginPath();
    ctx.arc(x, y - 3, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c120c';
    [-3, 3].forEach(dx => ctx.fillRect(x + dx - 1, y - 6, 2, 2));
    ctx.fillStyle = '#e8788a';
    ctx.fillRect(x - 1.5, y - 2, 3, 2);
  }
  function draw() {
    drawSpace();
    drawEarth();
    ctx.fillStyle = '#7dffb0';
    shots.forEach(shot => ctx.fillRect(shot.x - 1, shot.y, 2, 14));
    meteors.forEach(drawMeteor);
    drawShip();
    sparks.forEach(spark => {
      ctx.globalAlpha = clamp((spark.until - clock) / (spark.until - spark.born), 0, 1);
      ctx.fillStyle = spark.color;
      ctx.fillRect(spark.x, spark.y, spark.size, spark.size);
    });
    ctx.globalAlpha = 1;
  }

  /* 화면 갱신 */
  function renderStats() {
    $('spaceDestroyed').textContent = destroyed;
    $('spaceEarth').textContent = earth;
    const full = Math.max(hearts, 0);
    const heartsEl = $('spaceHearts');
    heartsEl.textContent = '♥'.repeat(full) + '♡'.repeat(MAX_HEARTS - full);
    heartsEl.setAttribute('aria-label', `목숨 ${full}개`);
    $('spaceBest').textContent = best;
  }
  function showCard(id) {
    ['spaceIntroCard', 'spaceSuccessCard', 'spaceOverCard'].forEach(card => { $(card).hidden = card !== id; });
    if (id) $(id).querySelector('button').focus({ preventScroll: true });
  }
  function releaseControls() {
    moves = { up: false, down: false, left: false, right: false };
    fireHeld = false;
  }
  function resetRound() {
    clock = 0;
    ship = { x: W / 2, y: 420 };
    meteors = [];
    shots = [];
    sparks = [];
    destroyed = 0;
    earth = 100;
    hearts = MAX_HEARTS;
    invincibleUntil = 0;
    nextMeteorAt = 500;
    nextFireAt = 0;
    volley = 0;
    releaseControls();
    renderStats();
    draw();
  }

  /* 시작과 끝 */
  function halt() {
    playing = false;
    cancelAnimationFrame(frameId);
    clearTimeout(autoNextTimer);
    releaseControls();
  }
  function start() {
    halt();
    resetRound();
    showCard(null);
    playing = true;
    GameSound.play('shipLaunch');
    lastFrame = performance.now();
    frameId = requestAnimationFrame(frame);
  }
  function endRound() {
    halt();
    if (destroyed > best) {
      best = destroyed;
      try { localStorage.setItem(STORE_KEY, String(best)); } catch (e) { /* 이번 실행에서만 유지된다 */ }
    }
    renderStats();
    draw();
  }
  function win() {
    endRound();
    $('spaceEarthLeft').textContent = `${earth}%`;
    showCard('spaceSuccessCard');
    GameSound.play('fanfare');
    gainAlly('astronaut');
    autoNextTimer = setTimeout(goToNext, AUTO_NEXT_MS);
  }
  function goToNext() {
    clearTimeout(autoNextTimer);
    onSuccess(destroyed);
  }
  function lose() {
    endRound();
    $('spaceOverDestroyed').textContent = destroyed;
    $('spaceOverBest').textContent = best;
    showCard('spaceOverCard');
    GameSound.play('blockOver');
  }

  /* 휴대폰용 버튼 */
  function bindPad() {
    document.querySelectorAll('#spacePad [data-move]').forEach(btn => {
      const name = btn.dataset.move;
      const release = () => { moves[name] = false; };
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (playing) moves[name] = true;
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => btn.addEventListener(type, release));
      btn.addEventListener('contextmenu', e => e.preventDefault());
    });
    const fireBtn = $('spaceFireBtn');
    const release = () => { fireHeld = false; };
    fireBtn.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (playing) fireHeld = true;
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => fireBtn.addEventListener(type, release));
    fireBtn.addEventListener('contextmenu', e => e.preventDefault());
  }

  window.SpaceGame = {
    init(options) {
      onSuccess = options.onSuccess;
      try { best = Number(localStorage.getItem(STORE_KEY)) || 0; } catch (e) { best = 0; }
      document.querySelectorAll('.space-goal').forEach(el => { el.textContent = SPACE_GOAL; });
      stars = Array.from({ length: STAR_COUNT }, () => ({
        x: rand(0, W), y: rand(0, H), size: rand(1, 2.4), speed: rand(8, 28), alpha: rand(0.35, 1),
      }));
      bindPad();
      window.addEventListener('blur', releaseControls);
      $('spaceStartBtn').addEventListener('click', start);
      $('spaceRetryBtn').addEventListener('click', start);
      $('spaceBackBtn').addEventListener('click', options.onBack);
      $('spaceOverBackBtn').addEventListener('click', options.onBack);
      $('spaceNextBtn').addEventListener('click', goToNext);
    },
    // 게임을 멈추고 안내 카드가 보이는 처음 상태로 돌린다.
    showIntro() {
      halt();
      resetRound();
      showCard('spaceIntroCard');
    },
    stop: halt,
    isPlaying() { return playing; },
    // main.js가 넘겨주는 키 입력. 처리했으면 true를 돌려준다.
    handleKey(e) {
      if (!playing) return false;
      if (MOVE_KEYS[e.code]) {
        moves[MOVE_KEYS[e.code]] = true;
        return true;
      }
      if (FIRE_KEYS.includes(e.code)) {
        fireHeld = true;
        return true;
      }
      return false;
    },
    handleKeyUp(e) {
      if (MOVE_KEYS[e.code]) moves[MOVE_KEYS[e.code]] = false;
      if (FIRE_KEYS.includes(e.code)) fireHeld = false;
    },
  };
})();
