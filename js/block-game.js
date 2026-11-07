// 보너스 스테이지(블록 쌓기, 2단계): 10칸 × 20줄 canvas 게임판과 점수, 조작을 맡는다.
// 200점 이상이 되면 main.js가 넘겨준 onSuccess로 다음 단계에 넘어간다.
(function () {
  const PIECE_SCORE = 10, LINE_SCORE = 20; // 블록 하나가 놓일 때, 줄 하나를 지울 때 얻는 점수. 내리기에는 점수가 없다.
  const GOAL = 200;
  const AUTO_NEXT_MS = 3500;
  const COLS = 10, ROWS = 20, CELL = 40;
  const LINES_PER_LEVEL = 10;
  const LOCK_DELAY = 400, MAX_LOCK_RESETS = 12;
  const CLEAR_FLASH = 160;
  const REPEAT_DELAY = 170, REPEAT_EVERY = 60;
  const STORE_KEY = 'dudeoji-block-best';
  // 회전이 안정되도록 정사각형 행렬로 정의한다.
  const PIECES = {
    I: { color: '#c8743a', m: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]] },
    O: { color: '#e6b422', m: [[1, 1], [1, 1]] },
    T: { color: '#98a4b0', m: [[0, 1, 0], [1, 1, 1], [0, 0, 0]] },
    S: { color: '#7d9a3d', m: [[0, 1, 1], [1, 1, 0], [0, 0, 0]] },
    Z: { color: '#b5533a', m: [[1, 1, 0], [0, 1, 1], [0, 0, 0]] },
    J: { color: '#5a7ba0', m: [[1, 0, 0], [1, 1, 1], [0, 0, 0]] },
    L: { color: '#d9c08a', m: [[0, 0, 1], [1, 1, 1], [0, 0, 0]] },
  };
  const WALL_KICKS = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]];
  const KEY_ACTIONS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'soft',
    ArrowUp: 'rotate', KeyX: 'rotate', Space: 'drop',
  };
  const REPEATING = ['left', 'right', 'soft'];

  const $ = id => document.getElementById(id);
  const boardCtx = $('blockCanvas').getContext('2d');
  const nextCtx = $('blockNext').getContext('2d');
  let playing = false;
  let frameId = 0, lastFrame = 0, clock = 0;
  let grid = [], piece = null, nextKind = null, bag = [];
  let score = 0, lines = 0, best = 0;
  let dropAt = 0, lockAt = null, lockResets = 0, clearingRows = [], clearUntil = 0;
  let repeatDelayTimer = 0, repeatTimer = 0, autoNextTimer = 0;
  let onSuccess = () => {};

  const level = () => 1 + Math.floor(lines / LINES_PER_LEVEL);
  const dropDelay = () => Math.max(70, 800 * Math.pow(0.82, level() - 1));
  const emptyGrid = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));

  function takeKind() { // 7종류를 한 묶음으로 섞어 순서대로 꺼낸다
    if (!bag.length) {
      bag = Object.keys(PIECES);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  }
  function collides(m, x, y) {
    return m.some((row, r) => row.some((on, c) => {
      if (!on) return false;
      const gx = x + c, gy = y + r;
      return gx < 0 || gx >= COLS || gy >= ROWS || (gy >= 0 && grid[gy][gx]);
    }));
  }

  /* 블록 움직임 */
  function spawnPiece() {
    const { color, m } = PIECES[nextKind];
    nextKind = takeKind();
    const firstRow = m.findIndex(row => row.some(Boolean));
    piece = { color, m, x: Math.floor((COLS - m[0].length) / 2), y: -firstRow };
    dropAt = clock + dropDelay();
    lockAt = null;
    lockResets = 0;
    drawNext();
    if (collides(piece.m, piece.x, piece.y)) gameOver();
  }
  function isGrounded() { return collides(piece.m, piece.x, piece.y + 1); }
  function refreshLock() { // 바닥에서 움직이면 잠시 더 기회를 준다
    if (lockAt !== null && lockResets < MAX_LOCK_RESETS) {
      lockAt = clock + LOCK_DELAY;
      lockResets++;
    }
  }
  function move(dx) {
    if (!piece || collides(piece.m, piece.x + dx, piece.y)) return;
    piece.x += dx;
    refreshLock();
    GameSound.play('blockMove');
  }
  function rotate() {
    if (!piece) return;
    const n = piece.m.length;
    const turned = piece.m.map((row, r) => row.map((_, c) => piece.m[n - 1 - c][r]));
    const kick = WALL_KICKS.find(([dx, dy]) => !collides(turned, piece.x + dx, piece.y + dy));
    if (!kick) return;
    piece.m = turned;
    piece.x += kick[0];
    piece.y += kick[1];
    refreshLock();
    GameSound.play('blockRotate');
  }
  function softDrop() {
    if (!piece || isGrounded()) return;
    piece.y++;
    dropAt = clock + dropDelay();
  }
  function hardDrop() {
    if (!piece) return;
    while (!isGrounded()) piece.y++;
    GameSound.play('blockDrop');
    lockPiece();
  }
  function lockPiece() {
    let overflow = false;
    piece.m.forEach((row, r) => row.forEach((on, c) => {
      if (!on) return;
      if (piece.y + r < 0) overflow = true;
      else grid[piece.y + r][piece.x + c] = piece.color;
    }));
    piece = null;
    clearingRows = grid.map((row, r) => (row.every(Boolean) ? r : -1)).filter(r => r >= 0);
    score += PIECE_SCORE + clearingRows.length * LINE_SCORE;
    renderStats();
    if (clearingRows.length) {
      clearUntil = clock + CLEAR_FLASH;
      GameSound.play('blockLine');
    }
    if (score >= GOAL) { succeed(); return; }
    if (overflow) { gameOver(); return; }
    if (!clearingRows.length) {
      GameSound.play('blockLock');
      spawnPiece();
    }
  }
  function removeClearedRows() {
    clearingRows.forEach(r => { // 위에서 아래 순서라 남은 줄 번호가 밀리지 않는다
      grid.splice(r, 1);
      grid.unshift(Array(COLS).fill(null));
    });
    lines += clearingRows.length;
    clearingRows = [];
  }
  function finishClear() {
    const before = level();
    removeClearedRows();
    if (level() > before) GameSound.play('blockLevel');
    renderStats();
    spawnPiece();
  }
  const ACTIONS = { left: () => move(-1), right: () => move(1), soft: softDrop, rotate, drop: hardDrop };

  /* 그리기 */
  function drawCell(ctx, x, y, size, color) {
    const pad = size * 0.04;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + size * 0.2, y + pad);
    ctx.arcTo(x + size - pad, y + pad, x + size - pad, y + size - pad, size * 0.16);
    ctx.arcTo(x + size - pad, y + size - pad, x + pad, y + size - pad, size * 0.16);
    ctx.arcTo(x + pad, y + size - pad, x + pad, y + pad, size * 0.16);
    ctx.arcTo(x + pad, y + pad, x + size - pad, y + pad, size * 0.16);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillRect(x + size * 0.16, y + size * 0.14, size * 0.68, size * 0.1);
    ctx.fillStyle = 'rgba(43,26,16,.35)'; // 흙덩이 속 자갈
    [[0.3, 0.5, 0.07], [0.66, 0.42, 0.05], [0.52, 0.72, 0.08]].forEach(([px, py, r]) => {
      ctx.beginPath();
      ctx.arc(x + size * px, y + size * py, size * r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  function forEachCell(m, fn) {
    m.forEach((row, r) => row.forEach((on, c) => { if (on) fn(r, c); }));
  }
  function drawBoard() {
    boardCtx.fillStyle = '#24150b';
    boardCtx.fillRect(0, 0, COLS * CELL, ROWS * CELL);
    boardCtx.fillStyle = 'rgba(255,235,200,.06)';
    for (let c = 1; c < COLS; c++) boardCtx.fillRect(c * CELL, 0, 1, ROWS * CELL);
    for (let r = 1; r < ROWS; r++) boardCtx.fillRect(0, r * CELL, COLS * CELL, 1);
    grid.forEach((row, r) => row.forEach((color, c) => {
      if (color) drawCell(boardCtx, c * CELL, r * CELL, CELL, clearingRows.includes(r) ? '#fff8e6' : color);
    }));
    if (!piece) return;
    let ghostY = piece.y;
    while (!collides(piece.m, piece.x, ghostY + 1)) ghostY++;
    boardCtx.globalAlpha = 0.28; // 떨어질 자리 그림자
    forEachCell(piece.m, (r, c) => drawCell(boardCtx, (piece.x + c) * CELL, (ghostY + r) * CELL, CELL, piece.color));
    boardCtx.globalAlpha = 1;
    forEachCell(piece.m, (r, c) => drawCell(boardCtx, (piece.x + c) * CELL, (piece.y + r) * CELL, CELL, piece.color));
  }
  function drawNext() {
    nextCtx.clearRect(0, 0, 96, 96);
    if (!nextKind) return;
    const { color, m } = PIECES[nextKind];
    const size = 22;
    const rows = m.map((row, r) => (row.some(Boolean) ? r : -1)).filter(r => r >= 0);
    const cols = m[0].map((_, c) => (m.some(row => row[c]) ? c : -1)).filter(c => c >= 0);
    const left = (96 - cols.length * size) / 2 - cols[0] * size;
    const top = (96 - rows.length * size) / 2 - rows[0] * size;
    forEachCell(m, (r, c) => drawCell(nextCtx, left + c * size, top + r * size, size, color));
  }
  function renderStats() {
    $('blockScore').textContent = score;
    $('blockLines').textContent = lines;
    $('blockLevel').textContent = level();
  }

  /* 진행 */
  function update() {
    if (clearingRows.length) {
      if (clock >= clearUntil) finishClear();
      return;
    }
    if (!piece) return;
    if (isGrounded()) {
      if (lockAt === null) lockAt = clock + LOCK_DELAY;
      if (clock >= lockAt) lockPiece();
    } else {
      lockAt = null;
      if (clock >= dropAt) {
        piece.y++;
        dropAt = clock + dropDelay();
      }
    }
  }
  function frame(now) {
    clock += Math.min(now - lastFrame, 100); // 탭을 벗어나면 시간도 멈춘다
    lastFrame = now;
    update();
    if (!playing) return;
    drawBoard();
    frameId = requestAnimationFrame(frame);
  }
  function stopRepeat() {
    clearTimeout(repeatDelayTimer);
    clearInterval(repeatTimer);
  }
  function halt() {
    playing = false;
    cancelAnimationFrame(frameId);
    clearTimeout(autoNextTimer);
    stopRepeat();
  }
  function showCard(id) {
    ['blockIntroCard', 'blockSuccessCard', 'blockOverCard'].forEach(card => { $(card).hidden = card !== id; });
    if (id) $(id).querySelector('button').focus({ preventScroll: true });
  }
  function resetBoard() {
    grid = emptyGrid();
    bag = [];
    piece = null;
    nextKind = null;
    clearingRows = [];
    score = lines = 0;
    clock = 0;
    renderStats();
    drawBoard();
    drawNext();
  }
  function start() {
    halt();
    resetBoard();
    nextKind = takeKind();
    showCard(null);
    playing = true;
    GameSound.play('start');
    spawnPiece();
    if (!playing) return;
    lastFrame = performance.now();
    frameId = requestAnimationFrame(frame);
  }
  function saveBest() {
    if (score <= best) return;
    best = score;
    try { localStorage.setItem(STORE_KEY, String(best)); } catch (e) { /* 이번 실행에서만 유지된다 */ }
  }
  function succeed() {
    halt();
    removeClearedRows();
    piece = null;
    renderStats();
    drawBoard();
    saveBest();
    $('blockSuccessLines').textContent = lines;
    showCard('blockSuccessCard');
    GameSound.play('fanfare');
    gainAlly('shield');
    autoNextTimer = setTimeout(goToNext, AUTO_NEXT_MS);
  }
  function goToNext() {
    clearTimeout(autoNextTimer);
    onSuccess(score);
  }
  function gameOver() {
    halt();
    drawBoard();
    saveBest();
    $('blockFinalScore').textContent = score;
    $('blockFinalLines').textContent = lines;
    $('blockFinalLevel').textContent = level();
    $('blockBest').textContent = best;
    showCard('blockOverCard');
    GameSound.play('blockOver');
  }
  function bindPad() {
    document.querySelectorAll('#blockPad button').forEach(btn => {
      const name = btn.dataset.act;
      const act = () => { if (playing) ACTIONS[name](); };
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        stopRepeat();
        act();
        if (REPEATING.includes(name)) {
          repeatDelayTimer = setTimeout(() => { repeatTimer = setInterval(act, REPEAT_EVERY); }, REPEAT_DELAY);
        }
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => btn.addEventListener(type, stopRepeat));
      btn.addEventListener('contextmenu', e => e.preventDefault());
    });
  }

  window.BlockGame = {
    init(options) {
      onSuccess = options.onSuccess;
      try { best = Number(localStorage.getItem(STORE_KEY)) || 0; } catch (e) { best = 0; }
      bindPad();
      $('blockNextBtn').addEventListener('click', goToNext);
      $('blockStartBtn').addEventListener('click', start);
      $('blockRetryBtn').addEventListener('click', start);
      $('blockBackBtn').addEventListener('click', options.onBack);
      $('blockOverBackBtn').addEventListener('click', options.onBack);
    },
    // 게임을 멈추고 안내 카드가 보이는 처음 상태로 돌린다.
    showIntro() {
      halt();
      resetBoard();
      showCard('blockIntroCard');
    },
    stop: halt,
    isPlaying() { return playing; },
    // main.js가 넘겨주는 키 입력. 처리했으면 true를 돌려준다.
    handleKey(e) {
      const name = KEY_ACTIONS[e.code];
      if (!playing || !name) return false;
      if (!e.repeat || REPEATING.includes(name)) ACTIONS[name]();
      return true;
    },
  };
})();
