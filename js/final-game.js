// 최종 결전(6단계): 내가 직접 움직이며 싸우고, 동료들이 뒤따라오며 알아서 싸우는 실시간 전투.
(function () {
  // 나
  const MAX_HEARTS = 5, PLAYER_R = 12, PLAYER_SPEED = 190, PLAYER_INVINCIBLE_MS = 1000;
  const STAR_DMG = 20, STAR_EVERY_MS = 250, STAR_SPEED = 440;
  const HAMMER_DMG = 150, HAMMER_COOLDOWN_MS = 8000, HAMMER_SPEED = 300;
  // 동료
  const ALLY_R = 11, ALLY_SPACING = 27, ALLY_RANGE = 300, ALLY_DAMAGE_TAKEN = 0.7, ALLY_INVINCIBLE_MS = 1200;
  const ARCHER_MINION_RANGE = 130, HEAL_HEARTS = 1, HEAL_HP = 15, GUARD_MS = 3000;
  const STONE_SPEED = 340, ARROW_SPEED = 430, WAVE_SPEED = 300, FAN_ANGLE = 0.24;
  const BIG_WAVE_DMG = 100, BIG_LASER_DMG = 250;
  // 보스
  const BOSS_MAX_HP = 2000, BOSS_ATTACK = 50, BOSS_R = 44, BOSS_TOP = 60, BOSS_BOTTOM = 250;
  const BOSS_SPEED = 30, RAGE_BELOW_HP = 1000, RAGE_SPEED = 1.6, RAGE_GAP = 0.7;
  const SKILL_GAP_MIN_MS = 2300, SKILL_GAP_MAX_MS = 3300;
  const STAR_BULLETS = 12, RAGE_STAR_BULLETS = 18, BULLET_SPEED = 135, BULLET_R = 6;
  const METEOR_COUNT = 5, METEOR_R = 30, METEOR_FALL_MS = 1000;
  const BEAM_WARN_MS = 900, BEAM_MS = 450, BEAM_WIDTH = 34;
  const DASH_WARN_MS = 700, DASH_SPEED = 340, DASH_MS = 750;
  const HOLE_MS = 3000, HOLE_PULL = 95, HOLE_R = 24;
  const BARRIER_MS = 2500, TELEPORT_MS = 600;
  const MINION_HP = 20, MINION_R = 13, MINION_SPEED = 55, MINION_MAX = 8;
  const HEAL_MS = 2500, HEAL_PER_SEC = 100, HEAL_BREAK_DAMAGE = 150, HEAL_COOLDOWN_MS = 15000;
  // 기술 이름과 뽑힐 가중치. 지금 쓸 수 없는 기술은 canUse에서 걸러진다.
  const BOSS_SKILLS = [
    ['barrage', 24], ['meteors', 16], ['beam', 14], ['dash', 14], ['blackhole', 8],
    ['barrier', 7], ['teleport', 8], ['summon', 8], ['heal', 8],
  ];
  const W = 400, H = 520; // 그리기와 계산에 쓰는 논리 크기
  const MOVE_KEYS = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  };
  const FIRE_KEYS = ['Space', 'KeyJ'];

  const $ = id => document.getElementById(id);
  const canvas = $('finalCanvas');
  const ctx = canvas.getContext('2d');
  ctx.scale(canvas.width / W, canvas.height / H);

  let playing = false;
  let frameId = 0, lastFrame = 0, clock = 0;
  let player, boss, allies, trail, shots, bullets, meteors, minions, beams, floats, hole, stars;
  let hearts = MAX_HEARTS, invincibleUntil = 0, hurtUntil = 0;
  let nextStarAt = 0, hammerReadyAt = 0, guardUntil = 0, healReadyAt = 0, chipsText = '';
  let moves = { up: false, down: false, left: false, right: false };
  let fireHeld = false;
  let results = {};
  let allyImages = {};

  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const raging = () => boss.hp < RAGE_BELOW_HP;
  const isTargetable = () => boss.state !== 'teleport';
  const livingAllies = () => allies.filter(ally => ally.hp > 0);
  const guarding = () => clock < guardUntil;

  /* 맞았을 때 */
  function addFloat(x, y, text, color) {
    floats.push({ x, y, text, color, until: clock + 750 });
  }
  function hitPlayer() {
    if (guarding() || clock < invincibleUntil) return;
    hearts--;
    invincibleUntil = hurtUntil = clock + PLAYER_INVINCIBLE_MS;
    addFloat(player.x, player.y - 20, '−1', '#ff8f7f');
    GameSound.play('arrowHit');
    if (hearts <= 0) lose();
  }
  function hitAlly(ally, amount) {
    if (ally.hp <= 0 || guarding() || clock < ally.invincibleUntil) return;
    const damage = Math.max(1, Math.round(amount * ALLY_DAMAGE_TAKEN));
    ally.hp = Math.max(0, ally.hp - damage);
    ally.invincibleUntil = clock + ALLY_INVINCIBLE_MS;
    addFloat(ally.x, ally.y - 18, `−${damage}`, '#ff8f7f');
  }
  // 범위 안의 나와 동료 모두 맞는다. 그림보다 살짝 작게 판정한다.
  function hitArea(x, y, r, amount) {
    if (Math.hypot(player.x - x, player.y - y) < r + PLAYER_R - 3) hitPlayer();
    livingAllies().forEach(ally => {
      if (Math.hypot(ally.x - x, ally.y - y) < r + ALLY_R - 3) hitAlly(ally, amount);
    });
  }
  function damageBoss(amount) {
    if (clock < boss.barrierUntil) {
      addFloat(boss.x, boss.y - BOSS_R - 8, '무효', '#c9b3ff');
      GameSound.play('bossBlock');
      return;
    }
    boss.hp = Math.max(0, boss.hp - amount);
    boss.flashUntil = clock + 90;
    addFloat(boss.x + rand(-22, 22), boss.y - BOSS_R - 8, String(amount), '#fff');
    if (boss.hp === 0) {
      win();
      return;
    }
    if (boss.state === 'heal') {
      boss.healTaken += amount;
      if (boss.healTaken >= HEAL_BREAK_DAMAGE) {
        addFloat(boss.x, boss.y - BOSS_R - 28, '회복 실패!', '#ff9d8f');
        endHeal();
      }
    }
  }
  function damageMinion(minion, amount) {
    minion.hp -= amount;
    minion.flashUntil = clock + 90;
    addFloat(minion.x, minion.y - 16, String(amount), '#fff');
    if (minion.hp <= 0) minions = minions.filter(m => m !== minion);
  }

  /* 내 공격 */
  function aimDir(from, target) {
    const len = Math.max(dist(from, target), 1);
    return { x: (target.x - from.x) / len, y: (target.y - from.y) / len };
  }
  function addShot(from, dir, speed, fields) {
    shots.push(Object.assign({
      x: from.x, y: from.y, vx: dir.x * speed, vy: dir.y * speed, speed, r: 4, home: false, pierce: false,
    }, fields));
  }
  function fireStar() {
    if (clock < nextStarAt) return;
    nextStarAt = clock + STAR_EVERY_MS;
    // 보스가 순간이동 중이면 바라보는 방향으로 쏜다.
    const aimed = isTargetable();
    const dir = aimed ? aimDir(player, boss) : { x: player.faceX, y: player.faceY };
    addShot(player, dir, STAR_SPEED, { kind: 'star', damage: STAR_DMG, r: 6, home: aimed });
    GameSound.play('starShot');
  }
  function throwHammer() {
    if (!playing || clock < hammerReadyAt) return;
    hammerReadyAt = clock + HAMMER_COOLDOWN_MS;
    const aimed = isTargetable();
    const dir = aimed ? aimDir(player, boss) : { x: player.faceX, y: player.faceY };
    addShot(player, dir, HAMMER_SPEED, {
      kind: 'hammer', damage: HAMMER_DMG, r: 14, home: aimed, pierce: true, spin: 0, hitMinions: [],
    });
    GameSound.play('hammerThrow');
  }
  function updateShots(sec) {
    const kept = [];
    for (const shot of shots) {
      if (shot.home && isTargetable()) {
        const dir = aimDir(shot, boss);
        shot.vx = dir.x * shot.speed;
        shot.vy = dir.y * shot.speed;
      }
      shot.x += shot.vx * sec;
      shot.y += shot.vy * sec;
      if (shot.kind === 'hammer') shot.spin += sec * 14;
      if (shot.x < -30 || shot.x > W + 30 || shot.y < -30 || shot.y > H + 30) continue;
      if (shot.pierce) { // 부하는 뚫고 지나간다
        minions.filter(m => !shot.hitMinions.includes(m) && dist(shot, m) < MINION_R + shot.r).forEach(m => {
          shot.hitMinions.push(m);
          damageMinion(m, shot.damage);
        });
      } else {
        const minion = minions.find(m => dist(shot, m) < MINION_R + shot.r);
        if (minion) {
          damageMinion(minion, shot.damage);
          continue;
        }
      }
      if (isTargetable() && dist(shot, boss) < BOSS_R + shot.r) {
        if (shot.kind === 'hammer') GameSound.play('hammerHit');
        damageBoss(shot.damage);
        if (!playing) return;
        continue;
      }
      kept.push(shot);
    }
    shots = kept;
  }

  /* 동료 */
  function fireBeam(from, target, width, color, damage) {
    beams.push({ x1: from.x, y1: from.y, x2: target.x, y2: target.y, width, color, until: clock + 160 });
    damageBoss(damage);
  }
  const ALLY_ATTACKS = {
    normal(ally) { addShot(ally, aimDir(ally, boss), STONE_SPEED, { kind: 'stone', damage: ally.def.attack, r: 4 }); },
    shield(ally) { addShot(ally, aimDir(ally, boss), STONE_SPEED, { kind: 'stone', damage: ally.def.attack, r: 4 }); },
    archer(ally) {
      // 부하가 가까우면 부하 먼저
      const near = minions.filter(m => dist(m, ally) <= ARCHER_MINION_RANGE)
        .sort((a, b) => dist(a, ally) - dist(b, ally))[0];
      addShot(ally, aimDir(ally, near || boss), ARROW_SPEED, { kind: 'arrow', damage: ally.def.attack, r: 3 });
    },
    hero(ally) { addShot(ally, aimDir(ally, boss), WAVE_SPEED, { kind: 'wave', damage: ally.def.attack, r: 11 }); },
    astronaut(ally) { fireBeam(ally, boss, 5, '#8dffa0', ally.def.attack); },
  };
  // 기술을 썼으면 true를 돌려준다. 보스가 사라진 동안에는 공격 기술을 아껴 둔다.
  const ALLY_SKILLS = {
    normal() {
      hearts = Math.min(MAX_HEARTS, hearts + HEAL_HEARTS);
      livingAllies().forEach(other => {
        other.hp = Math.min(other.def.hp, other.hp + HEAL_HP);
        addFloat(other.x, other.y - 18, `+${HEAL_HP}`, '#8dffa0');
      });
      addFloat(player.x, player.y - 22, '♥+1', '#8dffa0');
      GameSound.play('skillHeal');
      return true;
    },
    shield() {
      guardUntil = clock + GUARD_MS;
      GameSound.play('skillGuard');
      return true;
    },
    archer(ally) {
      if (!isTargetable()) return false;
      const base = Math.atan2(boss.y - ally.y, boss.x - ally.x);
      [-FAN_ANGLE, 0, FAN_ANGLE].forEach(offset => {
        addShot(ally, { x: Math.cos(base + offset), y: Math.sin(base + offset) }, ARROW_SPEED, {
          kind: 'arrow', damage: ally.def.attack, r: 3,
        });
      });
      GameSound.play('skillTriple');
      return true;
    },
    hero(ally) {
      if (!isTargetable()) return false;
      addShot(ally, aimDir(ally, boss), WAVE_SPEED, { kind: 'bigWave', damage: BIG_WAVE_DMG, r: 22 });
      GameSound.play('skillSlash');
      return true;
    },
    astronaut(ally) {
      if (!isTargetable()) return false;
      GameSound.play('skillLaser');
      fireBeam(ally, boss, 16, '#7dffb0', BIG_LASER_DMG);
      return true;
    },
  };
  function recordTrail() {
    const last = trail[trail.length - 1];
    if (Math.hypot(player.x - last.x, player.y - last.y) < 3) return;
    trail.push({ x: player.x, y: player.y });
    const keep = (allies.length + 2) * Math.ceil(ALLY_SPACING / 3) + 4;
    if (trail.length > keep) trail.shift();
  }
  function updateAllies(sec) {
    const step = Math.ceil(ALLY_SPACING / 3);
    livingAllies().forEach((ally, i) => {
      // 내가 지나간 길을 따라 줄지어 간다.
      const spot = trail[Math.max(0, trail.length - 1 - (i + 1) * step)];
      const ease = Math.min(1, sec * 9);
      ally.x += (spot.x - ally.x) * ease;
      ally.y += (spot.y - ally.y) * ease;
      if (clock >= ally.nextSkill && ALLY_SKILLS[ally.def.id](ally)) {
        ally.nextSkill = clock + ally.def.skillCooldown * 1000;
        if (!playing) return;
      }
      if (clock >= ally.nextAttack && isTargetable() && dist(ally, boss) <= ALLY_RANGE) {
        ally.nextAttack = clock + ally.def.attackEvery * 1000;
        GameSound.play('partyAttack');
        ALLY_ATTACKS[ally.def.id](ally);
      }
    });
  }

  /* 보스의 기술 */
  function canUse(name) {
    if (name === 'blackhole') return !hole;
    if (name === 'barrier') return clock >= boss.barrierUntil;
    if (name === 'summon') return minions.length < MINION_MAX;
    if (name === 'heal') return boss.hp < BOSS_MAX_HP && clock >= healReadyAt;
    if (name === 'meteors') return !meteors.length;
    return true;
  }
  function chooseSkill() {
    const usable = BOSS_SKILLS.filter(([name]) => canUse(name));
    let roll = rand(0, usable.reduce((sum, [, weight]) => sum + weight, 0));
    for (const [name, weight] of usable) {
      roll -= weight;
      if (roll <= 0) return name;
    }
    return 'barrage';
  }
  function endSkill() {
    boss.state = 'roam';
    boss.nextSkill = clock + rand(SKILL_GAP_MIN_MS, SKILL_GAP_MAX_MS) * (raging() ? RAGE_GAP : 1);
  }
  function endHeal() {
    healReadyAt = clock + HEAL_COOLDOWN_MS;
    endSkill();
  }
  function farPoint() { // 위쪽 절반에서 나와 가장 먼 곳
    let best = null, bestDist = -1;
    for (let i = 0; i < 12; i++) {
      const spot = { x: rand(BOSS_R, W - BOSS_R), y: rand(BOSS_TOP, BOSS_BOTTOM) };
      const d = dist(spot, player);
      if (d > bestDist) {
        best = spot;
        bestDist = d;
      }
    }
    return best;
  }
  const SKILL_START = {
    barrage() {
      const count = raging() ? RAGE_STAR_BULLETS : STAR_BULLETS;
      const speed = BULLET_SPEED * (raging() ? 1.25 : 1);
      const spin = rand(0, Math.PI * 2);
      for (let i = 0; i < count; i++) {
        const angle = spin + i / count * Math.PI * 2;
        bullets.push({ x: boss.x, y: boss.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
      }
      GameSound.play('bossStar');
      endSkill();
    },
    meteors() {
      meteors = [{ x: player.x, y: player.y }]; // 하나는 내 위치
      while (meteors.length < METEOR_COUNT) {
        let spot = null;
        for (let i = 0; i < 20; i++) {
          spot = { x: rand(METEOR_R, W - METEOR_R), y: rand(METEOR_R, H - METEOR_R) };
          if (meteors.every(m => dist(m, spot) >= METEOR_R * 2)) break;
        }
        meteors.push(spot);
      }
      meteors.forEach(m => {
        m.start = clock;
        m.at = clock + METEOR_FALL_MS;
      });
      GameSound.play('bossMeteors');
      endSkill();
    },
    beam() {
      boss.state = 'beamWarn';
      boss.until = clock + BEAM_WARN_MS;
      const dir = aimDir(boss, player);
      boss.beamX = dir.x;
      boss.beamY = dir.y;
    },
    dash() {
      boss.state = 'dashWarn';
      boss.until = clock + DASH_WARN_MS;
    },
    blackhole() {
      hole = { x: rand(90, W - 90), y: rand(140, H - 140), until: clock + HOLE_MS };
      GameSound.play('bossBlackhole');
      endSkill();
    },
    barrier() {
      boss.barrierUntil = clock + BARRIER_MS;
      GameSound.play('bossBarrier');
      endSkill();
    },
    teleport() {
      boss.state = 'teleport';
      boss.until = clock + TELEPORT_MS;
    },
    summon() {
      const count = Math.floor(rand(3, 5));
      for (let i = 0; i < count && minions.length < MINION_MAX; i++) {
        const angle = rand(0, Math.PI * 2);
        minions.push({
          x: clamp(boss.x + Math.cos(angle) * 60, MINION_R, W - MINION_R),
          y: clamp(boss.y + Math.sin(angle) * 60, MINION_R, H - MINION_R),
          hp: MINION_HP, flashUntil: 0,
        });
      }
      GameSound.play('summon');
      endSkill();
    },
    heal() {
      boss.state = 'heal';
      boss.until = clock + HEAL_MS;
      boss.healTaken = 0;
      GameSound.play('bossRecover');
    },
  };
  function moveBoss(dx, dy, sec) {
    boss.x = clamp(boss.x + dx * sec, BOSS_R, W - BOSS_R);
    boss.y = clamp(boss.y + dy * sec, BOSS_R, H - BOSS_R);
  }
  function updateBoss(sec) {
    const haste = raging() ? RAGE_SPEED : 1;
    if (boss.state === 'roam') {
      // 위쪽 절반 안에서 내 쪽으로 천천히 다가온다.
      const goal = { x: player.x, y: clamp(player.y, BOSS_TOP, BOSS_BOTTOM) };
      const len = dist(goal, boss);
      if (len > 2) {
        const speed = (boss.y > BOSS_BOTTOM ? 130 : BOSS_SPEED) * haste; // 돌진 뒤에는 위로 돌아간다
        moveBoss((goal.x - boss.x) / len * speed, (goal.y - boss.y) / len * speed, sec);
      }
      if (clock >= boss.nextSkill) SKILL_START[chooseSkill()]();
    } else if (boss.state === 'beamWarn') {
      if (clock >= boss.until) {
        boss.state = 'beam';
        boss.until = clock + BEAM_MS;
        GameSound.play('bossBeam');
      }
    } else if (boss.state === 'beam') {
      const hitByBeam = target => {
        const px = target.x - boss.x, py = target.y - boss.y;
        const along = px * boss.beamX + py * boss.beamY;
        return along > 0 && Math.abs(px * boss.beamY - py * boss.beamX) < BEAM_WIDTH / 2;
      };
      if (hitByBeam(player)) hitPlayer();
      if (!playing) return;
      livingAllies().forEach(ally => { if (hitByBeam(ally)) hitAlly(ally, BOSS_ATTACK * 1.2); });
      if (clock >= boss.until) endSkill();
    } else if (boss.state === 'dashWarn') {
      if (clock >= boss.until) {
        const dir = aimDir(boss, player);
        boss.vx = dir.x * DASH_SPEED * (raging() ? 1.2 : 1);
        boss.vy = dir.y * DASH_SPEED * (raging() ? 1.2 : 1);
        boss.state = 'dash';
        boss.until = clock + DASH_MS;
        GameSound.play('bossBody');
      }
    } else if (boss.state === 'dash') {
      moveBoss(boss.vx, boss.vy, sec);
      hitArea(boss.x, boss.y, BOSS_R - 6, BOSS_ATTACK);
      if (playing && clock >= boss.until) endSkill();
    } else if (boss.state === 'teleport') {
      if (clock >= boss.until) {
        Object.assign(boss, farPoint());
        endSkill();
      }
    } else if (boss.state === 'heal') {
      boss.hp = Math.min(BOSS_MAX_HP, boss.hp + HEAL_PER_SEC * sec);
      if (Math.floor(clock / 500) !== Math.floor((clock - sec * 1000) / 500)) {
        addFloat(boss.x + rand(-20, 20), boss.y - BOSS_R - 8, `+${HEAL_PER_SEC / 2}`, '#8dffa0');
      }
      if (clock >= boss.until) endHeal();
    }
  }
  function updateHazards(sec) {
    bullets = bullets.filter(b => {
      b.x += b.vx * sec;
      b.y += b.vy * sec;
      const hitsPlayer = Math.hypot(player.x - b.x, player.y - b.y) < BULLET_R + PLAYER_R - 3;
      const hitAllyTarget = livingAllies().find(a => Math.hypot(a.x - b.x, a.y - b.y) < BULLET_R + ALLY_R - 3);
      if (hitsPlayer) hitPlayer();
      if (hitAllyTarget) hitAlly(hitAllyTarget, BOSS_ATTACK * 0.6);
      if (hitsPlayer || hitAllyTarget) return false;
      return b.x > -10 && b.x < W + 10 && b.y > -10 && b.y < H + 10;
    });
    if (!playing) return;

    const landed = meteors.filter(m => clock >= m.at);
    if (landed.length) {
      meteors = meteors.filter(m => clock < m.at);
      landed.forEach(m => {
        beams.push({ blast: true, x: m.x, y: m.y, until: clock + 280 });
        hitArea(m.x, m.y, METEOR_R, BOSS_ATTACK);
      });
      GameSound.play('fake');
      if (!playing) return;
    }

    minions = minions.filter(m => {
      const speed = MINION_SPEED * (raging() ? 1.3 : 1);
      const len = Math.max(dist(player, m), 1);
      m.x += (player.x - m.x) / len * speed * sec;
      m.y += (player.y - m.y) / len * speed * sec;
      if (len < MINION_R + PLAYER_R - 3 && clock >= invincibleUntil && !guarding()) {
        hitPlayer();
        return false;
      }
      const ally = livingAllies().find(a => dist(a, m) < MINION_R + ALLY_R - 3 && clock >= a.invincibleUntil);
      if (ally && !guarding()) {
        hitAlly(ally, BOSS_ATTACK * 0.5);
        return false;
      }
      return true;
    });
    if (!playing) return;

    if (hole) {
      const pull = target => {
        const dir = aimDir(target, hole);
        target.x = clamp(target.x + dir.x * HOLE_PULL * sec, PLAYER_R, W - PLAYER_R);
        target.y = clamp(target.y + dir.y * HOLE_PULL * sec, PLAYER_R, H - PLAYER_R);
      };
      pull(player);
      livingAllies().forEach(pull);
      hitArea(hole.x, hole.y, HOLE_R, BOSS_ATTACK * 0.6);
      if (clock >= hole.until) hole = null;
    }
  }

  /* 진행 */
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
  function update(sec) {
    movePlayer(sec);
    recordTrail();
    if (fireHeld) fireStar();
    updateAllies(sec);
    if (!playing) return;
    updateShots(sec);
    if (!playing) return;
    updateBoss(sec);
    if (!playing) return;
    updateHazards(sec);
    if (!playing) return;
    stars.forEach(star => {
      star.y += star.speed * sec;
      if (star.y > H) {
        star.y = 0;
        star.x = rand(0, W);
      }
    });
    beams = beams.filter(beam => clock < beam.until);
    floats = floats.filter(f => clock < f.until);
  }
  function frame(now) {
    const dt = Math.min(now - lastFrame, 100); // 탭을 벗어나면 시간도 멈춘다
    lastFrame = now;
    clock += dt;
    update(dt / 1000);
    if (!playing) return;
    renderHud();
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
  function drawStarShape(x, y, r, color, rotation = 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = rotation + i / 10 * Math.PI * 2 - Math.PI / 2;
      const radius = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    }
    ctx.closePath();
    ctx.fill();
  }
  function drawBoss() {
    if (boss.state === 'teleport') {
      // 사라졌다 나타나는 동안 빛만 남는다
      ctx.strokeStyle = 'rgba(190,150,255,.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, 12 + (boss.until - clock) / TELEPORT_MS * 34, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    const flash = clock < boss.flashUntil;
    const warn = boss.state === 'dashWarn' && Math.floor(clock / 90) % 2 === 0;
    const paint = color => (flash ? '#ffffff' : warn ? '#e2202a' : color);
    const fur = raging() ? '#8c2f8f' : '#6d3fb0';
    ctx.save();
    ctx.translate(boss.x, boss.y);
    if (boss.state === 'heal') {
      ctx.fillStyle = 'rgba(100,240,130,.32)';
      ctx.beginPath();
      ctx.arc(0, 0, BOSS_R + 14 + Math.sin(clock / 110) * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#1a0f2e';
    ctx.lineWidth = 3;
    ctx.fillStyle = paint(fur);
    ctx.beginPath();
    ctx.arc(0, 0, BOSS_R - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = paint('#b89be0');
    ctx.beginPath();
    ctx.ellipse(0, 13, 23, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = paint('#ff2a2a');
    [-15, 15].forEach(x => {
      ctx.beginPath();
      ctx.arc(x, -9, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.strokeStyle = paint('#1a0f2e');
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-25, -22); ctx.lineTo(-8, -15);
    ctx.moveTo(25, -22); ctx.lineTo(8, -15);
    ctx.stroke();
    ctx.fillStyle = paint('#e8788a');
    ctx.beginPath();
    ctx.ellipse(0, 4, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = paint('#ffffff');
    ctx.beginPath();
    ctx.moveTo(-11, 15); ctx.lineTo(11, 15); ctx.lineTo(6, 26); ctx.lineTo(0, 18); ctx.lineTo(-6, 26);
    ctx.closePath();
    ctx.fill();
    // 유리 헬멧
    ctx.fillStyle = 'rgba(190,230,255,.16)';
    ctx.strokeStyle = 'rgba(220,240,255,.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, BOSS_R + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 왕관
    ctx.fillStyle = paint('#ffc22e');
    ctx.strokeStyle = '#1a0f2e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-23, -40); ctx.lineTo(-27, -64); ctx.lineTo(-12, -51); ctx.lineTo(0, -70);
    ctx.lineTo(12, -51); ctx.lineTo(27, -64); ctx.lineTo(23, -40);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (clock < boss.barrierUntil) {
      ctx.fillStyle = 'rgba(150,100,255,.28)';
      ctx.strokeStyle = '#c9a8ff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, BOSS_R + 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawBeamSkill() {
    if (boss.state !== 'beamWarn' && boss.state !== 'beam') return;
    const far = 700;
    const x2 = boss.x + boss.beamX * far, y2 = boss.y + boss.beamY * far;
    ctx.save();
    if (boss.state === 'beamWarn') {
      ctx.strokeStyle = '#ff3b3b';
      ctx.lineWidth = 2;
      ctx.setLineDash([9, 7]);
    } else {
      ctx.strokeStyle = 'rgba(255,70,70,.9)';
      ctx.lineWidth = BEAM_WIDTH;
    }
    ctx.beginPath();
    ctx.moveTo(boss.x, boss.y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    if (boss.state === 'beam') {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = BEAM_WIDTH * 0.35;
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawHole() {
    if (!hole) return;
    for (let i = 3; i > 0; i--) {
      ctx.strokeStyle = `rgba(160,110,255,${0.25 * i})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(hole.x, hole.y, HOLE_R + i * 16 + Math.sin(clock / 120 + i) * 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#b48aff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, HOLE_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  function drawMeteorShadows() {
    meteors.forEach(m => {
      const t = clamp((clock - m.start) / (m.at - m.start), 0, 1);
      ctx.fillStyle = `rgba(226,70,50,${0.12 + t * 0.4})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, METEOR_R, 0, Math.PI * 2);
      ctx.fill();
      if (t > 0.4) {
        ctx.fillStyle = '#7d6653';
        ctx.strokeStyle = '#2b1a10';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(m.x, m.y - (1 - t) / 0.6 * 170, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    });
  }
  function drawHeadBar(x, y, ratio) {
    ctx.fillStyle = '#05081c';
    ctx.fillRect(x - 13, y, 26, 4);
    ctx.fillStyle = ratio > 0.3 ? '#5fd17a' : '#ff6b5b';
    ctx.fillRect(x - 13, y, 26 * ratio, 4);
  }
  function drawGuardRing(x, y, r) {
    if (!guarding()) return;
    ctx.strokeStyle = 'rgba(120,190,255,.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r + 7, 0, Math.PI * 2);
    ctx.stroke();
  }
  function drawAllies() {
    allies.forEach(ally => {
      if (ally.hp <= 0) return;
      if (clock < ally.invincibleUntil && Math.floor(clock / 90) % 2) return;
      const size = 30;
      const image = allyImages[ally.def.id];
      if (image && image.complete) ctx.drawImage(image, ally.x - size / 2, ally.y - size * 0.55, size, size * 1.1);
      drawHeadBar(ally.x, ally.y - size * 0.72, ally.hp / ally.def.hp);
      drawGuardRing(ally.x, ally.y, ALLY_R);
    });
  }
  function drawPlayer() {
    const x = player.x, y = player.y;
    drawGuardRing(x, y, PLAYER_R);
    if (clock < hurtUntil && Math.floor(clock / 90) % 2) return;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffc22e';
    ctx.fillStyle = '#a06c3f';
    ctx.beginPath();
    ctx.arc(x, y, PLAYER_R + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8c9a0';
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c120c';
    [-4, 4].forEach(dx => {
      ctx.beginPath();
      ctx.arc(x + dx, y - 3, 2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#e8788a';
    ctx.fillRect(x - 1.5, y + 1, 3, 2);
    drawStarShape(x + player.faceX * (PLAYER_R + 8), y + player.faceY * (PLAYER_R + 8), 5, '#ffc22e');
  }
  function drawHammer(shot) {
    ctx.save();
    ctx.translate(shot.x, shot.y);
    ctx.rotate(shot.spin);
    ctx.fillStyle = '#d9a860';
    ctx.fillRect(-2.5, 0, 5, 17);
    ctx.fillStyle = '#e2452f';
    ctx.strokeStyle = '#2b1a10';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -5, 15, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffc22e';
    ctx.fillRect(-8, -13, 3, 16);
    ctx.fillRect(5, -13, 3, 16);
    ctx.restore();
  }
  function drawShots() {
    shots.forEach(shot => {
      if (shot.kind === 'hammer') {
        drawHammer(shot);
      } else if (shot.kind === 'star') {
        drawStarShape(shot.x, shot.y, 8, '#ffe066', clock / 90);
      } else if (shot.kind === 'stone') {
        ctx.fillStyle = '#c9c0b3';
        ctx.beginPath();
        ctx.arc(shot.x, shot.y, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (shot.kind === 'arrow') {
        const len = Math.hypot(shot.vx, shot.vy);
        ctx.strokeStyle = '#ffd9b0';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(shot.x, shot.y);
        ctx.lineTo(shot.x - shot.vx / len * 14, shot.y - shot.vy / len * 14);
        ctx.stroke();
      } else { // 검기
        const angle = Math.atan2(shot.vy, shot.vx);
        ctx.strokeStyle = shot.kind === 'bigWave' ? '#ffffff' : '#bfe3ff';
        ctx.lineWidth = shot.kind === 'bigWave' ? 8 : 5;
        ctx.beginPath();
        ctx.arc(shot.x, shot.y, shot.r, angle - 1.1, angle + 1.1);
        ctx.stroke();
      }
    });
    beams.forEach(beam => {
      if (beam.blast) {
        const life = clamp((beam.until - clock) / 280, 0, 1);
        ctx.fillStyle = `rgba(255,140,60,${life * 0.7})`;
        ctx.beginPath();
        ctx.arc(beam.x, beam.y, METEOR_R * (1.2 - life * 0.4), 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.strokeStyle = beam.color;
      ctx.lineWidth = beam.width;
      ctx.beginPath();
      ctx.moveTo(beam.x1, beam.y1);
      ctx.lineTo(beam.x2, beam.y2);
      ctx.stroke();
    });
  }
  function drawBullets() {
    bullets.forEach(b => drawStarShape(b.x, b.y, BULLET_R + 3, '#ff8fb0', clock / 120));
  }
  function drawMinions() {
    minions.forEach(m => {
      const flash = clock < m.flashUntil;
      ctx.fillStyle = flash ? '#fff' : '#b9c3cc';
      ctx.strokeStyle = '#1a0f2e';
      ctx.lineWidth = 2;
      ctx.beginPath(); // 접시
      ctx.ellipse(m.x, m.y + 3, MINION_R + 2, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = flash ? '#fff' : '#8a5a35';
      ctx.beginPath(); // 탑승한 두더지
      ctx.arc(m.x, m.y - 3, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ff2a2a';
      [-2.5, 2.5].forEach(dx => ctx.fillRect(m.x + dx - 1, m.y - 5, 2, 2));
      ctx.fillStyle = '#7dffb0';
      [-8, 0, 8].forEach(dx => ctx.fillRect(m.x + dx - 1, m.y + 4, 2, 2));
      drawHeadBar(m.x, m.y - 17, Math.max(m.hp, 0) / MINION_HP);
    });
  }
  function drawFloats() {
    ctx.font = '700 18px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#05081c';
    floats.forEach(f => {
      const life = (f.until - clock) / 750;
      const y = f.y - (1 - life) * 26;
      ctx.globalAlpha = clamp(life * 1.6, 0, 1);
      ctx.strokeText(f.text, f.x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, y);
    });
    ctx.globalAlpha = 1;
  }
  function draw() {
    drawSpace();
    drawHole();
    drawMeteorShadows();
    drawBeamSkill();
    drawBoss();
    drawMinions();
    drawAllies();
    drawPlayer();
    drawBullets();
    drawShots();
    drawFloats();
  }

  /* 화면 갱신 */
  function buildParty() {
    $('finalParty').innerHTML = allies.map(ally => `
      <article class="final-member" data-id="${ally.def.id}" aria-label="${ally.def.name}">
        <div class="final-member-art">${Party.art(ally.def.id)}</div>
        <div class="final-hp-track"><div class="final-hp-fill"></div></div>
        <span class="final-member-stats"></span>
      </article>`).join('');
    allies.forEach(ally => { ally.el = $('finalParty').querySelector(`[data-id="${ally.def.id}"]`); });
  }
  function renderHud() {
    const bossHp = Math.ceil(boss.hp);
    $('finalBossHp').textContent = bossHp;
    $('finalBossFill').style.transform = `scaleX(${boss.hp / BOSS_MAX_HP})`;

    const chips = [];
    if (raging()) chips.push(['분노', 'rage']);
    if (clock < boss.barrierUntil) chips.push(['보스 방어막', 'barrier']);
    if (boss.state === 'heal') chips.push(['회복 중', 'heal']);
    if (guarding()) chips.push([`철벽 방어 ${Math.ceil((guardUntil - clock) / 1000)}초`, 'guard']);
    const text = chips.map(([label, cls]) => `<span class="final-chip ${cls}">${label}</span>`).join('');
    if (text !== chipsText) {
      chipsText = text;
      $('finalChips').innerHTML = text;
    }

    const full = Math.max(hearts, 0);
    const heartsEl = $('finalHearts');
    heartsEl.textContent = '♥'.repeat(full) + '♡'.repeat(MAX_HEARTS - full);
    heartsEl.setAttribute('aria-label', `하트 ${full}개`);
    const hammerLeft = hammerReadyAt - clock;
    $('finalSpecial').textContent = hammerLeft > 0 ? `필살 ${Math.ceil(hammerLeft / 1000)}초` : '필살 준비!';
    $('finalMe').classList.toggle('ready', hammerLeft <= 0);
    $('finalSpecialBtn').classList.toggle('ready', hammerLeft <= 0);

    allies.forEach(ally => {
      ally.el.classList.toggle('down', ally.hp <= 0);
      ally.el.querySelector('.final-hp-fill').style.transform = `scaleX(${ally.hp / ally.def.hp})`;
      ally.el.querySelector('.final-member-stats').textContent = `${ally.hp}/${ally.def.hp}`;
    });
  }
  function showCard(id) {
    ['finalIntroCard', 'finalEndingCard', 'finalOverCard'].forEach(card => { $(card).hidden = card !== id; });
    if (id) $(id).querySelector('button').focus({ preventScroll: true });
  }
  function releaseControls() {
    moves = { up: false, down: false, left: false, right: false };
    fireHeld = false;
  }
  function resetRound() {
    clock = 0;
    player = { x: W / 2, y: H - 110, faceX: 0, faceY: -1 };
    boss = {
      x: W / 2, y: 110, hp: BOSS_MAX_HP, state: 'roam', until: 0, nextSkill: 1500,
      flashUntil: 0, barrierUntil: 0, healTaken: 0, beamX: 0, beamY: 1, vx: 0, vy: 0,
    };
    allies = Party.members().map((def, i) => ({
      def,
      hp: def.hp,
      x: player.x,
      y: player.y + (i + 1) * ALLY_SPACING,
      invincibleUntil: 0,
      nextAttack: rand(200, def.attackEvery * 1000),
      nextSkill: def.skillCooldown * 1000,
      el: null,
    }));
    // 처음에는 동료들이 내 뒤로 일직선으로 서 있도록 길을 깔아 둔다.
    trail = [];
    const steps = (allies.length + 1) * Math.ceil(ALLY_SPACING / 3);
    for (let i = steps; i >= 0; i--) trail.push({ x: player.x, y: player.y + i * 3 });
    shots = [];
    bullets = [];
    meteors = [];
    minions = [];
    beams = [];
    floats = [];
    hole = null;
    hearts = MAX_HEARTS;
    invincibleUntil = hurtUntil = guardUntil = 0;
    nextStarAt = hammerReadyAt = healReadyAt = 0;
    chipsText = '';
    releaseControls();
    buildParty();
    renderHud();
    draw();
  }

  /* 시작과 끝 */
  function halt() {
    playing = false;
    cancelAnimationFrame(frameId);
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
  function endRound() {
    halt();
    renderHud();
    draw();
  }
  function win() {
    endRound();
    $('finalEndingParty').innerHTML = allies.map(ally => `<div>${Party.art(ally.def.id)}</div>`).join('');
    $('finalSumTime').textContent = `${(clock / 1000).toFixed(1)}초`;
    $('finalSumAlive').textContent = `${livingAllies().length}/${allies.length}`;
    $('finalSumMole').textContent = results.mole;
    $('finalSumBlock').textContent = results.block;
    $('finalSumArrow').textContent = results.arrow;
    $('finalSumBoss').textContent = results.boss;
    $('finalSumSpace').textContent = results.space;
    showCard('finalEndingCard');
    GameSound.play('finalEnding');
  }
  function lose() {
    endRound();
    $('finalBossLeft').textContent = Math.ceil(boss.hp);
    showCard('finalOverCard');
    GameSound.play('fail');
  }

  /* 휴대폰용 버튼 */
  function bindPad() {
    document.querySelectorAll('#finalPad [data-move]').forEach(btn => {
      const name = btn.dataset.move;
      const release = () => { moves[name] = false; };
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (playing) moves[name] = true;
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => btn.addEventListener(type, release));
      btn.addEventListener('contextmenu', e => e.preventDefault());
    });
    const fireBtn = $('finalFireBtn');
    const release = () => { fireHeld = false; };
    fireBtn.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (playing) fireHeld = true;
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => fireBtn.addEventListener(type, release));
    fireBtn.addEventListener('contextmenu', e => e.preventDefault());
    const specialBtn = $('finalSpecialBtn');
    specialBtn.addEventListener('pointerdown', e => {
      e.preventDefault();
      throwHammer();
    });
    specialBtn.addEventListener('contextmenu', e => e.preventDefault());
  }
  function loadAllyImages() {
    ['normal', 'shield', 'archer', 'hero', 'astronaut'].forEach(id => {
      const image = new Image();
      const svg = Party.art(id).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
      image.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
      allyImages[id] = image;
    });
  }

  window.FinalGame = {
    init(options) {
      $('finalBossMax').textContent = BOSS_MAX_HP;
      $('finalControlsText').textContent = `스페이스·J 별 탄환(${STAR_DMG}) · K 뿅망치 필살기(${HAMMER_DMG}, ${HAMMER_COOLDOWN_MS / 1000}초마다)`;
      stars = Array.from({ length: 60 }, () => ({
        x: rand(0, W), y: rand(0, H), size: rand(1, 2.4), speed: rand(8, 26), alpha: rand(0.35, 1),
      }));
      loadAllyImages();
      bindPad();
      window.addEventListener('blur', releaseControls);
      $('finalStartBtn').addEventListener('click', start);
      $('finalRetryBtn').addEventListener('click', start);
      $('finalIntroBackBtn').addEventListener('click', options.onBack);
      $('finalBackBtn').addEventListener('click', options.onBack);
      $('finalRestartBtn').addEventListener('click', options.onBack);
    },
    // 게임을 멈추고 안내 카드를 보여 준다. 앞 단계 기록은 엔딩 요약에 쓴다.
    begin(stageResults) {
      halt();
      results = stageResults;
      resetRound();
      showCard('finalIntroCard');
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
      if (e.code === 'KeyK') {
        if (!e.repeat) throwHammer();
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
