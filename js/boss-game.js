// 보스 두더지(4단계): 맵을 돌아다니며 칼, 활, 방패를 주워 왕관 쓴 보스를 처치한다.
// 처치하면 main.js가 넘겨준 onSuccess로 지구 지키기에 넘어간다.
(function () {
  const AUTO_NEXT_MS = 3500;
  const SWORD_DMG = 40, ARROW_DMG = 15, HAND_DMG = 5; // 보스와 부하 모두에게 같은 데미지. 안내 카드 문구도 함께 바뀐다.
  const SHIELD_TIME = 4; // 방패 지속 시간(초). 안내 카드 문구도 함께 바뀐다.
  const SHIELD_WARN_MS = 2000, SHIELD_BLINK_MS = 120; // 끝나기 전에 방패 고리가 깜빡이는 구간
  const BOSS_MAX_HP = 1000, RAGE_HP = 500;
  const W = 400, H = 480; // 그리기와 계산에 쓰는 논리 크기
  const PLAYER_R = 13, PLAYER_SPEED = 175;
  const MAX_HEARTS = 5, INVINCIBLE_MS = 1000, BLOCK_GUARD_MS = 400;
  const ARROWS_PER_PICKUP = 10, ARROW_SPEED = 430;
  const WEAPONS = {
    hand: { label: '맨손', damage: HAND_DMG, reach: 26, cooldown: 280, sound: 'fistSwing' },
    sword: { label: '칼', damage: SWORD_DMG, reach: 44, cooldown: 380, sound: 'swordSwing' },
    bow: { label: '활', damage: ARROW_DMG, cooldown: 300, sound: 'bowShoot' },
  };
  const BOSS_R = 44, BOSS_SPEED = 62, CHARGE_SPEED = 360, ROCK_SPEED = 230, ROCK_R = 8;
  const SLAM_R = 118;
  const HOLES = [[72, 92], [200, 70], [328, 92], [84, 250], [316, 250], [72, 408], [328, 408], [200, 240]];
  const SUMMON_WARN_MS = 600, MAX_MINIONS = 4, MINION_HP = 15, MINION_R = 10, MINION_SPEED = 52;
  const BOMB_R = 34, BOMB_FALL_MS = 1000;
  const HEAL_BELOW_HP = 800, HEAL_COOLDOWN_MS = 12000, HEAL_TICK_MS = 500, HEAL_TICK = 25, HEAL_MAX = 150;
  // 기술 이름과 뽑힐 가중치. 지금 쓸 수 없는 기술은 canUse에서 걸러진다.
  const ATTACKS = [
    ['throw', 28], ['charge', 18], ['slam', 18], ['hide', 12],
    ['summon', 14], ['bombs', 16], ['heal', 14],
  ];
  const MOVE_KEYS = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  };
  const ATTACK_KEYS = ['Space', 'KeyJ'];

  const $ = id => document.getElementById(id);
  const canvas = $('bossCanvas');
  const ctx = canvas.getContext('2d');
  ctx.scale(canvas.width / W, canvas.height / H);

  let playing = false;
  let frameId = 0, lastFrame = 0, clock = 0;
  let player, boss, items, rocks, shots, floats, minions, bombs, blasts;
  let healReadyAt = 0;
  let hearts = MAX_HEARTS, weapon = 'hand', arrowsLeft = 0, shieldUntil = 0;
  let invincibleUntil = 0, hurtUntil = 0, attackReadyAt = 0;
  let swingUntil = 0, blockFxUntil = 0, shockUntil = 0, nextHeartAt = 0;
  let moves = { up: false, down: false, left: false, right: false };
  let attackHeld = false;
  let autoNextTimer = 0;
  let onSuccess = () => {};

  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const raging = () => boss.hp < RAGE_HP;
  const isTargetable = () => !['dive', 'hidden', 'emerge'].includes(boss.state);

  /* 아이템 */
  function openSpot() {
    let spot = null;
    for (let i = 0; i < 20; i++) {
      spot = { x: rand(26, W - 26), y: rand(26, H - 26) };
      if (dist(spot, player) >= 80 && items.every(item => !item.active || dist(spot, item) >= 44)) break;
    }
    return spot;
  }
  function placeItem(item) {
    Object.assign(item, openSpot(), { active: true });
  }
  function pickUp(item) {
    item.active = false;
    item.respawnAt = clock + rand(3000, 6000);
    if (item.type === 'sword') weapon = 'sword';
    if (item.type === 'bow') {
      weapon = 'bow';
      arrowsLeft += ARROWS_PER_PICKUP;
    }
    if (item.type === 'shield') shieldUntil = clock + SHIELD_TIME * 1000;
    if (item.type === 'heart') {
      hearts++;
      item.respawnAt = Infinity;
      nextHeartAt = clock + rand(15000, 22000);
    }
    GameSound.play('blockRotate');
    renderStats();
  }
  function updateItems() {
    items.forEach(item => {
      if (!item.active) {
        if (clock >= item.respawnAt) placeItem(item);
        return;
      }
      if (item.type === 'heart' && hearts >= MAX_HEARTS) return; // 하트가 가득 차면 그대로 둔다
      if (dist(item, player) < PLAYER_R + 14) pickUp(item);
    });
    const heart = items.find(item => item.type === 'heart');
    if (!heart.active && clock >= nextHeartAt) {
      nextHeartAt = Infinity;
      placeItem(heart);
    }
  }

  /* 플레이어 */
  function movePlayer(sec) {
    const dx = (moves.right ? 1 : 0) - (moves.left ? 1 : 0);
    const dy = (moves.down ? 1 : 0) - (moves.up ? 1 : 0);
    if (!dx && !dy) return;
    const len = Math.hypot(dx, dy); // 대각선이 더 빠르지 않게 한다
    player.faceX = dx / len;
    player.faceY = dy / len;
    player.x = clamp(player.x + player.faceX * PLAYER_SPEED * sec, PLAYER_R, W - PLAYER_R);
    player.y = clamp(player.y + player.faceY * PLAYER_SPEED * sec, PLAYER_R, H - PLAYER_R);
  }
  function attack() {
    if (clock < attackReadyAt) return;
    const info = WEAPONS[weapon];
    attackReadyAt = clock + info.cooldown;
    GameSound.play(info.sound);
    if (weapon === 'bow') {
      shots.push({
        x: player.x + player.faceX * PLAYER_R,
        y: player.y + player.faceY * PLAYER_R,
        vx: player.faceX * ARROW_SPEED,
        vy: player.faceY * ARROW_SPEED,
      });
      arrowsLeft--;
      if (!arrowsLeft) weapon = 'hand';
      renderStats();
      return;
    }
    swingUntil = clock + 140;
    minions.filter(m => dist(player, m) <= MINION_R + info.reach).forEach(m => damageMinion(m, info.damage));
    if (isTargetable() && dist(player, boss) <= BOSS_R + info.reach) damageBoss(info.damage);
  }
  function updateShots(sec) {
    shots = shots.filter(shot => {
      shot.x += shot.vx * sec;
      shot.y += shot.vy * sec;
      const minion = minions.find(m => dist(shot, m) < MINION_R + 4);
      if (minion) {
        damageMinion(minion, WEAPONS.bow.damage);
        return false;
      }
      if (isTargetable() && dist(shot, boss) < BOSS_R) {
        damageBoss(WEAPONS.bow.damage);
        return false;
      }
      return shot.x > -10 && shot.x < W + 10 && shot.y > -10 && shot.y < H + 10;
    });
  }
  function takeHit() {
    if (clock < invincibleUntil) return;
    if (clock < shieldUntil) {
      invincibleUntil = clock + BLOCK_GUARD_MS;
      blockFxUntil = clock + 320;
      addFloat(player.x, player.y - 24, '막음!', '#bfe3ff');
      GameSound.play('shieldBlock');
      return;
    }
    hearts--;
    invincibleUntil = hurtUntil = clock + INVINCIBLE_MS;
    GameSound.play('arrowHit');
    renderStats();
    if (hearts <= 0) lose();
  }

  /* 보스 */
  function damageBoss(amount) {
    const wasCalm = !raging();
    boss.hp = Math.max(0, boss.hp - amount);
    boss.flashUntil = clock + 110;
    addFloat(boss.x + rand(-18, 18), boss.y - BOSS_R - 8, String(amount), '#fff');
    GameSound.play('bossHit');
    renderStats();
    if (boss.hp === 0) { win(); return; }
    if (boss.state === 'heal') {
      addFloat(boss.x, boss.y - BOSS_R - 30, '회복 취소!', '#ff9d8f');
      stopHeal();
    }
    if (wasCalm && raging()) {
      addFloat(boss.x, boss.y - BOSS_R - 28, '분노!', '#ff9d8f');
      GameSound.play('bossRage');
    }
  }
  function canUse(name) {
    if (name === 'summon') return minions.length < MAX_MINIONS;
    if (name === 'bombs') return !bombs.length;
    if (name === 'heal') return boss.hp < HEAL_BELOW_HP && clock >= healReadyAt;
    return true;
  }
  function chooseAttack() {
    const usable = ATTACKS.filter(([name]) => canUse(name));
    let roll = rand(0, usable.reduce((sum, [, weight]) => sum + weight, 0));
    for (const [name, weight] of usable) {
      roll -= weight;
      if (roll <= 0) return name;
    }
    return 'throw';
  }
  function endAttack() {
    boss.state = 'roam';
    boss.nextAttack = clock + rand(1400, 2400) * (raging() ? 0.55 : 1);
  }
  function spawnMinions() {
    const count = Math.min(raging() ? 3 : 2, MAX_MINIONS - minions.length);
    const free = HOLES.slice();
    for (let i = 0; i < count; i++) {
      const [[x, y]] = free.splice(Math.floor(Math.random() * free.length), 1);
      minions.push({ x, y, hp: MINION_HP, born: clock, flashUntil: 0 });
    }
    GameSound.play('fistSwing');
  }
  function dropBombs() {
    const count = raging() ? 6 : 4;
    const fallsAt = clock + BOMB_FALL_MS;
    bombs = [{ x: player.x, y: player.y, start: clock, at: fallsAt }]; // 1곳은 반드시 플레이어 자리
    while (bombs.length < count) {
      let spot = null;
      for (let i = 0; i < 20; i++) {
        spot = { x: rand(BOMB_R, W - BOMB_R), y: rand(BOMB_R, H - BOMB_R) };
        if (bombs.every(bomb => dist(spot, bomb) >= BOMB_R * 2)) break;
      }
      bombs.push({ x: spot.x, y: spot.y, start: clock, at: fallsAt });
    }
    GameSound.play('bombFall');
  }
  function stopHeal() {
    healReadyAt = clock + HEAL_COOLDOWN_MS;
    endAttack();
  }
  function startAttack(name = chooseAttack()) {
    const haste = raging() ? 0.75 : 1;
    if (name === 'summon') {
      boss.state = 'summonWarn';
      boss.until = clock + SUMMON_WARN_MS;
      addFloat(boss.x, boss.y - BOSS_R - 30, '부하 소환!', '#d9b3ff');
      GameSound.play('summon');
    } else if (name === 'bombs') {
      dropBombs();
      endAttack();
    } else if (name === 'heal') {
      boss.state = 'heal';
      boss.healed = 0;
      boss.healNext = clock + HEAL_TICK_MS;
    } else if (name === 'throw') {
      const len = Math.max(dist(player, boss), 1);
      const speed = ROCK_SPEED * (raging() ? 1.3 : 1);
      rocks.push({
        x: boss.x, y: boss.y,
        vx: (player.x - boss.x) / len * speed,
        vy: (player.y - boss.y) / len * speed,
      });
      GameSound.play('fistSwing');
      endAttack();
    } else if (name === 'charge') {
      boss.state = 'chargeWarn';
      boss.until = clock + 700 * haste;
    } else if (name === 'slam') {
      boss.state = 'slamWarn';
      boss.warnStart = clock;
      boss.until = clock + 900 * haste;
    } else {
      boss.state = 'dive';
      boss.until = clock + 350;
    }
  }
  function moveBoss(dx, dy, sec) {
    boss.x = clamp(boss.x + dx * sec, BOSS_R, W - BOSS_R);
    boss.y = clamp(boss.y + dy * sec, BOSS_R, H - BOSS_R);
  }
  function updateBoss(sec) {
    if (boss.state === 'roam') {
      const len = dist(boss.target, boss);
      if (len < 6) {
        const [x, y] = HOLES[Math.floor(Math.random() * HOLES.length)];
        boss.target = { x: clamp(x + rand(-30, 30), BOSS_R, W - BOSS_R), y: clamp(y + rand(-30, 30), BOSS_R, H - BOSS_R) };
      } else {
        const speed = BOSS_SPEED * (raging() ? 1.6 : 1);
        moveBoss((boss.target.x - boss.x) / len * speed, (boss.target.y - boss.y) / len * speed, sec);
      }
      if (clock >= boss.nextAttack) startAttack();
    } else if (boss.state === 'chargeWarn') {
      if (clock >= boss.until) {
        const len = Math.max(dist(player, boss), 1);
        const speed = CHARGE_SPEED * (raging() ? 1.25 : 1);
        boss.vx = (player.x - boss.x) / len * speed;
        boss.vy = (player.y - boss.y) / len * speed;
        boss.state = 'charge';
        boss.until = clock + 850;
        GameSound.play('blockDrop');
      }
    } else if (boss.state === 'charge') {
      const beforeX = boss.x, beforeY = boss.y;
      moveBoss(boss.vx, boss.vy, sec);
      // 그림보다 살짝 작게 판정한다.
      if (dist(player, boss) < BOSS_R + PLAYER_R - 8) takeHit();
      const stuck = Math.abs(boss.x - beforeX) + Math.abs(boss.y - beforeY) < 1;
      if (clock >= boss.until || stuck) endAttack();
    } else if (boss.state === 'slamWarn') {
      if (clock >= boss.until) {
        shockUntil = clock + 260;
        GameSound.play('fake');
        if (dist(player, boss) < SLAM_R) takeHit();
        if (playing) endAttack();
      }
    } else if (boss.state === 'dive') {
      if (clock >= boss.until) {
        boss.state = 'hidden';
        boss.until = clock + rand(1200, 2000);
      }
    } else if (boss.state === 'hidden') {
      if (clock >= boss.until) {
        const others = HOLES.filter(([x, y]) => Math.hypot(x - boss.x, y - boss.y) > 60);
        const [x, y] = others[Math.floor(Math.random() * others.length)];
        boss.x = clamp(x, BOSS_R, W - BOSS_R);
        boss.y = clamp(y, BOSS_R, H - BOSS_R);
        boss.target = { x: boss.x, y: boss.y };
        boss.state = 'emerge';
        boss.until = clock + 350;
        GameSound.play('fistSwing');
      }
    } else if (boss.state === 'emerge') {
      if (clock >= boss.until) endAttack();
    } else if (boss.state === 'summonWarn') {
      if (clock >= boss.until) {
        spawnMinions();
        endAttack();
      }
    } else if (boss.state === 'heal') {
      if (clock >= boss.healNext) {
        boss.hp = Math.min(BOSS_MAX_HP, boss.hp + HEAL_TICK);
        boss.healed += HEAL_TICK;
        boss.healNext += HEAL_TICK_MS;
        addFloat(boss.x + rand(-18, 18), boss.y - BOSS_R - 8, `+${HEAL_TICK}`, '#8dffa0');
        GameSound.play('bossHeal');
        renderStats();
        if (boss.healed >= HEAL_MAX) stopHeal();
      }
    }
  }
  function damageMinion(minion, amount) {
    minion.hp -= amount;
    minion.flashUntil = clock + 110;
    addFloat(minion.x, minion.y - MINION_R - 6, String(amount), '#fff');
    GameSound.play('bossHit');
    if (minion.hp <= 0) minions = minions.filter(m => m !== minion);
  }
  function updateMinions(sec) {
    const speed = MINION_SPEED * (raging() ? 1.3 : 1);
    minions = minions.filter(m => {
      const len = Math.max(dist(player, m), 1);
      m.x += (player.x - m.x) / len * speed * sec;
      m.y += (player.y - m.y) / len * speed * sec;
      // 무적일 때 닿으면 부하도 그대로 남는다.
      if (playing && len < MINION_R + PLAYER_R - 3 && clock >= invincibleUntil) {
        takeHit();
        return false;
      }
      return true;
    });
  }
  function updateBombs() {
    const landed = bombs.filter(bomb => clock >= bomb.at);
    if (!landed.length) return;
    bombs = bombs.filter(bomb => clock < bomb.at);
    landed.forEach(bomb => blasts.push({ x: bomb.x, y: bomb.y, until: clock + 300 }));
    GameSound.play('fake');
    if (landed.some(bomb => dist(bomb, player) < BOMB_R)) takeHit();
  }
  function updateRocks(sec) {
    rocks = rocks.filter(rock => {
      rock.x += rock.vx * sec;
      rock.y += rock.vy * sec;
      if (dist(rock, player) < ROCK_R + PLAYER_R - 3) {
        takeHit();
        return false;
      }
      return rock.x > -12 && rock.x < W + 12 && rock.y > -12 && rock.y < H + 12;
    });
  }
  function addFloat(x, y, text, color) {
    floats.push({ x, y, text, color, until: clock + 750 });
  }

  /* 진행 */
  function update(sec) {
    movePlayer(sec);
    updateItems();
    if (attackHeld) attack();
    if (!playing) return;
    updateShots(sec);
    if (!playing) return;
    updateBoss(sec);
    if (!playing) return;
    updateRocks(sec);
    if (!playing) return;
    updateMinions(sec);
    if (!playing) return;
    updateBombs();
    blasts = blasts.filter(blast => clock < blast.until);
    floats = floats.filter(f => clock < f.until);
  }
  function frame(now) {
    const dt = Math.min(now - lastFrame, 100); // 탭을 벗어나면 시간도 멈춘다
    lastFrame = now;
    clock += dt;
    update(dt / 1000);
    if (!playing) return;
    renderShield();
    draw();
    frameId = requestAnimationFrame(frame);
  }

  /* 그리기 */
  function drawMap() {
    ctx.fillStyle = '#74b84c';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#65a941';
    for (let x = 0; x < W; x += 80) ctx.fillRect(x, 0, 40, H);
    HOLES.forEach(([x, y]) => {
      ctx.fillStyle = '#7a5230';
      ctx.beginPath();
      ctx.ellipse(x, y, 25, 17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a0e07';
      ctx.beginPath();
      ctx.ellipse(x, y, 19, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // 아이템 그림은 24×24 칸 기준이다. 맵과 안내 카드에서 함께 쓴다.
  function drawItemIcon(c, type) {
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (type === 'sword') {
      c.strokeStyle = '#2b1a10';
      c.lineWidth = 6;
      c.beginPath(); c.moveTo(5, 19); c.lineTo(20, 4); c.stroke();
      c.strokeStyle = '#dfe7ee';
      c.lineWidth = 3.5;
      c.beginPath(); c.moveTo(8, 16); c.lineTo(20, 4); c.stroke();
      c.strokeStyle = '#8a5a35';
      c.lineWidth = 3.5;
      c.beginPath(); c.moveTo(4, 20); c.lineTo(8, 16); c.stroke();
      c.strokeStyle = '#e6b422';
      c.beginPath(); c.moveTo(5, 12); c.lineTo(12, 19); c.stroke();
    } else if (type === 'bow') {
      c.strokeStyle = '#6b4526';
      c.lineWidth = 3;
      c.beginPath(); c.arc(7, 12, 11, -1.1, 1.1); c.stroke();
      c.strokeStyle = '#fff8e6';
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(12, 2.200); c.lineTo(12, 21.800); c.stroke();
      c.strokeStyle = '#2b1a10';
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(3, 12); c.lineTo(21, 12); c.stroke();
      c.beginPath(); c.moveTo(21, 12); c.lineTo(17, 9); c.moveTo(21, 12); c.lineTo(17, 15); c.stroke();
    } else if (type === 'shield') {
      c.fillStyle = '#3f7fd0';
      c.strokeStyle = '#2b1a10';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(12, 2); c.lineTo(21, 5); c.lineTo(21, 12);
      c.quadraticCurveTo(20, 19, 12, 23);
      c.quadraticCurveTo(4, 19, 3, 12);
      c.lineTo(3, 5); c.closePath();
      c.fill(); c.stroke();
      c.strokeStyle = '#fff8e6';
      c.beginPath(); c.moveTo(12, 6); c.lineTo(12, 18); c.moveTo(7, 11); c.lineTo(17, 11); c.stroke();
    } else {
      c.fillStyle = '#ff5c74';
      c.strokeStyle = '#2b1a10';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(12, 22);
      c.bezierCurveTo(-2, 12, 5, 1, 12, 8);
      c.bezierCurveTo(19, 1, 26, 12, 12, 22);
      c.fill(); c.stroke();
    }
  }
  function drawItems() {
    items.forEach(item => {
      if (!item.active) return;
      const bob = Math.sin(clock / 240 + item.x) * 2;
      ctx.fillStyle = 'rgba(255,248,230,.75)';
      ctx.beginPath();
      ctx.arc(item.x, item.y + bob, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(item.x - 12, item.y - 12 + bob);
      drawItemIcon(ctx, item.type);
      ctx.restore();
    });
  }
  function drawBoss() {
    if (boss.state === 'hidden') return;
    let scale = 1;
    if (boss.state === 'dive') scale = clamp((boss.until - clock) / 350, 0.05, 1);
    if (boss.state === 'emerge') scale = clamp(1 - (boss.until - clock) / 350, 0.05, 1);
    const flash = clock < boss.flashUntil;
    const warnColor = { chargeWarn: '#e2202a', summonWarn: '#9b4de0' }[boss.state];
    const warn = warnColor && Math.floor(clock / 90) % 2 === 0;
    const paint = color => (flash ? '#ffffff' : warn ? warnColor : color);
    const fur = raging() ? '#8c3d2a' : '#6f4527';

    ctx.save();
    ctx.translate(boss.x, boss.y);
    ctx.scale(scale, scale);
    if (boss.state === 'heal') { // 회복 중에는 초록빛에 싸인다
      const glow = BOSS_R + 12 + Math.sin(clock / 120) * 4;
      ctx.fillStyle = 'rgba(100,240,130,.38)';
      ctx.strokeStyle = '#6cf08a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, glow, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.strokeStyle = '#2b1a10';
    ctx.lineWidth = 3;
    ctx.fillStyle = paint(fur);
    ctx.beginPath();
    ctx.arc(0, 0, BOSS_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = paint('#d9b48a');
    ctx.beginPath();
    ctx.ellipse(0, 14, 25, 19, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = paint('#1c120c');
    [-16, 16].forEach(x => {
      ctx.beginPath();
      ctx.arc(x, -8, 6, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.strokeStyle = paint('#1c120c');
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-27, -20); ctx.lineTo(-9, -14);
    ctx.moveTo(27, -20); ctx.lineTo(9, -14);
    ctx.stroke();
    ctx.fillStyle = paint('#e8788a');
    ctx.beginPath();
    ctx.ellipse(0, 5, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = paint('#ffffff');
    ctx.strokeStyle = '#2b1a10';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-12, 16); ctx.lineTo(12, 16); ctx.lineTo(6, 28); ctx.lineTo(0, 18); ctx.lineTo(-6, 28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 왕관
    ctx.fillStyle = paint('#ffc22e');
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-26, -32); ctx.lineTo(-30, -60); ctx.lineTo(-14, -46); ctx.lineTo(0, -66);
    ctx.lineTo(14, -46); ctx.lineTo(30, -60); ctx.lineTo(26, -32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = paint('#e2202a');
    ctx.beginPath();
    ctx.arc(0, -42, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function drawMinions() {
    minions.forEach(m => {
      const grow = clamp((clock - m.born) / 250, 0.2, 1);
      const flash = clock < m.flashUntil;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.scale(grow, grow);
      ctx.fillStyle = flash ? '#ffffff' : '#6b5488';
      ctx.strokeStyle = '#2b1a10';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, MINION_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1c120c';
      [-4, 4].forEach(dx => {
        ctx.beginPath();
        ctx.arc(dx, -1, 1.8, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-7, -6); ctx.lineTo(-2, -4);
      ctx.moveTo(7, -6); ctx.lineTo(2, -4);
      ctx.stroke();
      ctx.fillStyle = '#e8788a';
      ctx.beginPath();
      ctx.ellipse(0, 3, 2.5, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
  function drawBombShadows() { // 떨어질 때가 가까울수록 진해진다
    bombs.forEach(bomb => {
      const t = clamp((clock - bomb.start) / (bomb.at - bomb.start), 0, 1);
      ctx.fillStyle = `rgba(30,18,10,${0.12 + t * 0.48})`;
      ctx.beginPath();
      ctx.arc(bomb.x, bomb.y, BOMB_R, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  function drawBombsFalling() {
    bombs.forEach(bomb => {
      const t = clamp((clock - bomb.start) / (bomb.at - bomb.start), 0, 1);
      if (t < 0.4) return;
      const y = bomb.y - (1 - t) / 0.6 * 150;
      ctx.fillStyle = '#6b4526';
      ctx.strokeStyle = '#2b1a10';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bomb.x, y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    blasts.forEach(blast => {
      const life = clamp((blast.until - clock) / 300, 0, 1);
      ctx.fillStyle = `rgba(107,69,38,${life * 0.75})`;
      ctx.strokeStyle = `rgba(255,248,230,${life})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(blast.x, blast.y, BOMB_R * (1.1 - life * 0.4), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }
  function drawSlamWarning() {
    if (boss.state === 'slamWarn') {
      const t = clamp((clock - boss.warnStart) / (boss.until - boss.warnStart), 0, 1);
      ctx.fillStyle = 'rgba(226,32,42,.22)';
      ctx.strokeStyle = '#e2202a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, SLAM_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(226,32,42,.35)';
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, SLAM_R * t, 0, Math.PI * 2);
      ctx.fill();
    }
    if (clock < shockUntil) {
      ctx.strokeStyle = 'rgba(255,248,230,.9)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, SLAM_R * (1 - (shockUntil - clock) / 520), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  function drawPlayer() {
    const x = player.x, y = player.y;
    const blink = clock < hurtUntil && Math.floor(clock / 90) % 2;
    if (!blink) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#2b1a10';
      ctx.fillStyle = '#a06c3f';
      ctx.beginPath();
      ctx.arc(x, y, PLAYER_R + 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e8c9a0';
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 8, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1c120c';
      [-5, 5].forEach(dx => {
        ctx.beginPath();
        ctx.arc(x + dx, y - 3, 2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#e8788a';
      ctx.beginPath();
      ctx.ellipse(x, y + 2, 3, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      // 바라보는 방향 표시
      const tipX = x + player.faceX * (PLAYER_R + 9), tipY = y + player.faceY * (PLAYER_R + 9);
      ctx.fillStyle = '#fff8e6';
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(x + player.faceX * (PLAYER_R + 3) - player.faceY * 4, y + player.faceY * (PLAYER_R + 3) + player.faceX * 4);
      ctx.lineTo(x + player.faceX * (PLAYER_R + 3) + player.faceY * 4, y + player.faceY * (PLAYER_R + 3) - player.faceX * 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    const shieldLeft = shieldUntil - clock;
    const shieldBlinkOff = shieldLeft < SHIELD_WARN_MS && Math.floor(clock / SHIELD_BLINK_MS) % 2;
    if (shieldLeft > 0 && !shieldBlinkOff) {
      ctx.strokeStyle = 'rgba(63,127,208,.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, PLAYER_R + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (clock < blockFxUntil) {
      ctx.strokeStyle = '#bfe3ff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(x, y, PLAYER_R + 6 + (320 - (blockFxUntil - clock)) / 12, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (clock < swingUntil) {
      const angle = Math.atan2(player.faceY, player.faceX);
      ctx.strokeStyle = weapon === 'sword' ? '#fff8e6' : '#e8c9a0';
      ctx.lineWidth = weapon === 'sword' ? 7 : 5;
      ctx.beginPath();
      ctx.arc(x, y, PLAYER_R + (weapon === 'sword' ? 26 : 12), angle - 0.9, angle + 0.9);
      ctx.stroke();
    }
  }
  function drawProjectiles() {
    rocks.forEach(rock => {
      ctx.fillStyle = '#7f8a8c';
      ctx.strokeStyle = '#2b1a10';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rock.x, rock.y, ROCK_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.strokeStyle = '#2b1a10';
    ctx.lineWidth = 3;
    shots.forEach(shot => {
      const len = Math.hypot(shot.vx, shot.vy);
      ctx.beginPath();
      ctx.moveTo(shot.x, shot.y);
      ctx.lineTo(shot.x - shot.vx / len * 18, shot.y - shot.vy / len * 18);
      ctx.stroke();
    });
  }
  function drawFloats() {
    ctx.font = '700 20px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#2b1a10';
    floats.forEach(f => {
      const life = (f.until - clock) / 750;
      const y = f.y - (1 - life) * 28;
      ctx.globalAlpha = clamp(life * 1.6, 0, 1);
      ctx.strokeText(f.text, f.x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, y);
    });
    ctx.globalAlpha = 1;
  }
  function draw() {
    drawMap();
    drawItems();
    drawBombShadows();
    drawSlamWarning();
    drawMinions();
    if (player.y >= boss.y) {
      drawBoss();
      drawPlayer();
    } else {
      drawPlayer();
      drawBoss();
    }
    drawProjectiles();
    drawBombsFalling();
    drawFloats();
  }

  /* 화면 갱신 */
  function renderStats() {
    const full = Math.max(hearts, 0);
    const heartsEl = $('bossHearts');
    heartsEl.textContent = '♥'.repeat(full) + '♡'.repeat(Math.max(MAX_HEARTS - full, 0));
    heartsEl.setAttribute('aria-label', `하트 ${full}개`);
    $('bossWeapon').textContent = WEAPONS[weapon].label;
    $('bossArrows').textContent = arrowsLeft;
    renderShield();
    $('bossHp').textContent = boss.hp;
    $('bossHpFill').style.transform = `scaleX(${boss.hp / BOSS_MAX_HP})`;
  }
  function renderShield() {
    const seconds = Math.ceil(Math.max(0, shieldUntil - clock) / 1000);
    $('bossShield').textContent = seconds ? `${seconds}초` : '0';
  }
  function showCard(id) {
    ['bossIntroCard', 'bossSuccessCard', 'bossOverCard'].forEach(card => { $(card).hidden = card !== id; });
    if (id) $(id).querySelector('button').focus({ preventScroll: true });
  }
  function releaseControls() {
    moves = { up: false, down: false, left: false, right: false };
    attackHeld = false;
  }
  function resetRound() {
    clock = 0;
    player = { x: W / 2, y: H - 60, faceX: 0, faceY: -1 };
    boss = {
      x: W / 2, y: 140, hp: BOSS_MAX_HP, state: 'roam',
      target: { x: W / 2, y: 140 }, nextAttack: 1800, until: 0, flashUntil: 0,
      warnStart: 0, vx: 0, vy: 0,
    };
    rocks = [];
    shots = [];
    floats = [];
    minions = [];
    bombs = [];
    blasts = [];
    healReadyAt = 0;
    hearts = MAX_HEARTS;
    weapon = 'hand';
    arrowsLeft = 0;
    shieldUntil = 0;
    invincibleUntil = hurtUntil = attackReadyAt = 0;
    swingUntil = blockFxUntil = shockUntil = 0;
    items = ['sword', 'bow', 'shield', 'heart'].map(type => ({ type, x: 0, y: 0, active: false, respawnAt: Infinity }));
    items.filter(item => item.type !== 'heart').forEach(placeItem);
    nextHeartAt = 15000;
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
    GameSound.play('bossAppear');
    lastFrame = performance.now();
    frameId = requestAnimationFrame(frame);
  }
  function win() {
    halt();
    boss.state = 'hidden'; // 쓰러진 보스는 맵에서 사라진다
    minions = [];
    bombs = [];
    rocks = [];
    draw();
    $('bossSuccessTime').textContent = bossTime();
    showCard('bossSuccessCard');
    GameSound.play('bossEnding');
    gainAlly('hero');
    autoNextTimer = setTimeout(goToNext, AUTO_NEXT_MS);
  }
  function bossTime() { return `${(clock / 1000).toFixed(1)}초`; }
  function goToNext() {
    clearTimeout(autoNextTimer);
    onSuccess(bossTime());
  }
  function lose() {
    halt();
    draw();
    $('bossHpLeft').textContent = boss.hp;
    showCard('bossOverCard');
    GameSound.play('fail');
  }

  /* 휴대폰용 버튼 */
  function bindPad() {
    document.querySelectorAll('#bossPad [data-move]').forEach(btn => {
      const name = btn.dataset.move;
      const release = () => { moves[name] = false; };
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (playing) moves[name] = true;
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => btn.addEventListener(type, release));
      btn.addEventListener('contextmenu', e => e.preventDefault());
    });
    const attackBtn = $('bossAttackBtn');
    const release = () => { attackHeld = false; };
    attackBtn.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (playing) attackHeld = true;
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => attackBtn.addEventListener(type, release));
    attackBtn.addEventListener('contextmenu', e => e.preventDefault());
  }
  function drawIntroIcons() {
    document.querySelectorAll('.item-icon').forEach(icon => {
      const c = icon.getContext('2d');
      c.scale(icon.width / 24, icon.height / 24);
      drawItemIcon(c, icon.dataset.item);
    });
  }

  window.BossGame = {
    init(options) {
      onSuccess = options.onSuccess;
      $('bossDamageText').textContent = `칼 ${SWORD_DMG} · 화살 ${ARROW_DMG}(${ARROWS_PER_PICKUP}발) · 맨손 ${HAND_DMG} · 방패는 ${SHIELD_TIME}초 동안 모든 공격을 막아줘요`;
      bindPad();
      drawIntroIcons();
      window.addEventListener('blur', releaseControls);
      $('bossStartBtn').addEventListener('click', start);
      $('bossRetryBtn').addEventListener('click', start);
      $('bossBackBtn').addEventListener('click', options.onBack);
      $('bossOverBackBtn').addEventListener('click', options.onBack);
      $('bossNextBtn').addEventListener('click', goToNext);
    },
    // 게임을 멈추고 안내 카드가 보이는 처음 상태로 돌린다.
    showIntro() {
      halt();
      resetRound();
      showCard('bossIntroCard');
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
      if (ATTACK_KEYS.includes(e.code)) {
        attackHeld = true;
        return true;
      }
      return false;
    },
    handleKeyUp(e) {
      if (MOVE_KEYS[e.code]) moves[MOVE_KEYS[e.code]] = false;
      if (ATTACK_KEYS.includes(e.code)) attackHeld = false;
    },
  };
})();
