// 두더지 합치기(2단계): 위에서 두더지를 떨어뜨려 같은 두더지끼리 부딪히면 한 단계 위 두더지로 합쳐진다.
// 아기 → 안전모 → 곡괭이 → 보석 → 장군 → 두더지 왕. 두더지 왕을 KINGS_TO_WIN번 만들면 main.js가 넘겨준 onSuccess로 다음 단계에 넘어간다.
(function () {
  const AUTO_NEXT_MS = 3500;
  const W = 360, H = 520; // 그리기와 계산에 쓰는 논리 크기
  const DROP_Y = 46, DANGER_Y = 92; // 떨어뜨리는 높이와 넘치면 안 되는 선
  const DROP_EVERY_MS = 700, FIRST_DROP_MS = 1000, MOVE_SPEED = 260; // 두더지는 0.7초마다 저절로 떨어진다. 나는 자리만 고른다.
  const GRAVITY = 1100, SUBSTEPS = 6, BOUNCE = 0.12, FRICTION = 0.995;
  const OVER_MS = 1500, SETTLE_MS = 900; // 선을 넘은 채로 이만큼 있으면 끝난다. 막 떨어진 두더지는 봐준다.
  const WIN_DELAY_MS = 1100; // 두더지 왕이 나타난 걸 잠깐 보여 준 뒤 성공 카드를 띄운다
  // 단계별 두더지. points는 그 단계로 합쳐졌을 때 얻는 점수.
  const TIERS = [
    { name: '아기 두더지', r: 18, fur: '#c99566', points: 0 },
    { name: '안전모 두더지', r: 26, fur: '#9a6640', points: 10 },
    { name: '곡괭이 두더지', r: 36, fur: '#86552f', points: 20 },
    { name: '보석 두더지', r: 47, fur: '#744826', points: 40 },
    { name: '장군 두더지', r: 59, fur: '#6b4223', points: 70 },
    { name: '두더지 왕', r: 72, fur: '#633c1f', points: 120 },
  ];
  const GENERAL = TIERS.length - 2, KING = TIERS.length - 1;
  const KING_PAIR_POINTS = 200; // 왕끼리 합치면 둘 다 사라지며 큰 점수
  const KINGS_TO_WIN = 1; // 두더지 왕을 이만큼 만들면 성공. 이 숫자만 바꾸면 점수판과 카드 문구도 함께 바뀐다.
  const DROP_WEIGHTS = [7, 3]; // 떨어뜨릴 수 있는 건 아기와 안전모 두더지뿐
  const MOVE_KEYS = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };
  const STORE_KEY = 'dudeoji-merge-best';

  const $ = id => document.getElementById(id);
  const canvas = $('mergeCanvas');
  const ctx = canvas.getContext('2d');
  ctx.scale(canvas.width / W, canvas.height / H);
  const nextCanvas = $('mergeNext');
  const nextCtx = nextCanvas.getContext('2d');

  let playing = false, won = false;
  let frameId = 0, lastFrame = 0, clock = 0;
  let moles = [], pops = [], dropX = W / 2, current = 0, next = 0, readyAt = 0;
  let score = 0, best = 0, topTier = 0, kingsMade = 0, overSince = null, wonAt = 0;
  let keyDir = 0, padDir = 0;
  let autoNextTimer = 0;
  let onSuccess = () => {};

  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function pickDrop() {
    let roll = rand(0, DROP_WEIGHTS.reduce((a, b) => a + b, 0));
    for (let i = 0; i < DROP_WEIGHTS.length; i++) {
      roll -= DROP_WEIGHTS[i];
      if (roll <= 0) return i;
    }
    return 0;
  }

  /* 떨어뜨리기와 합치기 */
  function drop() {
    if (!playing || won || clock < readyAt) return;
    const r = TIERS[current].r;
    moles.push({ tier: current, x: clamp(dropX, r, W - r), y: DROP_Y, vx: 0, vy: 0, born: clock, gone: false });
    current = next;
    next = pickDrop();
    readyAt = clock + DROP_EVERY_MS;
    GameSound.play('mergeDrop');
    renderStats();
  }
  function merge(a, b) {
    a.gone = b.gone = true;
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    if (a.tier === KING) { // 왕 둘은 함께 사라진다
      score += KING_PAIR_POINTS;
      pops.push({ x, y, r: TIERS[KING].r, until: clock + 500, text: `+${KING_PAIR_POINTS}` });
      GameSound.play('mergeKing');
      return;
    }
    const tier = a.tier + 1;
    moles.push({ tier, x, y, vx: (a.vx + b.vx) / 2, vy: Math.min(a.vy, b.vy) * 0.3 - 60, born: clock - SETTLE_MS, gone: false });
    score += TIERS[tier].points;
    topTier = Math.max(topTier, tier);
    pops.push({ x, y, r: TIERS[tier].r, until: clock + 400, text: TIERS[tier].points ? `+${TIERS[tier].points}` : '' });
    if (tier === KING && !won) {
      kingsMade++;
      const done = kingsMade >= KINGS_TO_WIN;
      pops.push({ x, y: y - TIERS[KING].r - 10, r: 0, until: clock + WIN_DELAY_MS, text: KINGS_TO_WIN > 1 ? `두더지 왕 탄생! ${kingsMade}/${KINGS_TO_WIN}` : '두더지 왕 탄생!', big: true });
      GameSound.play('mergeKing');
      if (done) {
        won = true;
        wonAt = clock;
      }
    } else {
      GameSound.play('mergePop');
    }
  }

  /* 물리: 원끼리 밀어내고, 같은 단계끼리 닿으면 합친다 */
  function step(dt) {
    for (const m of moles) {
      m.vy += GRAVITY * dt;
      m.vx *= FRICTION;
      m.vy *= FRICTION;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const r = TIERS[m.tier].r;
      if (m.x < r) { m.x = r; m.vx = Math.abs(m.vx) * BOUNCE; }
      if (m.x > W - r) { m.x = W - r; m.vx = -Math.abs(m.vx) * BOUNCE; }
      if (m.y > H - r) {
        m.y = H - r;
        m.vy = -Math.abs(m.vy) * BOUNCE;
        m.vx *= 0.96; // 바닥에서는 조금 더 미끄러짐이 줄어든다
      }
    }
    for (let i = 0; i < moles.length; i++) {
      const a = moles[i];
      if (a.gone) continue;
      for (let j = i + 1; j < moles.length; j++) {
        const b = moles[j];
        if (b.gone) continue;
        const ra = TIERS[a.tier].r, rb = TIERS[b.tier].r;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= ra + rb || d === 0) continue;
        if (a.tier === b.tier) {
          merge(a, b);
          break;
        }
        // 겹친 만큼 무게(넓이)에 따라 나눠 밀어낸다
        const nx = dx / d, ny = dy / d, overlap = ra + rb - d;
        const ma = ra * ra, mb = rb * rb, total = ma + mb;
        a.x -= nx * overlap * (mb / total);
        a.y -= ny * overlap * (mb / total);
        b.x += nx * overlap * (ma / total);
        b.y += ny * overlap * (ma / total);
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) { // 서로 다가가는 속도만 없앤다
          const impulse = -(1 + BOUNCE) * rel / (1 / ma + 1 / mb);
          a.vx -= impulse / ma * nx;
          a.vy -= impulse / ma * ny;
          b.vx += impulse / mb * nx;
          b.vy += impulse / mb * ny;
        }
      }
    }
    if (moles.some(m => m.gone)) moles = moles.filter(m => !m.gone);
  }
  function update(sec) {
    const dir = padDir || keyDir;
    if (dir) dropX = clamp(dropX + dir * MOVE_SPEED * sec, 0, W);
    if (clock >= readyAt) drop(); // 시간이 되면 지금 고른 자리에 저절로 떨어진다
    for (let i = 0; i < SUBSTEPS; i++) step(sec / SUBSTEPS);
    pops = pops.filter(p => clock < p.until);

    // 이미 자리 잡은 두더지가 위험선 위로 삐져나와 있으면 시간을 잰다
    const over = moles.some(m => clock - m.born > SETTLE_MS && m.y - TIERS[m.tier].r < DANGER_Y);
    overSince = over ? (overSince === null ? clock : overSince) : null;
    renderStats();
    if (won && clock - wonAt >= WIN_DELAY_MS) { succeed(); return; }
    if (!won && overSince !== null && clock - overSince >= OVER_MS) gameOver();
  }
  function frame(now) {
    const dt = Math.min(now - lastFrame, 50); // 탭을 벗어나면 시간도 멈춘다
    lastFrame = now;
    clock += dt;
    update(dt / 1000);
    if (!playing) return;
    draw();
    frameId = requestAnimationFrame(frame);
  }

  /* 그리기 */
  function drawMole(c, x, y, tier, alpha = 1) {
    const t = TIERS[tier], r = t.r, s = r / 30; // 반지름 30을 기준으로 그린 그림을 늘리고 줄인다
    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y);
    if (tier === KING) { // 왕의 붉은 망토
      c.fillStyle = '#b3242b';
      c.beginPath();
      c.ellipse(0, 6 * s, r * 1.02, r * 0.92, 0, 0, Math.PI * 2);
      c.fill();
    }
    if (tier === 2) { // 곡괭이는 머리 뒤로 비스듬히
      c.save();
      c.rotate(-0.6);
      c.fillStyle = '#8b5a2b';
      c.fillRect(-2.5 * s, -40 * s, 5 * s, 44 * s);
      c.fillStyle = '#aeb9c4';
      c.strokeStyle = '#2b1a10';
      c.lineWidth = 1.5 * s;
      c.beginPath();
      c.moveTo(-16 * s, -34 * s);
      c.quadraticCurveTo(0, -46 * s, 16 * s, -34 * s);
      c.lineTo(0, -38 * s);
      c.closePath();
      c.fill();
      c.stroke();
      c.restore();
    }
    // 몸
    c.fillStyle = t.fur;
    c.strokeStyle = '#2b1a10';
    c.lineWidth = 2 * s;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = tier === 0 ? '#f0d2ae' : '#d9b48a'; // 주둥이
    c.beginPath();
    c.ellipse(0, 9 * s, 15 * s, 11 * s, 0, 0, Math.PI * 2);
    c.fill();
    const eye = tier === 0 ? 4.2 : 3.4; // 아기는 눈이 크다
    c.fillStyle = '#1c120c';
    [-9, 9].forEach(dx => {
      c.beginPath();
      c.arc(dx * s, -5 * s, eye * s, 0, Math.PI * 2);
      c.fill();
    });
    c.fillStyle = '#fff';
    [-9, 9].forEach(dx => {
      c.beginPath();
      c.arc((dx + 1.2) * s, -6.4 * s, 1.3 * s, 0, Math.PI * 2);
      c.fill();
    });
    c.fillStyle = '#e8788a';
    c.beginPath();
    c.ellipse(0, 4 * s, 4.5 * s, 3.2 * s, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.fillRect(-3 * s, 11 * s, 6 * s, 5 * s);
    c.strokeStyle = '#2b1a10';
    c.lineWidth = 1 * s;
    c.beginPath();
    c.moveTo(0, 11 * s); c.lineTo(0, 16 * s);
    c.stroke();
    if (tier === 0) { // 아기: 볼터치와 머리털 한 가닥
      c.fillStyle = 'rgba(255,130,150,.5)';
      [-15, 15].forEach(dx => {
        c.beginPath();
        c.arc(dx * s, 3 * s, 4 * s, 0, Math.PI * 2);
        c.fill();
      });
      c.strokeStyle = '#2b1a10';
      c.lineWidth = 2 * s;
      c.beginPath();
      c.moveTo(0, -r);
      c.quadraticCurveTo(5 * s, -r - 9 * s, 9 * s, -r - 4 * s);
      c.stroke();
    } else if (tier === 1) { // 노란 안전모와 작은 전등
      c.fillStyle = '#ffc22e';
      c.strokeStyle = '#2b1a10';
      c.lineWidth = 2 * s;
      c.beginPath();
      c.arc(0, -12 * s, 24 * s, Math.PI, 0);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillRect(-30 * s, -14 * s, 60 * s, 5 * s);
      c.strokeRect(-30 * s, -14 * s, 60 * s, 5 * s);
      c.fillStyle = '#fff6b0';
      c.beginPath();
      c.arc(0, -26 * s, 5 * s, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    } else if (tier === 2) { // 곡괭이 두더지: 땀 닦는 두건
      c.fillStyle = '#3f7fd0';
      c.beginPath();
      c.arc(0, -10 * s, 27 * s, Math.PI * 1.05, Math.PI * 1.95);
      c.closePath();
      c.fill();
      c.fillStyle = '#fff';
      [-10, 0, 10].forEach(dx => {
        c.beginPath();
        c.arc(dx * s, -24 * s, 1.6 * s, 0, Math.PI * 2);
        c.fill();
      });
    } else if (tier === 3) { // 이마에 반짝이는 보석
      c.fillStyle = '#5ad1ff';
      c.strokeStyle = '#1b4f7a';
      c.lineWidth = 2 * s;
      c.beginPath();
      c.moveTo(0, -27 * s); c.lineTo(9 * s, -19 * s); c.lineTo(0, -9 * s); c.lineTo(-9 * s, -19 * s);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(-3 * s, -22 * s); c.lineTo(0, -25 * s); c.lineTo(2 * s, -21 * s);
      c.closePath();
      c.fill();
      const tw = (Math.sin(clock / 200 + x) + 1) / 2; // 반짝임
      c.strokeStyle = `rgba(255,255,255,${tw})`;
      c.lineWidth = 1.5 * s;
      c.beginPath();
      c.moveTo(13 * s, -30 * s); c.lineTo(13 * s, -22 * s);
      c.moveTo(9 * s, -26 * s); c.lineTo(17 * s, -26 * s);
      c.stroke();
    } else if (tier === GENERAL) { // 장군: 붉은 술이 달린 쇠 투구와 굳게 다문 눈썹
      c.fillStyle = '#e2202a'; // 투구 꼭대기 붉은 술
      c.beginPath();
      c.moveTo(0, -46 * s);
      c.quadraticCurveTo(-9 * s, -38 * s, -3 * s, -30 * s);
      c.lineTo(3 * s, -30 * s);
      c.quadraticCurveTo(9 * s, -38 * s, 0, -46 * s);
      c.fill();
      c.fillStyle = '#7d8794';
      c.strokeStyle = '#2b1a10';
      c.lineWidth = 2 * s;
      c.beginPath();
      c.arc(0, -10 * s, 24 * s, Math.PI, 0);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#c9a227'; // 투구 테두리 금띠
      c.fillRect(-29 * s, -13 * s, 58 * s, 6 * s);
      c.strokeRect(-29 * s, -13 * s, 58 * s, 6 * s);
      c.fillStyle = '#c9a227';
      c.beginPath();
      c.arc(0, -22 * s, 4 * s, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.strokeStyle = '#1c120c'; // 굳은 눈썹
      c.lineWidth = 2.5 * s;
      c.beginPath();
      c.moveTo(-14 * s, -11 * s); c.lineTo(-5 * s, -8 * s);
      c.moveTo(14 * s, -11 * s); c.lineTo(5 * s, -8 * s);
      c.stroke();
    } else if (tier === KING) { // 금관과 콧수염
      c.fillStyle = '#ffc22e';
      c.strokeStyle = '#2b1a10';
      c.lineWidth = 2 * s;
      c.beginPath();
      c.moveTo(-18 * s, -20 * s); c.lineTo(-22 * s, -40 * s); c.lineTo(-10 * s, -30 * s); c.lineTo(0, -44 * s);
      c.lineTo(10 * s, -30 * s); c.lineTo(22 * s, -40 * s); c.lineTo(18 * s, -20 * s);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#e2202a';
      c.beginPath();
      c.arc(0, -27 * s, 3 * s, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#2b1a10';
      c.lineWidth = 3 * s;
      c.beginPath();
      c.moveTo(-1 * s, 8 * s); c.quadraticCurveTo(-8 * s, 4 * s, -14 * s, 9 * s);
      c.moveTo(1 * s, 8 * s); c.quadraticCurveTo(8 * s, 4 * s, 14 * s, 9 * s);
      c.stroke();
    }
    c.restore();
  }
  function drawBox() {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#3b2416');
    bg.addColorStop(1, '#24150b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,235,200,.05)'; // 흙 속 자갈
    for (let i = 0; i < 26; i++) {
      ctx.beginPath();
      ctx.arc((i * 97) % W, 120 + (i * 173) % (H - 130), 3 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    // 위험선: 넘친 채로 있으면 빨갛게 깜빡인다
    const warn = overSince !== null && Math.floor(clock / 120) % 2;
    ctx.save();
    ctx.strokeStyle = warn ? '#ff4b3b' : 'rgba(255,248,230,.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(0, DANGER_Y);
    ctx.lineTo(W, DANGER_Y);
    ctx.stroke();
    ctx.restore();
  }
  function drawDropper() {
    if (!playing || won) return;
    const r = TIERS[current].r;
    const x = clamp(dropX, r, W - r);
    ctx.strokeStyle = 'rgba(255,248,230,.25)'; // 떨어질 자리 안내선
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, DROP_Y);
    ctx.lineTo(x, H);
    ctx.stroke();
    // 떨어질 때가 가까울수록 진해진다
    drawMole(ctx, x, DROP_Y, current, 0.45 + 0.55 * clamp(1 - (readyAt - clock) / DROP_EVERY_MS, 0, 1));
  }
  function drawPops() {
    pops.forEach(p => {
      const life = clamp((p.until - clock) / 400, 0, 1);
      if (p.r) {
        ctx.strokeStyle = `rgba(255,226,120,${life})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + (1 - life) * 18, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (p.text) {
        ctx.font = p.big ? '400 30px "Black Han Sans", "Malgun Gothic", sans-serif' : '700 18px "Malgun Gothic", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#2b1a10';
        ctx.fillStyle = p.big ? '#ffc22e' : '#fff8e6';
        const y = p.big ? Math.max(40, p.y) : p.y - (1 - life) * 22;
        ctx.strokeText(p.text, p.x, y);
        ctx.fillText(p.text, p.x, y);
      }
    });
  }
  function draw() {
    drawBox();
    moles.forEach(m => drawMole(ctx, m.x, m.y, m.tier));
    drawDropper();
    drawPops();
  }
  function drawNext() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    nextCtx.save();
    const size = nextCanvas.width;
    const scale = size / 2 / (TIERS[next].r + 14) * 0.9;
    nextCtx.translate(size / 2, size / 2 + 4);
    nextCtx.scale(scale, scale);
    drawMole(nextCtx, 0, 0, next);
    nextCtx.restore();
  }

  /* 화면 갱신 */
  function renderStats() {
    $('mergeScore').textContent = score;
    $('mergeTop').textContent = TIERS[topTier].name;
    $('mergeBest').textContent = best;
    drawNext();
  }
  function showCard(id) {
    ['mergeIntroCard', 'mergeSuccessCard', 'mergeOverCard'].forEach(card => { $(card).hidden = card !== id; });
    if (id) $(id).querySelector('button').focus({ preventScroll: true });
  }
  function releaseControls() {
    keyDir = padDir = 0;
  }
  function resetRound() {
    clock = 0;
    moles = [];
    pops = [];
    dropX = W / 2;
    current = pickDrop();
    next = pickDrop();
    readyAt = FIRST_DROP_MS; // 처음 하나는 자리를 고를 시간을 조금 더 준다
    score = 0;
    topTier = 0;
    kingsMade = 0;
    overSince = null;
    won = false;
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
    if (score <= best) return;
    best = score;
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
    $('mergeSuccessScore').textContent = score;
    $('mergeSuccessTime').textContent = `${(clock / 1000).toFixed(1)}초`;
    showCard('mergeSuccessCard');
    GameSound.play('fanfare');
    gainAlly('shield');
    autoNextTimer = setTimeout(goToNext, AUTO_NEXT_MS);
  }
  function goToNext() {
    clearTimeout(autoNextTimer);
    onSuccess(score);
  }
  function gameOver() {
    endRound();
    $('mergeFinalScore').textContent = score;
    $('mergeFinalTop').textContent = TIERS[topTier].name;
    $('mergeFinalBest').textContent = best;
    showCard('mergeOverCard');
    GameSound.play('blockOver');
  }

  /* 마우스·터치: 게임판 위에서 움직이면 따라가고, 떼면 떨어뜨린다 */
  function toLogicalX(e) {
    const rect = canvas.getBoundingClientRect();
    return (e.clientX - rect.left) / rect.width * W;
  }
  function bindPointer() {
    canvas.addEventListener('pointermove', e => { if (playing) dropX = clamp(toLogicalX(e), 0, W); });
    canvas.addEventListener('pointerdown', e => {
      if (!playing) return;
      e.preventDefault();
      dropX = clamp(toLogicalX(e), 0, W);
    });
  }
  function bindPad() {
    document.querySelectorAll('#mergePad button').forEach(btn => {
      const dir = btn.dataset.act === 'left' ? -1 : 1;
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (playing) padDir = dir;
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => btn.addEventListener(type, () => {
        if (padDir === dir) padDir = 0;
      }));
      btn.addEventListener('contextmenu', e => e.preventDefault());
    });
  }

  window.MergeGame = {
    init(options) {
      onSuccess = options.onSuccess;
      document.querySelectorAll('.merge-goal').forEach(el => { el.textContent = KINGS_TO_WIN; });
      try { best = Number(localStorage.getItem(STORE_KEY)) || 0; } catch (e) { best = 0; }
      bindPointer();
      bindPad();
      window.addEventListener('blur', releaseControls);
      $('mergeStartBtn').addEventListener('click', start);
      $('mergeRetryBtn').addEventListener('click', start);
      $('mergeNextBtn').addEventListener('click', goToNext);
      $('mergeBackBtn').addEventListener('click', options.onBack);
      $('mergeOverBackBtn').addEventListener('click', options.onBack);
      // 안내 카드에 단계별 두더지 그림을 그린다
      document.querySelectorAll('canvas[data-tier]').forEach(c => {
        const tier = Number(c.dataset.tier);
        const g = c.getContext('2d');
        const scale = c.width / 2 / (TIERS[tier].r + 16);
        g.translate(c.width / 2, c.height / 2 + 4);
        g.scale(scale, scale);
        drawMole(g, 0, 0, tier);
      });
    },
    // 게임을 멈추고 안내 카드가 보이는 처음 상태로 돌린다.
    showIntro() {
      halt();
      resetRound();
      showCard('mergeIntroCard');
    },
    stop: halt,
    isPlaying() { return playing; },
    // main.js가 넘겨주는 키 입력. 처리했으면 true를 돌려준다.
    handleKey(e) {
      if (!playing) return false;
      if (!MOVE_KEYS[e.code]) return false;
      keyDir = MOVE_KEYS[e.code];
      return true;
    },
    handleKeyUp(e) {
      if (MOVE_KEYS[e.code] && keyDir === MOVE_KEYS[e.code]) keyDir = 0;
    },
  };
})();
