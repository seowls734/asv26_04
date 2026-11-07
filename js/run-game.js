// 두더지 달리기(3단계): 끝없이 오른쪽으로 달리는 두더지가 장애물을 피하는 한 버튼 달리기.
// 돌·그루터기 무리는 뛰어넘고, 낮은 까마귀는 뛰고, 까마귀 떼는 숙여서만, 높은 까마귀는 그냥 지나간다. 부딪히면 바로 끝난다.
// 목표 점수를 넘으면 main.js가 넘겨준 onSuccess로 다음 단계에 넘어간다.
(function () {
  const RUN_GOAL = 1000; // 목표 점수. 이 숫자만 바꾸면 점수판과 카드 문구도 함께 바뀐다.
  const AUTO_NEXT_MS = 3500;
  const W = 420, H = 400, GROUND_Y = 320; // 그리기와 계산에 쓰는 논리 크기
  // 달리는 속도(초당 px)는 쉬지 않고 조금씩 빨라진다. 점수는 달린 거리 / SCORE_PER_PX.
  const SPEED_START = 250, SPEED_MAX = 540, SPEED_GAIN = 6.5, SCORE_PER_PX = 10;
  // 점프 높이는 짧게 누르든 길게 누르든 늘 같다. 공중에서 ↓는 빨리 떨어진다.
  const GRAVITY = 2300, JUMP_V = 760, FAST_FALL = 2600;
  const PLAYER_X = 80, STAND_W = 38, STAND_H = 46, DUCK_W = 50, DUCK_H = 26;
  const HIT_PAD = 5; // 그림보다 살짝 작은 충돌 범위
  const BIRD_FROM_SCORE = 300; // 이 점수부터 까마귀가 나온다(까마귀 떼 포함)
  const FLOCK_GAP = 36; // 까마귀 떼에서 위아래 까마귀 사이 간격
  const BIG_FROM_SCORE = 150; // 이 점수부터 큰 무리(돌 셋, 그루터기 둘)가 나온다
  const MILESTONE = 100, BLINK_MS = 900; // 100점마다 점수가 깜빡이며 소리가 난다
  const RESTART_DELAY_MS = 450; // 부딪힌 직후 눌러 둔 점프로 바로 다시 시작하지 않게 잠깐 기다린다
  // 장애물 무리. count는 한 번에 나오는 개수, lift는 까마귀가 땅에서 떠 있는 높이.
  const OBSTACLES = {
    rock1: { kind: 'rock', count: 1, w: 18, h: 26, weight: 4 },
    rock2: { kind: 'rock', count: 2, w: 18, h: 26, weight: 3 },
    rock3: { kind: 'rock', count: 3, w: 18, h: 26, weight: 2, big: true },
    stump1: { kind: 'stump', count: 1, w: 26, h: 44, weight: 3 },
    stump2: { kind: 'stump', count: 2, w: 26, h: 44, weight: 1, big: true },
    birdLow: { kind: 'bird', count: 1, w: 40, h: 22, lift: 4, weight: 3, bird: true }, // 뛰어야 피한다
    // 까마귀 떼: 세로로 높이 쌓여 있어서 뛰어넘을 수 없고, 숙여서만 지나갈 수 있다.
    flock: { kind: 'bird', count: 5, w: 40, h: 22, lift: 30, weight: 3, bird: true, stack: true },
    birdHigh: { kind: 'bird', count: 1, w: 40, h: 22, lift: 58, weight: 3, bird: true }, // 서 있으면 머리 위로 지나간다
  };
  const JUMP_KEYS = ['Space', 'ArrowUp', 'KeyW'];
  const DUCK_KEYS = ['ArrowDown', 'KeyS'];
  const STORE_KEY = 'dudeoji-run-best';

  const $ = id => document.getElementById(id);
  const canvas = $('runCanvas');
  const ctx = canvas.getContext('2d');
  ctx.scale(canvas.width / W, canvas.height / H);

  let playing = false, over = false, overAt = 0;
  let frameId = 0, lastFrame = 0, clock = 0;
  let player, obstacles, clouds, pebbles, distance, nextGap, best = 0;
  let lastMilestone = 0, blinkUntil = 0;
  let jumpHeld = false, duckHeld = false, padJump = false, padDuck = false;
  let autoNextTimer = 0;
  let onSuccess = () => {};

  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const score = () => Math.floor(distance / SCORE_PER_PX);
  const speed = () => Math.min(SPEED_MAX, SPEED_START + SPEED_GAIN * clock / 1000);
  const onGround = () => player.y >= GROUND_Y;
  const ducking = () => (duckHeld || padDuck) && onGround();
  const pad5 = n => String(n).padStart(5, '0');

  /* 장애물 */
  function pickObstacle() {
    const now = score();
    const kinds = Object.keys(OBSTACLES).filter(k => {
      const def = OBSTACLES[k];
      return (!def.bird || now >= BIRD_FROM_SCORE) && (!def.big || now >= BIG_FROM_SCORE);
    });
    let roll = rand(0, kinds.reduce((sum, k) => sum + OBSTACLES[k].weight, 0));
    for (const k of kinds) {
      roll -= OBSTACLES[k].weight;
      if (roll <= 0) return OBSTACLES[k];
    }
    return OBSTACLES.rock1;
  }
  function spawnObstacle() {
    const def = pickObstacle();
    // 땅 위 무리는 옆으로, 까마귀 떼는 위로 쌓인다.
    const w = def.stack ? def.w : def.w * def.count + (def.count - 1) * 2;
    const h = def.stack ? def.h + (def.count - 1) * FLOCK_GAP : def.h;
    const bottom = GROUND_Y - (def.lift || 0);
    obstacles.push({
      kind: def.kind, count: def.count, x: W + 10, y: bottom - h, w, h, bird: !!def.bird, stack: !!def.stack,
      sizes: Array.from({ length: def.count }, () => rand(0.8, 1)), // 무리 안에서 크기가 조금씩 다르다
    });
    // 점프 한 번에 걸리는 거리보다 넉넉히 띄워서, 착지할 자리가 항상 있게 한다. 빨라질수록 간격도 넓어진다.
    const airTime = 2 * JUMP_V / GRAVITY;
    nextGap = w + speed() * airTime * rand(1, 1.25) + rand(60, 300);
  }
  function playerBox() {
    const w = ducking() ? DUCK_W : STAND_W, h = ducking() ? DUCK_H : STAND_H;
    return { x: PLAYER_X - w / 2 + HIT_PAD, y: player.y - h + HIT_PAD, w: w - HIT_PAD * 2, h: h - HIT_PAD };
  }
  function obstacleBox(o) {
    return o.bird
      ? { x: o.x + 4, y: o.y + 4, w: o.w - 8, h: o.h - 8 }
      : { x: o.x + 2, y: o.y + 3, w: o.w - 4, h: o.h - 3 };
  }
  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /* 진행 */
  function jump() {
    if (!playing || !onGround()) return;
    player.vy = -JUMP_V;
    GameSound.play('runJump');
  }
  function update(sec) {
    const v = speed();
    distance += v * sec;

    if ((jumpHeld || padJump) && onGround()) jump();
    const fast = (duckHeld || padDuck) && !onGround() ? FAST_FALL : 0;
    player.vy += (GRAVITY + fast) * sec;
    player.y += player.vy * sec;
    if (player.y >= GROUND_Y) {
      player.y = GROUND_Y;
      player.vy = 0;
    }
    player.step += v * sec;

    nextGap -= v * sec;
    if (nextGap <= 0) spawnObstacle();
    const box = playerBox();
    for (const o of obstacles) {
      o.x -= v * sec * (o.bird ? 1.08 : 1); // 까마귀는 살짝 더 빠르다
      if (overlaps(box, obstacleBox(o))) {
        gameOver();
        return;
      }
    }
    obstacles = obstacles.filter(o => o.x + o.w > -20);

    clouds.forEach(c => {
      c.x -= v * 0.15 * sec;
      if (c.x < -60) { c.x = W + rand(10, 120); c.y = rand(30, 150); }
    });
    pebbles.forEach(p => {
      p.x -= v * sec;
      if (p.x < -4) { p.x = W + rand(0, 40); p.y = rand(GROUND_Y + 8, H - 6); }
    });

    const now = score();
    if (Math.floor(now / MILESTONE) > lastMilestone) {
      lastMilestone = Math.floor(now / MILESTONE);
      blinkUntil = clock + BLINK_MS;
      GameSound.play('runPoint');
    }
    renderStats();
    if (now >= RUN_GOAL) succeed();
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
  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, '#8fd0ee');
    sky.addColorStop(1, '#e6f5fb');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GROUND_Y);
    ctx.fillStyle = '#fff';
    clouds.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 14, 0, Math.PI * 2);
      ctx.arc(c.x + 16, c.y - 6, 18, 0, Math.PI * 2);
      ctx.arc(c.x + 34, c.y, 13, 0, Math.PI * 2);
      ctx.fill();
    });
    // 멀리 보이는 언덕은 천천히 지나간다
    const hillShift = (distance * 0.3) % 220;
    ctx.fillStyle = '#9fd27c';
    for (let x = -hillShift - 110; x < W + 220; x += 220) {
      ctx.beginPath();
      ctx.ellipse(x, GROUND_Y + 10, 130, 60, 0, Math.PI, 0);
      ctx.fill();
    }
    ctx.fillStyle = '#8a5a35';
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = '#65a941';
    ctx.fillRect(0, GROUND_Y, W, 7);
    ctx.fillStyle = '#6b4526';
    pebbles.forEach(p => ctx.fillRect(p.x, p.y, p.size, p.size * 0.6));
  }
  function drawRock(x, y, w, h) {
    ctx.fillStyle = '#9a9184';
    ctx.strokeStyle = '#2b1a10';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + 1, y + h * 0.45);
    ctx.quadraticCurveTo(x + w * 0.35, y - 2, x + w * 0.7, y + 2);
    ctx.lineTo(x + w, y + h * 0.5);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.fillRect(x + w * 0.3, y + h * 0.25, w * 0.25, 3);
  }
  function drawStump(x, y, w, h) {
    ctx.fillStyle = '#8b5a2b';
    ctx.strokeStyle = '#2b1a10';
    ctx.lineWidth = 2;
    ctx.fillRect(x, y + 6, w, h - 6);
    ctx.strokeRect(x, y + 6, w, h - 6);
    ctx.fillStyle = '#d9b48a';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + 6, w / 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#a0703f';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + 6, w / 4, 3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#65a941';
    ctx.fillRect(x + w - 5, y + 16, 7, 5);
  }
  function drawGroup(o) {
    // 무리 안의 하나하나를 땅에 붙여서, 크기만 조금씩 다르게 그린다.
    const each = (o.w - (o.count - 1) * 2) / o.count;
    o.sizes.forEach((size, i) => {
      const h = o.h * size, x = o.x + i * (each + 2);
      if (o.kind === 'stump') drawStump(x, GROUND_Y - h, each, h);
      else drawRock(x, GROUND_Y - h, each, h);
    });
  }
  function drawBird(o) {
    if (!o.stack) {
      drawCrow(o.x + o.w / 2, o.y + o.h / 2 + 2, 0);
      return;
    }
    // 까마귀 떼는 아래에서부터 쌓아 그리고, 날갯짓을 조금씩 엇갈리게 한다.
    for (let i = 0; i < o.count; i++) {
      drawCrow(o.x + o.w / 2, o.y + o.h - 9 - i * FLOCK_GAP, i * 40);
    }
  }
  function drawCrow(cx, cy, flapOffset) {
    const flap = Math.sin((clock + flapOffset) / 80) > 0;
    ctx.fillStyle = '#2d2f3a';
    ctx.strokeStyle = '#11131a';
    ctx.lineWidth = 2;
    ctx.beginPath(); // 날개
    ctx.moveTo(cx - 4, cy);
    ctx.lineTo(cx + 6, flap ? cy - 16 : cy + 14);
    ctx.lineTo(cx + 12, cy);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath(); // 몸
    ctx.ellipse(cx, cy, 15, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath(); // 머리
    ctx.arc(cx - 14, cy - 3, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffc22e';
    ctx.beginPath(); // 부리
    ctx.moveTo(cx - 19, cy - 4);
    ctx.lineTo(cx - 27, cy - 1);
    ctx.lineTo(cx - 19, cy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - 16, cy - 5, 2, 2);
  }
  function drawPlayer() {
    const duck = ducking();
    const w = duck ? DUCK_W : STAND_W, h = duck ? DUCK_H : STAND_H;
    const x = PLAYER_X, bottom = player.y, top = bottom - h;
    const running = onGround() && !over;
    // 발: 달릴 때는 번갈아 움직인다
    const phase = Math.floor(player.step / 22) % 2;
    ctx.fillStyle = '#5c3c22';
    [-1, 1].forEach((side, i) => {
      const lift = running ? (i === phase ? 4 : 0) : 2;
      ctx.beginPath();
      ctx.ellipse(x + side * w * 0.22, bottom - 2 - lift, 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2b1a10';
    ctx.fillStyle = '#8a5a35';
    ctx.beginPath();
    ctx.ellipse(x, top + h / 2 - 1, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 얼굴은 달리는 쪽(오른쪽)을 본다
    const fx = x + w * 0.2, fy = top + h * (duck ? 0.5 : 0.42);
    ctx.fillStyle = '#d9b48a';
    ctx.beginPath();
    ctx.ellipse(fx + 4, fy + 6, 9, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8788a';
    ctx.beginPath();
    ctx.ellipse(fx + 10, fy + 3, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c120c';
    ctx.strokeStyle = '#1c120c';
    if (over) { // 부딪히면 눈이 X가 된다
      ctx.beginPath();
      ctx.moveTo(fx - 3, fy - 7); ctx.lineTo(fx + 3, fy - 1);
      ctx.moveTo(fx + 3, fy - 7); ctx.lineTo(fx - 3, fy - 1);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(fx, fy - 4, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(fx + 1, fy + 9, 3, 3);
  }
  function drawScore() { // 오른쪽 위에 최고 기록과 지금 점수. 100점마다 지금 점수가 깜빡인다.
    ctx.font = '700 16px "IBM Plex Sans KR", "Malgun Gothic", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    const ink = '#3b2416';
    const blinkOff = clock < blinkUntil && Math.floor((blinkUntil - clock) / 150) % 2;
    ctx.fillStyle = ink;
    if (!blinkOff) ctx.fillText(pad5(score()), W - 14, 12);
    ctx.globalAlpha = 0.6;
    ctx.fillText(`최고 ${pad5(Math.max(best, score()))}`, W - 80, 12);
    ctx.globalAlpha = 1;
  }
  function draw() {
    drawBackground();
    obstacles.forEach(o => (o.bird ? drawBird(o) : drawGroup(o)));
    drawPlayer();
    drawScore();
  }

  /* 화면 갱신 */
  function renderStats() {
    $('runScore').textContent = Math.min(score(), RUN_GOAL);
    $('runSpeed').textContent = `${(speed() / SPEED_START).toFixed(1)}배`;
    $('runBest').textContent = best;
  }
  function showCard(id) {
    ['runIntroCard', 'runSuccessCard', 'runOverCard'].forEach(card => { $(card).hidden = card !== id; });
    if (id) $(id).querySelector('button').focus({ preventScroll: true });
  }
  function releaseControls() {
    jumpHeld = duckHeld = padJump = padDuck = false;
  }
  function resetRound() {
    clock = 0;
    distance = 0;
    lastMilestone = 0;
    blinkUntil = 0;
    over = false;
    player = { y: GROUND_Y, vy: 0, step: 0 };
    obstacles = [];
    nextGap = 300;
    clouds = Array.from({ length: 4 }, (_, i) => ({ x: i * 120 + rand(0, 60), y: rand(30, 150) }));
    pebbles = Array.from({ length: 14 }, () => ({ x: rand(0, W), y: rand(GROUND_Y + 8, H - 6), size: rand(3, 6) }));
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
    GameSound.play('start');
    lastFrame = performance.now();
    frameId = requestAnimationFrame(frame);
  }
  function saveBest() {
    if (score() <= best) return;
    best = score();
    try { localStorage.setItem(STORE_KEY, String(best)); } catch (e) { /* 이번 실행에서만 유지된다 */ }
  }
  function endRound() {
    halt();
    saveBest();
    renderStats();
    draw();
  }
  function succeed() {
    endRound();
    $('runSuccessTime').textContent = `${(clock / 1000).toFixed(1)}초`;
    showCard('runSuccessCard');
    GameSound.play('fanfare');
    gainAlly('staff');
    autoNextTimer = setTimeout(goToNext, AUTO_NEXT_MS);
  }
  function goToNext() {
    clearTimeout(autoNextTimer);
    onSuccess(Math.min(score(), RUN_GOAL));
  }
  function gameOver() {
    over = true;
    overAt = performance.now();
    endRound();
    $('runFinalScore').textContent = score();
    $('runFinalBest').textContent = best;
    showCard('runOverCard');
    GameSound.play('runHit');
  }
  // 안내 화면이나 부딪힌 뒤에는 점프로 바로 (다시) 달린다.
  function canStartByJump() {
    if (!$('runIntroCard').hidden) return true;
    return !$('runOverCard').hidden && performance.now() - overAt >= RESTART_DELAY_MS;
  }

  /* 휴대폰용 버튼 */
  function bindPad() {
    document.querySelectorAll('#runPad button').forEach(btn => {
      const isJump = btn.dataset.act === 'jump';
      const set = on => {
        if (isJump) padJump = on && playing;
        else padDuck = on && playing;
      };
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (isJump && !playing && canStartByJump()) start();
        set(true);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => btn.addEventListener(type, () => set(false)));
      btn.addEventListener('contextmenu', e => e.preventDefault());
    });
    // 게임판을 눌러도 뛴다
    canvas.addEventListener('pointerdown', e => {
      if (!playing) return;
      e.preventDefault();
      padJump = true;
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => canvas.addEventListener(type, () => { padJump = false; }));
  }

  window.RunGame = {
    init(options) {
      onSuccess = options.onSuccess;
      try { best = Number(localStorage.getItem(STORE_KEY)) || 0; } catch (e) { best = 0; }
      document.querySelectorAll('.run-goal').forEach(el => { el.textContent = RUN_GOAL; });
      bindPad();
      window.addEventListener('blur', releaseControls);
      $('runStartBtn').addEventListener('click', start);
      $('runRetryBtn').addEventListener('click', start);
      $('runNextBtn').addEventListener('click', goToNext);
      $('runBackBtn').addEventListener('click', options.onBack);
      $('runOverBackBtn').addEventListener('click', options.onBack);
    },
    // 게임을 멈추고 안내 카드가 보이는 처음 상태로 돌린다.
    showIntro() {
      halt();
      resetRound();
      showCard('runIntroCard');
    },
    stop: halt,
    isPlaying() { return playing; },
    // main.js가 넘겨주는 키 입력. 처리했으면 true를 돌려준다.
    handleKey(e) {
      if (!playing) {
        // Space·↑로 시작하거나 다시 달린다. 카드 버튼에 포커스가 있어도 두 번 눌리지 않게 여기서 처리한다.
        if (!JUMP_KEYS.includes(e.code) || $('runSuccessCard').hidden === false) return false;
        // 부딪힌 직후에는 눌러 둔 점프를 삼켜서 다시 달리기 버튼이 바로 눌리지 않게 한다.
        if (!e.repeat && canStartByJump()) {
          start();
          jumpHeld = true;
        }
        return true;
      }
      if (JUMP_KEYS.includes(e.code)) jumpHeld = true;
      else if (DUCK_KEYS.includes(e.code)) duckHeld = true;
      else return false;
      return true;
    },
    handleKeyUp(e) {
      if (JUMP_KEYS.includes(e.code)) jumpHeld = false;
      if (DUCK_KEYS.includes(e.code)) duckHeld = false;
    },
  };
})();
