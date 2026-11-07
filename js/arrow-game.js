// 화살 피하기(3단계): 수직으로 떨어지는 화살을 바닥의 두더지를 좌우로 움직여 피한다.
// 목표 개수를 피하면 main.js가 넘겨준 onSuccess로 보스전에 넘어간다.
(function () {
  const ARROW_GOAL = 100; // 목표 개수. 이 숫자만 바꾸면 점수판과 카드 문구도 함께 바뀐다.
  // 난이도: 화살 간격(밀리초)과 속도(초당 px). 시작값에서 끝값까지 ARROW_RAMP_MS에 걸쳐 바뀐다.
  const ARROW_GAP_START_MS = 420, ARROW_GAP_END_MS = 110;
  const ARROW_SPEED_START_MIN = 190, ARROW_SPEED_START_MAX = 260;
  const ARROW_SPEED_END_MIN = 430, ARROW_SPEED_END_MAX = 500;
  const ARROW_RAMP_MS = 12000; // 목표 개수를 채울 즈음 가장 어려워지는 길이
  const AUTO_NEXT_MS = 3500;
  const W = 360, H = 560, GROUND_Y = H - 40; // 그리기와 계산에 쓰는 논리 크기
  const PLAYER_W = 44, PLAYER_H = 52, PLAYER_SPEED = 300;
  const HIT_HALF_W = 14, HIT_H = 40; // 그림보다 살짝 작은 충돌 범위
  const ARROW_LEN = 34;
  const INVINCIBLE_MS = 1000;
  const MAX_HEARTS = 3;
  const STORE_KEY = 'dudeoji-arrow-best';

  const $ = id => document.getElementById(id);
  const canvas = $('arrowCanvas');
  const ctx = canvas.getContext('2d');
  ctx.scale(canvas.width / W, canvas.height / H);

  let playing = false;
  let frameId = 0, lastFrame = 0, clock = 0;
  let playerX = W / 2, hearts = MAX_HEARTS, dodged = 0, best = 0, invincibleUntil = 0;
  let arrows = [], nextArrow = 0;
  let keyLeft = false, keyRight = false, padDir = 0;
  let autoNextTimer = 0;
  let onSuccess = () => {};

  /* 진행 */
  function pace() { // 시간이 갈수록 더 자주, 더 빨리
    const t = Math.min(clock / ARROW_RAMP_MS, 1);
    return {
      gap: ARROW_GAP_START_MS + (ARROW_GAP_END_MS - ARROW_GAP_START_MS) * t,
      speedMin: ARROW_SPEED_START_MIN + (ARROW_SPEED_END_MIN - ARROW_SPEED_START_MIN) * t,
      speedMax: ARROW_SPEED_START_MAX + (ARROW_SPEED_END_MAX - ARROW_SPEED_START_MAX) * t,
    };
  }
  function spawnArrow() {
    const { speedMin, speedMax } = pace();
    arrows.push({ x: 12 + Math.random() * (W - 24), y: 0, vy: speedMin + Math.random() * (speedMax - speedMin) });
  }
  function hitsPlayer(arrow) {
    // 촉과 화살 중간만 검사해서 깃털이 스친 정도는 봐준다.
    return Math.abs(arrow.x - playerX) <= HIT_HALF_W
      && arrow.y >= GROUND_Y - HIT_H
      && arrow.y - ARROW_LEN / 2 <= GROUND_Y;
  }
  function takeHit() {
    hearts--;
    invincibleUntil = clock + INVINCIBLE_MS;
    GameSound.play('arrowHit');
    renderStats();
    if (hearts <= 0) gameOver();
  }
  function movePlayer(sec) {
    const dir = padDir || (keyRight ? 1 : 0) - (keyLeft ? 1 : 0);
    if (!dir) return;
    // 게임판 양 끝 밖으로는 못 나간다.
    playerX = Math.max(PLAYER_W / 2, Math.min(W - PLAYER_W / 2, playerX + dir * PLAYER_SPEED * sec));
  }
  function update(sec) {
    movePlayer(sec);

    if (clock >= nextArrow) {
      spawnArrow();
      nextArrow = clock + pace().gap;
    }

    const flying = [];
    for (const arrow of arrows) {
      arrow.y += arrow.vy * sec;
      if (clock >= invincibleUntil && hitsPlayer(arrow)) {
        takeHit();
        if (!playing) return;
      } else if (arrow.y >= GROUND_Y) {
        dodged++;
        renderStats();
        if (dodged >= ARROW_GOAL) { succeed(); return; }
      } else {
        flying.push(arrow);
      }
    }
    arrows = flying;
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
    sky.addColorStop(0, '#3a4a80');
    sky.addColorStop(0.6, '#c9718a');
    sky.addColorStop(1, '#f4a874');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GROUND_Y);
    ctx.fillStyle = '#6b4526';
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = '#65a941';
    ctx.fillRect(0, GROUND_Y, W, 7);
  }
  function drawArrow(arrow) { // arrow.y가 화살촉 끝이고, 촉은 아래를 향한다
    const x = arrow.x, tip = arrow.y;
    ctx.fillStyle = '#5c3c22';
    ctx.fillRect(x - 1.5, tip - ARROW_LEN, 3, ARROW_LEN - 8);
    ctx.fillStyle = '#20263f';
    ctx.beginPath();
    ctx.moveTo(x, tip);
    ctx.lineTo(x - 6, tip - 11);
    ctx.lineTo(x + 6, tip - 11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff8e6';
    ctx.beginPath();
    ctx.moveTo(x, tip - ARROW_LEN + 8);
    ctx.lineTo(x - 6, tip - ARROW_LEN);
    ctx.lineTo(x, tip - ARROW_LEN + 3);
    ctx.lineTo(x + 6, tip - ARROW_LEN);
    ctx.closePath();
    ctx.fill();
  }
  function drawPlayer() {
    const invincible = clock < invincibleUntil;
    if (invincible && Math.floor(clock / 90) % 2) return; // 깜빡이는 무적 상태
    const x = playerX, top = GROUND_Y - PLAYER_H, r = PLAYER_W / 2;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2b1a10';
    ctx.fillStyle = '#8a5a35';
    ctx.beginPath();
    ctx.moveTo(x - r, GROUND_Y);
    ctx.lineTo(x - r, top + r);
    ctx.arc(x, top + r, r, Math.PI, 0);
    ctx.lineTo(x + r, GROUND_Y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#d9b48a';
    ctx.beginPath();
    ctx.ellipse(x, top + 30, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8788a';
    ctx.beginPath();
    ctx.ellipse(x, top + 27, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c120c';
    ctx.strokeStyle = '#1c120c';
    if (invincible) {
      [-9, 9].forEach(dx => {
        ctx.beginPath();
        ctx.moveTo(x + dx - 3, top + 15);
        ctx.lineTo(x + dx + 3, top + 21);
        ctx.moveTo(x + dx + 3, top + 15);
        ctx.lineTo(x + dx - 3, top + 21);
        ctx.stroke();
      });
    } else {
      [-9, 9].forEach(dx => {
        ctx.beginPath();
        ctx.arc(x + dx, top + 18, 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
  function draw() {
    drawBackground();
    drawPlayer();
    arrows.forEach(drawArrow);
  }

  /* 화면 갱신 */
  function renderStats() {
    const full = Math.max(hearts, 0);
    const el = $('arrowHearts');
    el.textContent = '♥'.repeat(full) + '♡'.repeat(MAX_HEARTS - full);
    el.setAttribute('aria-label', `하트 ${full}개`);
    $('arrowDodged').textContent = dodged;
    $('arrowBest').textContent = best;
  }
  function showCard(id) {
    ['arrowIntroCard', 'arrowSuccessCard', 'arrowOverCard'].forEach(card => { $(card).hidden = card !== id; });
    if (id) $(id).querySelector('button').focus({ preventScroll: true });
  }
  function releaseControls() {
    keyLeft = keyRight = false;
    padDir = 0;
  }
  function resetRound() {
    clock = 0;
    playerX = W / 2;
    hearts = MAX_HEARTS;
    dodged = 0;
    invincibleUntil = 0;
    arrows = [];
    nextArrow = 400;
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
    if (dodged <= best) return;
    best = dodged;
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
    $('arrowHeartsLeft').textContent = hearts;
    showCard('arrowSuccessCard');
    GameSound.play('fanfare');
    gainAlly('archer');
    autoNextTimer = setTimeout(goToNext, AUTO_NEXT_MS);
  }
  function goToNext() {
    clearTimeout(autoNextTimer);
    onSuccess(dodged);
  }
  function gameOver() {
    endRound();
    $('arrowSurvived').textContent = `${(clock / 1000).toFixed(1)}초`;
    $('arrowOverDodged').textContent = dodged;
    showCard('arrowOverCard');
  }

  /* 휴대폰용 버튼 */
  function bindPad() {
    document.querySelectorAll('#arrowPad button').forEach(btn => {
      const dir = Number(btn.dataset.dir);
      const release = () => { if (padDir === dir) padDir = 0; };
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (playing) padDir = dir;
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => btn.addEventListener(type, release));
      btn.addEventListener('contextmenu', e => e.preventDefault());
    });
  }

  window.ArrowGame = {
    init(options) {
      onSuccess = options.onSuccess;
      try { best = Number(localStorage.getItem(STORE_KEY)) || 0; } catch (e) { best = 0; }
      document.querySelectorAll('.arrow-goal').forEach(el => { el.textContent = ARROW_GOAL; });
      bindPad();
      window.addEventListener('blur', releaseControls);
      $('arrowStartBtn').addEventListener('click', start);
      $('arrowRetryBtn').addEventListener('click', start);
      $('arrowNextBtn').addEventListener('click', goToNext);
      $('arrowBackBtn').addEventListener('click', options.onBack);
      $('arrowOverBackBtn').addEventListener('click', options.onBack);
    },
    // 게임을 멈추고 안내 카드가 보이는 처음 상태로 돌린다.
    showIntro() {
      halt();
      resetRound();
      showCard('arrowIntroCard');
    },
    stop: halt,
    isPlaying() { return playing; },
    // main.js가 넘겨주는 키 입력. 처리했으면 true를 돌려준다.
    handleKey(e) {
      if (!playing) return false;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyLeft = true;
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') keyRight = true;
      else return false;
      return true;
    },
    handleKeyUp(e) {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyLeft = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') keyRight = false;
    },
  };
})();
