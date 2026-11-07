// 최종 결전(7단계): 내가 직접 움직이며 싸우고, 동료들이 뒤따라오며 알아서 싸우는 실시간 전투.
(function () {
  // 나
  const MAX_HEARTS = 5, PLAYER_R = 12, PLAYER_SPEED = 190, PLAYER_INVINCIBLE_MS = 1000;
  const STAR_DMG = 15, STAR_EVERY_MS = 250, STAR_SPEED = 440;
  const HAMMER_DMG = 100, HAMMER_COOLDOWN_MS = 8000, HAMMER_SPEED = 300;
  // 동료
  const ALLY_R = 11, ALLY_SPACING = 27, ALLY_RANGE = 300, ALLY_DAMAGE_TAKEN = 0.7, ALLY_INVINCIBLE_MS = 1200;
  const ARCHER_MINION_RANGE = 130, HEAL_HEARTS = 1, GUARD_MS = 3000;
  const STONE_SPEED = 340, ARROW_SPEED = 430, WAVE_SPEED = 300, FAN_ANGLE = 0.24;
  const BIG_WAVE_DMG = 70, BIG_LASER_DMG = 150, FIREBALL_SPEED = 320;
  // 보스
  const BOSS_MAX_HP = 5000, BOSS_ATTACK = 72, BOSS_R = 44, BOSS_TOP = 60, BOSS_BOTTOM = 250;
  const BOSS_SPEED = 30, RAGE_BELOW_HP = 2500, RAGE_SPEED = 1.6, RAGE_GAP = 0.7;
  const SKILL_GAP_MIN_MS = 1600, SKILL_GAP_MAX_MS = 2400; // 기술 사이 쉬는 시간
  const STAR_BULLETS = 12, RAGE_STAR_BULLETS = 18, BULLET_SPEED = 135, BULLET_R = 6;
  const METEOR_COUNT = 5, METEOR_R = 30, METEOR_FALL_MS = 1000;
  const BEAM_WARN_MS = 900, BEAM_MS = 450, BEAM_WIDTH = 34;
  const DASH_WARN_MS = 700, DASH_SPEED = 340, DASH_MS = 750;
  const HOLE_MS = 3000, HOLE_PULL = 95, HOLE_R = 24;
  const BARRIER_MS = 2500, TELEPORT_MS = 600;
  const MINION_HP = 20, MINION_R = 13, MINION_SPEED = 55, MINION_MAX = 8;
  const HEAL_MS = 2500, HEAL_PER_SEC = 100, HEAL_BREAK_DAMAGE = 150, HEAL_COOLDOWN_MS = 15000;
  const SPIRAL_MS = 1800, SPIRAL_EVERY_MS = 90, SPIRAL_TURN = 0.42, SPIRAL_SPEED = 150;
  const QUAKE_WARN_MS = 800, QUAKE_SPEED = 230, QUAKE_MAX_R = 270, QUAKE_THICK = 12;
  const CROSS_WARN_MS = 900, CROSS_MS = 550, CROSS_WIDTH = 26, CROSS_SPIN = 0.9;
  const RAIN_GAP = 30, RAIN_SAFE = 3, RAIN_SPEED = 170, RAIN_ROW_MS = 650;
  const MISSILE_SPEED = 150, MISSILE_TURN = 2.6, MISSILE_MS = 3800, MISSILE_R = 7; // TURN: 초당 꺾을 수 있는 각도
  const CLONE_WARN_MS = 900, CLONE_BULLETS = 10, CLONE_BULLET_SPEED = 125;
  const SWEEP_WARN_MS = 700, SWEEP_MS = 1800, SWEEP_WIDTH = 22;
  const ICE_MS = 4500, ICE_R = 46, ICE_SLOW = 0.45, ICE_FADE_MS = 500;
  const GIANT_R = 80, GIANT_FALL_MS = 1600;
  const BOUNCE_R = 10, BOUNCE_SPEED = 165, BOUNCE_TIMES = 3;
  const BOLT_COUNT = 6, BOLT_STEP = 55, BOLT_GAP_MS = 170, BOLT_WARN_MS = 500, BOLT_R = 28;
  const WALL_WARN_MS = 700, WALL_MS = 2600, WALL_W = 14, WALL_GAP = 84; // 양옆에서 조여 오는 레이저 벽
  const POISON_MS = 5000, POISON_R = 34, POISON_SPEED = 35, POISON_FADE_MS = 500;
  const TORNADO_WARN_MS = 700, TORNADO_SPEED = 150, TORNADO_R = 26, TORNADO_WAVE = 55;
  const VOLLEY_COUNT = 3, VOLLEY_GAP_MS = 320, VOLLEY_BULLETS = 5, VOLLEY_SPREAD = 0.18, VOLLEY_SPEED = 210;
  const ORB_SPEED = 55, ORB_MS = 3200, ORB_R = 16, ORB_PULL = 70, ORB_PULL_R = 130, ORB_BURST = 14, ORB_HOVER = 60;
  const MINE_COUNT = 6, MINE_ARM_MS = 900, MINE_MS = 7000, MINE_TRIGGER_R = 30, MINE_BLAST_R = 42;
  const CHAIN_WARN_MS = 380; // 3연속 돌진에서 두 번째부터는 더 짧게 경고한다
  // 기술 이름과 뽑힐 가중치. 지금 쓸 수 없는 기술은 canUse에서 걸러진다.
  const BOSS_SKILLS = [
    ['barrage', 18], ['meteors', 12], ['beam', 11], ['dash', 11], ['blackhole', 7],
    ['barrier', 7], ['teleport', 7], ['summon', 7], ['heal', 8],
    ['spiral', 11], ['quake', 9], ['cross', 9], ['starRain', 9],
    ['missiles', 10], ['clones', 9], ['sweep', 9], ['ice', 8],
    ['giant', 8], ['bounce', 8], ['lightning', 8],
    ['walls', 8], ['poison', 8], ['tornado', 8],
    ['volley', 9], ['orb', 7], ['mines', 7], ['tripleDash', 7],
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
  let player, boss, allies, trail, shots, bullets, meteors, minions, beams, floats, hole, stars, quakes;
  let missiles, clones, iceZones, bolts, walls, clouds, tornadoes, orbs, mines;
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
      // 내 하트만 채운다. 동료 회복은 지팡이 두더지가 맡는다.
      hearts = Math.min(MAX_HEARTS, hearts + HEAL_HEARTS);
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
    staff(ally) {
      if (!isTargetable()) return false;
      addShot(ally, aimDir(ally, boss), FIREBALL_SPEED, {
        kind: 'fireball', damage: ally.def.skillDamage, r: 9, home: true,
      });
      GameSound.play('skillFireball');
      return true;
    },
  };
  // 회복 동료: 다친 다른 동료가 있을 때만 회복하고, 모두 멀쩡하면 다음 기회까지 기다린다.
  function healOthers(ally) {
    const hurt = livingAllies().filter(other => other !== ally && other.hp < other.def.hp);
    if (!hurt.length) return false;
    hurt.forEach(other => {
      other.hp = Math.min(other.def.hp, other.hp + ally.def.heal);
      addFloat(other.x, other.y - 18, `+${ally.def.heal}`, '#8dffa0');
    });
    beams.push({ heal: true, x: ally.x, y: ally.y, until: clock + 400 });
    GameSound.play('skillHeal');
    return true;
  }
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
      if (ally.def.heal) {
        if (clock >= ally.nextAttack && healOthers(ally)) ally.nextAttack = clock + ally.def.attackEvery * 1000;
      } else if (clock >= ally.nextAttack && isTargetable() && dist(ally, boss) <= ALLY_RANGE) {
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
    if (name === 'quake') return !quakes.length;
    if (name === 'missiles') return !missiles.length;
    if (name === 'clones') return !clones.length;
    if (name === 'ice') return !iceZones.length;
    if (name === 'giant') return !meteors.length;
    if (name === 'lightning') return !bolts.length;
    if (name === 'walls') return !walls.length;
    if (name === 'poison') return !clouds.length;
    if (name === 'tornado') return !tornadoes.length;
    if (name === 'orb') return !orbs.length;
    if (name === 'mines') return !mines.length;
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
      boss.dashChain = 0;
    },
    // 3연속 돌진: 돌진이 끝나자마자 짧게 경고하고 다시 돌진한다. 분노하면 4연속.
    tripleDash() {
      boss.state = 'dashWarn';
      boss.until = clock + DASH_WARN_MS;
      boss.dashChain = raging() ? 3 : 2;
      addFloat(boss.x, boss.y - BOSS_R - 28, '연속 돌진!', '#ff9d8f');
    },
    // 저격 연사: 내 쪽을 겨냥한 별 탄 5발 부채꼴을 세 번 연달아 쏜다. 쏠 때마다 다시 겨냥한다.
    volley() {
      boss.state = 'volley';
      boss.shotsLeft = raging() ? VOLLEY_COUNT + 1 : VOLLEY_COUNT;
      boss.nextShot = clock + 250;
      addFloat(boss.x, boss.y - BOSS_R - 28, '저격 연사!', '#ff8fb0');
    },
    // 중력 구슬: 느린 구슬이 나를 따라오며 끌어당기다가, 시간이 다 되면 별 탄으로 터진다.
    orb() {
      orbs.push({ x: boss.x, y: boss.y + BOSS_R, start: clock, until: clock + ORB_MS * (raging() ? 0.85 : 1) });
      addFloat(boss.x, boss.y - BOSS_R - 28, '중력 구슬!', '#b48aff');
      GameSound.play('bossBlackhole');
      endSkill();
    },
    // 지뢰밭: 지뢰가 흩어져 깔리고, 잠시 뒤 켜진 지뢰에 다가가면 터진다.
    mines() {
      const count = raging() ? MINE_COUNT + 2 : MINE_COUNT;
      for (let i = 0; i < count; i++) {
        let spot;
        for (let tries = 0; tries < 20; tries++) { // 내 바로 옆에는 깔지 않는다
          spot = { x: rand(24, W - 24), y: rand(H * 0.3, H - 24) };
          if (dist(spot, player) > 70) break;
        }
        mines.push(Object.assign(spot, { armAt: clock + MINE_ARM_MS, until: clock + MINE_MS }));
      }
      addFloat(boss.x, boss.y - BOSS_R - 28, '지뢰밭!', '#ffcf7a');
      GameSound.play('bombFall');
      endSkill();
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
    // 나선 탄막: 제자리에서 돌며 별 탄을 줄줄이 뿌린다. 분노하면 팔이 셋.
    spiral() {
      boss.state = 'spiral';
      boss.until = clock + SPIRAL_MS;
      boss.nextShot = clock;
      boss.spin = rand(0, Math.PI * 2);
      addFloat(boss.x, boss.y - BOSS_R - 28, '나선 탄막!', '#ff8fb0');
    },
    // 지진파: 잠깐 웅크렸다가 퍼져 나가는 고리를 낸다. 멀리 떨어지면 피할 수 있다.
    quake() {
      boss.state = 'quakeWarn';
      boss.until = clock + QUAKE_WARN_MS;
      boss.warnStart = clock;
    },
    // 십자 레이저: 네 방향으로 레이저를 쏜다. 분노하면 쏘는 동안 돌아간다.
    cross() {
      boss.state = 'crossWarn';
      boss.until = clock + CROSS_WARN_MS;
      boss.crossAngle = rand(0, Math.PI / 2);
    },
    // 별똥별 비: 위에서 별 탄이 줄지어 떨어진다. 줄마다 빈틈이 하나 있다.
    starRain() {
      boss.state = 'starRain';
      boss.rowsLeft = raging() ? 3 : 2;
      boss.nextShot = clock;
      addFloat(boss.x, boss.y - BOSS_R - 28, '별똥별 비!', '#ffe066');
    },
    // 추적 미사일: 나를 따라오는 미사일. 크게 돌면 따라오지 못하고, 시간이 지나면 터져 사라진다.
    missiles() {
      const count = raging() ? 4 : 3;
      for (let i = 0; i < count; i++) {
        const angle = -Math.PI / 2 + (i - (count - 1) / 2) * 0.7; // 위쪽으로 부채꼴로 쏘아 올린다
        missiles.push({ x: boss.x, y: boss.y, angle, until: clock + MISSILE_MS });
      }
      addFloat(boss.x, boss.y - BOSS_R - 28, '추적 미사일!', '#ff9d8f');
      GameSound.play('laser');
      endSkill();
    },
    // 분신 탄막: 흐릿한 분신이 나타났다가 잠시 뒤 둥글게 별 탄을 뿌리고 사라진다.
    clones() {
      const count = raging() ? 3 : 2;
      for (let i = 0; i < count; i++) {
        clones.push(Object.assign(farPoint(), { fireAt: clock + CLONE_WARN_MS }));
      }
      addFloat(boss.x, boss.y - BOSS_R - 28, '분신술!', '#d9b3ff');
      GameSound.play('summon');
      endSkill();
    },
    // 회전 레이저: 점선으로 시작 방향을 보여 준 뒤, 레이저가 반 바퀴 휩쓸고 지나간다.
    sweep() {
      boss.state = 'sweepWarn';
      boss.until = clock + SWEEP_WARN_MS;
      const toPlayer = Math.atan2(player.y - boss.y, player.x - boss.x);
      boss.sweepDir = Math.random() < 0.5 ? 1 : -1;
      boss.sweepAngle = toPlayer - boss.sweepDir * 1.3; // 내 쪽을 지나가도록 조금 옆에서 시작한다
    },
    // 얼음 장판: 밟으면 느려지는 얼음이 깔린다. 하나는 내 발밑에 생긴다.
    ice() {
      const count = raging() ? 4 : 3;
      iceZones.push({ x: player.x, y: player.y });
      while (iceZones.length < count) {
        iceZones.push({ x: rand(ICE_R, W - ICE_R), y: rand(H * 0.35, H - ICE_R) });
      }
      iceZones.forEach(z => {
        z.start = clock;
        z.until = clock + ICE_MS;
      });
      addFloat(boss.x, boss.y - BOSS_R - 28, '얼음 장판!', '#bfe9ff');
      GameSound.play('bossBarrier');
      endSkill();
    },
    // 거대 운석: 내 자리에 아주 큰 그림자가 천천히 짙어지다가 커다란 운석이 떨어진다.
    giant() {
      meteors = [{ x: player.x, y: player.y, r: GIANT_R, start: clock, at: clock + GIANT_FALL_MS * (raging() ? 0.85 : 1) }];
      addFloat(boss.x, boss.y - BOSS_R - 28, '거대 운석!', '#ffb08a');
      GameSound.play('bossMeteors');
      endSkill();
    },
    // 튕기는 구슬: 큰 탄이 벽에 세 번까지 튕기며 돌아다닌다.
    bounce() {
      const count = raging() ? 7 : 5;
      const base = Math.atan2(player.y - boss.y, player.x - boss.x);
      for (let i = 0; i < count; i++) {
        const angle = base + (i - (count - 1) / 2) * 0.45;
        const speed = BOUNCE_SPEED * (raging() ? 1.15 : 1);
        bullets.push({
          x: boss.x, y: boss.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: BOUNCE_R, bounces: BOUNCE_TIMES,
        });
      }
      GameSound.play('bossStar');
      endSkill();
    },
    // 연쇄 번개: 보스에서 내 쪽으로 번개가 한 칸씩 차례로 내리친다. 떨어질 자리는 미리 표시된다.
    lightning() {
      const dir = aimDir(boss, player);
      const count = raging() ? BOLT_COUNT + 2 : BOLT_COUNT;
      for (let i = 0; i < count; i++) {
        const along = BOSS_R + 20 + i * BOLT_STEP;
        bolts.push({
          x: clamp(boss.x + dir.x * along + rand(-10, 10), BOLT_R, W - BOLT_R),
          y: clamp(boss.y + dir.y * along + rand(-10, 10), BOLT_R, H - BOLT_R),
          warnAt: clock + i * BOLT_GAP_MS, at: clock + BOLT_WARN_MS + i * BOLT_GAP_MS, struck: false,
        });
      }
      addFloat(boss.x, boss.y - BOSS_R - 28, '연쇄 번개!', '#fff59a');
      endSkill();
    },
    // 레이저 벽: 양옆에서 레이저 벽이 가운데로 조여 온다. 벽마다 뚫린 틈으로 빠져나가야 한다.
    walls() {
      const start = clock + WALL_WARN_MS;
      const ms = WALL_MS * (raging() ? 0.8 : 1);
      const gapY = () => rand(WALL_GAP, H - WALL_GAP);
      walls = [{ side: -1, gapY: gapY(), start, ms }, { side: 1, gapY: gapY(), start, ms }];
      addFloat(boss.x, boss.y - BOSS_R - 28, '레이저 벽!', '#ff7ad9');
      GameSound.play('bossBeam');
      endSkill();
    },
    // 독구름: 초록 구름이 천천히 나를 따라온다. 안에 있으면 계속 다친다.
    poison() {
      const count = raging() ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const spot = i === 0 ? { x: boss.x, y: boss.y + 40 } : farPoint();
        clouds.push({ x: spot.x, y: spot.y, start: clock, until: clock + POISON_MS });
      }
      addFloat(boss.x, boss.y - BOSS_R - 28, '독구름!', '#9dff8a');
      GameSound.play('bossBlackhole');
      endSkill();
    },
    // 회오리: 화면 옆에서 회오리가 물결치며 가로질러 온다. 들어올 쪽에 화살표가 먼저 뜬다.
    tornado() {
      const count = raging() ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const dir = i % 2 ? -1 : 1; // 번갈아 왼쪽, 오른쪽에서 들어온다
        tornadoes.push({
          dir, x: dir > 0 ? -TORNADO_R : W + TORNADO_R, y0: rand(H * 0.3, H - 60), y: 0,
          phase: rand(0, Math.PI * 2), start: clock + TORNADO_WARN_MS + i * 350,
        });
      }
      tornadoes.forEach(t => { t.y = t.y0; });
      addFloat(boss.x, boss.y - BOSS_R - 28, '회오리!', '#cfe3ff');
      GameSound.play('bossBody');
      endSkill();
    },
  };
  function wallX(w) {
    const t = clamp((clock - w.start) / w.ms, 0, 1);
    return w.side < 0 ? t * W / 2 : W - t * W / 2;
  }
  function sweepDirVec() { return { x: Math.cos(boss.sweepAngle), y: Math.sin(boss.sweepAngle) }; }
  const iceActive = z => clock - z.start >= ICE_FADE_MS; // 깔리는 동안에는 아직 미끄럽지 않다
  const onIce = target => iceZones.some(z => iceActive(z) && Math.hypot(target.x - z.x, target.y - z.y) < ICE_R);
  function crossDirs() {
    return [0, 1, 2, 3].map(i => {
      const angle = boss.crossAngle + i * Math.PI / 2;
      return { x: Math.cos(angle), y: Math.sin(angle) };
    });
  }
  function spawnRainRow() {
    const columns = Math.floor(W / RAIN_GAP);
    const safe = Math.floor(rand(0, columns - RAIN_SAFE + 1));
    for (let i = 0; i < columns; i++) {
      if (i >= safe && i < safe + RAIN_SAFE) continue;
      bullets.push({ x: RAIN_GAP / 2 + i * RAIN_GAP, y: -6, vx: 0, vy: RAIN_SPEED * (raging() ? 1.2 : 1) });
    }
    GameSound.play('bossStar');
  }
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
      const hitByBeam = target => onRay(target, { x: boss.beamX, y: boss.beamY }, BEAM_WIDTH);
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
      if (playing && clock >= boss.until) {
        if (boss.dashChain > 0) { // 연속 돌진: 짧게 경고하고 다시
          boss.dashChain--;
          boss.state = 'dashWarn';
          boss.until = clock + CHAIN_WARN_MS;
        } else {
          endSkill();
        }
      }
    } else if (boss.state === 'volley') {
      if (clock >= boss.nextShot) {
        const base = Math.atan2(player.y - boss.y, player.x - boss.x);
        for (let i = 0; i < VOLLEY_BULLETS; i++) {
          const angle = base + (i - (VOLLEY_BULLETS - 1) / 2) * VOLLEY_SPREAD;
          bullets.push({ x: boss.x, y: boss.y, vx: Math.cos(angle) * VOLLEY_SPEED, vy: Math.sin(angle) * VOLLEY_SPEED });
        }
        GameSound.play('bossStar');
        boss.shotsLeft--;
        boss.nextShot = clock + VOLLEY_GAP_MS;
        if (boss.shotsLeft <= 0) endSkill();
      }
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
    } else if (boss.state === 'spiral') {
      const arms = raging() ? 3 : 2;
      while (clock >= boss.nextShot && boss.nextShot < boss.until) {
        boss.nextShot += SPIRAL_EVERY_MS;
        boss.spin += SPIRAL_TURN;
        const speed = SPIRAL_SPEED * (raging() ? 1.2 : 1);
        for (let i = 0; i < arms; i++) {
          const angle = boss.spin + i / arms * Math.PI * 2;
          bullets.push({ x: boss.x, y: boss.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
        }
      }
      if (Math.floor(clock / 360) !== Math.floor((clock - sec * 1000) / 360)) GameSound.play('bossStar');
      if (clock >= boss.until) endSkill();
    } else if (boss.state === 'quakeWarn') {
      if (clock >= boss.until) {
        quakes.push({ x: boss.x, y: boss.y, start: clock });
        if (raging()) quakes.push({ x: boss.x, y: boss.y, start: clock + 450 }); // 분노하면 두 번 퍼진다
        GameSound.play('meteorBlast');
        endSkill();
      }
    } else if (boss.state === 'crossWarn') {
      if (clock >= boss.until) {
        boss.state = 'cross';
        boss.until = clock + CROSS_MS;
        GameSound.play('bossBeam');
      }
    } else if (boss.state === 'cross') {
      if (raging()) boss.crossAngle += CROSS_SPIN * sec;
      const dirs = crossDirs();
      const hitByCross = target => dirs.some(dir => onRay(target, dir, CROSS_WIDTH));
      if (hitByCross(player)) hitPlayer();
      if (!playing) return;
      livingAllies().forEach(ally => { if (hitByCross(ally)) hitAlly(ally, BOSS_ATTACK); });
      if (clock >= boss.until) endSkill();
    } else if (boss.state === 'starRain') {
      if (clock >= boss.nextShot) {
        spawnRainRow();
        boss.rowsLeft--;
        boss.nextShot = clock + RAIN_ROW_MS;
        if (boss.rowsLeft <= 0) endSkill();
      }
    } else if (boss.state === 'sweepWarn') {
      if (clock >= boss.until) {
        boss.state = 'sweep';
        boss.until = clock + SWEEP_MS;
        GameSound.play('bossBeam');
      }
    } else if (boss.state === 'sweep') {
      boss.sweepAngle += boss.sweepDir * Math.PI / (SWEEP_MS / 1000) * sec * (raging() ? 1.25 : 1);
      const dir = sweepDirVec();
      if (onRay(player, dir, SWEEP_WIDTH)) hitPlayer();
      if (!playing) return;
      livingAllies().forEach(ally => { if (onRay(ally, dir, SWEEP_WIDTH)) hitAlly(ally, BOSS_ATTACK); });
      if (clock >= boss.until) endSkill();
    }
  }
  // 보스에서 dir 방향으로 뻗는 굵기 width의 광선에 닿았는지
  function onRay(target, dir, width) {
    const px = target.x - boss.x, py = target.y - boss.y;
    const along = px * dir.x + py * dir.y;
    return along > 0 && Math.abs(px * dir.y - py * dir.x) < width / 2;
  }
  function quakeRadius(q) { return (clock - q.start) / 1000 * QUAKE_SPEED; }
  function updateHazards(sec) {
    bullets = bullets.filter(b => {
      b.x += b.vx * sec;
      b.y += b.vy * sec;
      if (b.bounces > 0) { // 튕기는 구슬은 벽에 닿으면 방향을 바꾼다
        const r = b.r;
        if ((b.x < r && b.vx < 0) || (b.x > W - r && b.vx > 0)) { b.vx = -b.vx; b.bounces--; }
        else if ((b.y < r && b.vy < 0) || (b.y > H - r && b.vy > 0)) { b.vy = -b.vy; b.bounces--; }
      }
      const br = b.r || BULLET_R;
      const hitsPlayer = Math.hypot(player.x - b.x, player.y - b.y) < br + PLAYER_R - 3;
      const hitAllyTarget = livingAllies().find(a => Math.hypot(a.x - b.x, a.y - b.y) < br + ALLY_R - 3);
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
        beams.push({ blast: true, r: m.r || METEOR_R, x: m.x, y: m.y, until: clock + 280 });
        hitArea(m.x, m.y, m.r || METEOR_R, BOSS_ATTACK * (m.r ? 1.2 : 1));
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
    if (!playing) return;

    quakes = quakes.filter(q => quakeRadius(q) < QUAKE_MAX_R);
    for (const q of quakes) {
      const r = quakeRadius(q);
      if (r <= 0) continue;
      const onRing = target => Math.abs(Math.hypot(target.x - q.x, target.y - q.y) - r) < QUAKE_THICK;
      if (onRing(player)) hitPlayer();
      if (!playing) return;
      livingAllies().forEach(ally => { if (onRing(ally)) hitAlly(ally, BOSS_ATTACK * 0.8); });
    }

    // 추적 미사일: 한 번에 꺾을 수 있는 각도가 정해져 있어서 크게 돌면 피할 수 있다.
    const keptMissiles = [];
    for (const m of missiles) {
      const want = Math.atan2(player.y - m.y, player.x - m.x);
      let turn = want - m.angle;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn)); // -π ~ π 사이로
      const maxTurn = MISSILE_TURN * sec * (raging() ? 1.2 : 1);
      m.angle += clamp(turn, -maxTurn, maxTurn);
      m.x += Math.cos(m.angle) * MISSILE_SPEED * sec;
      m.y += Math.sin(m.angle) * MISSILE_SPEED * sec;
      const hitsPlayer = Math.hypot(player.x - m.x, player.y - m.y) < MISSILE_R + PLAYER_R - 3;
      const ally = livingAllies().find(a => Math.hypot(a.x - m.x, a.y - m.y) < MISSILE_R + ALLY_R - 3);
      if (hitsPlayer || ally || clock >= m.until) {
        beams.push({ blast: true, small: true, x: m.x, y: m.y, until: clock + 280 });
        if (hitsPlayer) hitPlayer();
        if (!playing) return;
        if (ally) hitAlly(ally, BOSS_ATTACK * 0.7);
        continue;
      }
      keptMissiles.push(m);
    }
    missiles = keptMissiles;

    // 분신: 때가 되면 둥글게 별 탄을 뿌리고 사라진다.
    const firing = clones.filter(c => clock >= c.fireAt);
    if (firing.length) {
      clones = clones.filter(c => clock < c.fireAt);
      firing.forEach(c => {
        const spin = rand(0, Math.PI * 2);
        const speed = CLONE_BULLET_SPEED * (raging() ? 1.2 : 1);
        for (let i = 0; i < CLONE_BULLETS; i++) {
          const angle = spin + i / CLONE_BULLETS * Math.PI * 2;
          bullets.push({ x: c.x, y: c.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
        }
      });
      GameSound.play('bossStar');
    }

    iceZones = iceZones.filter(z => clock < z.until);

    // 연쇄 번개: 표시된 자리에 차례로 내리친다.
    for (const bolt of bolts) {
      if (bolt.struck || clock < bolt.at) continue;
      bolt.struck = true;
      GameSound.play('laser');
      hitArea(bolt.x, bolt.y, BOLT_R, BOSS_ATTACK * 0.9);
      if (!playing) return;
    }
    bolts = bolts.filter(bolt => !bolt.struck || clock < bolt.at + 220);

    // 레이저 벽: 벽에 닿았는데 틈 높이가 아니면 맞는다.
    walls = walls.filter(w => clock < w.start + w.ms);
    const hitByWall = target => walls.some(w => clock >= w.start
      && Math.abs(target.x - wallX(w)) < WALL_W / 2 + 4 && Math.abs(target.y - w.gapY) > WALL_GAP / 2);
    if (hitByWall(player)) hitPlayer();
    if (!playing) return;
    livingAllies().forEach(ally => { if (hitByWall(ally)) hitAlly(ally, BOSS_ATTACK); });

    // 독구름: 천천히 나를 따라오고, 안에 있으면 맞는다(무적 시간 덕분에 1초에 한 번).
    clouds = clouds.filter(c => clock < c.until);
    for (const c of clouds) {
      const dir = aimDir(c, player);
      const speed = POISON_SPEED * (raging() ? 1.4 : 1);
      c.x += dir.x * speed * sec;
      c.y += dir.y * speed * sec;
      if (clock - c.start < POISON_FADE_MS) continue; // 퍼지는 동안은 아직 해롭지 않다
      hitArea(c.x, c.y, POISON_R - 6, BOSS_ATTACK * 0.5);
      if (!playing) return;
    }

    // 회오리: 물결치며 가로지르고, 반대편으로 빠져나가면 사라진다.
    tornadoes = tornadoes.filter(t => (t.dir > 0 ? t.x < W + TORNADO_R + 5 : t.x > -TORNADO_R - 5));
    for (const t of tornadoes) {
      if (clock < t.start) continue;
      t.x += t.dir * TORNADO_SPEED * (raging() ? 1.2 : 1) * sec;
      t.phase += sec * 3;
      t.y = t.y0 + Math.sin(t.phase) * TORNADO_WAVE;
      hitArea(t.x, t.y, TORNADO_R, BOSS_ATTACK * 0.8);
      if (!playing) return;
    }

    // 중력 구슬: 느리게 따라오며 가까이 있으면 끌어당기고, 시간이 다 되면 별 탄으로 터진다.
    const keptOrbs = [];
    for (const o of orbs) {
      const dir = aimDir(o, player);
      if (dist(o, player) > ORB_HOVER) { // 바로 위까지 오지는 않고 조금 떨어져 맴돈다
        o.x += dir.x * ORB_SPEED * sec;
        o.y += dir.y * ORB_SPEED * sec;
      }
      const d = dist(o, player);
      if (d < ORB_PULL_R && d > 1) {
        player.x = clamp(player.x - dir.x * ORB_PULL * sec, PLAYER_R, W - PLAYER_R);
        player.y = clamp(player.y - dir.y * ORB_PULL * sec, PLAYER_R, H - PLAYER_R);
      }
      hitArea(o.x, o.y, ORB_R, BOSS_ATTACK * 0.7);
      if (!playing) return;
      if (clock >= o.until) {
        const spin = rand(0, Math.PI * 2);
        for (let i = 0; i < ORB_BURST; i++) {
          const angle = spin + i / ORB_BURST * Math.PI * 2;
          bullets.push({
            x: o.x + Math.cos(angle) * ORB_R, y: o.y + Math.sin(angle) * ORB_R, vx: Math.cos(angle) * 140, vy: Math.sin(angle) * 140,
          });
        }
        beams.push({ blast: true, small: true, x: o.x, y: o.y, until: clock + 280 });
        GameSound.play('meteorBlast');
        continue;
      }
      keptOrbs.push(o);
    }
    orbs = keptOrbs;

    // 지뢰: 켜진 지뢰에 나나 동료가 다가가면 터진다. 시간이 지나면 조용히 사라진다.
    const keptMines = [];
    for (const m of mines) {
      if (clock >= m.until) continue;
      const armed = clock >= m.armAt;
      const near = target => Math.hypot(target.x - m.x, target.y - m.y) < MINE_TRIGGER_R;
      if (armed && (near(player) || livingAllies().some(near))) {
        beams.push({ blast: true, r: MINE_BLAST_R, x: m.x, y: m.y, until: clock + 280 });
        GameSound.play('meteorBlast');
        hitArea(m.x, m.y, MINE_BLAST_R, BOSS_ATTACK * 0.8);
        if (!playing) return;
        continue;
      }
      keptMines.push(m);
    }
    mines = keptMines;
  }

  /* 진행 */
  function movePlayer(sec) {
    const dx = (moves.right ? 1 : 0) - (moves.left ? 1 : 0);
    const dy = (moves.down ? 1 : 0) - (moves.up ? 1 : 0);
    if (!dx && !dy) return;
    const len = Math.hypot(dx, dy); // 대각선이 더 빠르지 않게 한다
    player.faceX = dx / len;
    player.faceY = dy / len;
    const speed = PLAYER_SPEED * (onIce(player) ? ICE_SLOW : 1); // 얼음 위에서는 느려진다
    player.x = clamp(player.x + player.faceX * speed * sec, PLAYER_R, W - PLAYER_R);
    player.y = clamp(player.y + player.faceY * speed * sec, PLAYER_R, H - PLAYER_R);
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
    const warnColor = { dashWarn: '#e2202a', quakeWarn: '#ff9a2e' }[boss.state];
    const warn = warnColor && Math.floor(clock / 90) % 2 === 0;
    const paint = color => (flash ? '#ffffff' : warn ? warnColor : color);
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
  function drawCrossSkill() {
    if (boss.state !== 'crossWarn' && boss.state !== 'cross') return;
    const far = 700;
    ctx.save();
    crossDirs().forEach(dir => {
      ctx.beginPath();
      ctx.moveTo(boss.x, boss.y);
      ctx.lineTo(boss.x + dir.x * far, boss.y + dir.y * far);
      if (boss.state === 'crossWarn') {
        ctx.strokeStyle = '#ffb13b';
        ctx.lineWidth = 2;
        ctx.setLineDash([9, 7]);
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(255,170,60,.9)';
        ctx.lineWidth = CROSS_WIDTH;
        ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = CROSS_WIDTH * 0.35;
        ctx.stroke();
      }
    });
    ctx.restore();
  }
  function drawQuakes() {
    if (boss.state === 'quakeWarn') { // 고리가 퍼질 곳을 미리 보여 준다
      const t = clamp((clock - boss.warnStart) / QUAKE_WARN_MS, 0, 1);
      ctx.strokeStyle = `rgba(255,154,46,${0.25 + t * 0.5})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, BOSS_R + 6 + (1 - t) * 40, 0, Math.PI * 2);
      ctx.stroke();
    }
    quakes.forEach(q => {
      const r = quakeRadius(q);
      if (r <= 0) return;
      const life = 1 - r / QUAKE_MAX_R;
      ctx.strokeStyle = `rgba(255,154,46,${0.35 + life * 0.6})`;
      ctx.lineWidth = QUAKE_THICK * 1.6;
      ctx.beginPath();
      ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,240,200,${life})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    });
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
      const r = m.r || METEOR_R, rock = m.r ? 34 : 12; // 거대 운석은 그림자도 돌도 크다
      ctx.fillStyle = `rgba(226,70,50,${0.12 + t * 0.4})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (m.r) { // 거대 운석은 테두리로 범위를 또렷하게 보여 준다
        ctx.strokeStyle = 'rgba(255,120,90,.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (t > 0.4) {
        ctx.fillStyle = '#7d6653';
        ctx.strokeStyle = '#2b1a10';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(m.x, m.y - (1 - t) / 0.6 * 170, rock, 0, Math.PI * 2);
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
      } else if (shot.kind === 'fireball') {
        const len = Math.max(Math.hypot(shot.vx, shot.vy), 1);
        const ux = shot.vx / len, uy = shot.vy / len;
        ctx.fillStyle = 'rgba(255,120,40,.45)'; // 꼬리 불꽃
        ctx.beginPath();
        ctx.moveTo(shot.x - uy * 8, shot.y + ux * 8);
        ctx.lineTo(shot.x - ux * 26, shot.y - uy * 26);
        ctx.lineTo(shot.x + uy * 8, shot.y - ux * 8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ff6a1f';
        ctx.beginPath();
        ctx.arc(shot.x, shot.y, shot.r + Math.sin(clock / 50) * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffe08a';
        ctx.beginPath();
        ctx.arc(shot.x, shot.y, shot.r * 0.5, 0, Math.PI * 2);
        ctx.fill();
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
      if (beam.heal) { // 지팡이 두더지의 치유 마법: 초록 고리가 퍼진다
        const life = clamp((beam.until - clock) / 400, 0, 1);
        ctx.strokeStyle = `rgba(141,255,160,${life})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(beam.x, beam.y, 14 + (1 - life) * 40, 0, Math.PI * 2);
        ctx.stroke();
        return;
      }
      if (beam.blast) {
        const life = clamp((beam.until - clock) / 280, 0, 1);
        ctx.fillStyle = `rgba(255,140,60,${life * 0.7})`;
        ctx.beginPath();
        ctx.arc(beam.x, beam.y, (beam.small ? 14 : beam.r || METEOR_R) * (1.2 - life * 0.4), 0, Math.PI * 2);
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
    bullets.forEach(b => {
      if (!b.r) {
        drawStarShape(b.x, b.y, BULLET_R + 3, '#ff8fb0', clock / 120);
        return;
      }
      // 튕기는 구슬: 남은 튕김 횟수만큼 고리가 둘러져 있다
      ctx.fillStyle = '#7ad8ff';
      ctx.strokeStyle = '#e8f8ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (let i = 0; i < b.bounces; i++) {
        ctx.strokeStyle = 'rgba(122,216,255,.5)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 4 + i * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
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
  function drawIce() {
    iceZones.forEach(z => {
      const grow = clamp((clock - z.start) / ICE_FADE_MS, 0, 1);
      const fade = clamp((z.until - clock) / 500, 0, 1);
      ctx.globalAlpha = fade;
      ctx.fillStyle = iceActive(z) ? 'rgba(170,225,255,.35)' : 'rgba(170,225,255,.15)';
      ctx.strokeStyle = '#bfe9ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(z.x, z.y, ICE_R * grow, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; // 얼음 결정
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * Math.PI;
        ctx.moveTo(z.x - Math.cos(a) * 12 * grow, z.y - Math.sin(a) * 12 * grow);
        ctx.lineTo(z.x + Math.cos(a) * 12 * grow, z.y + Math.sin(a) * 12 * grow);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }
  function drawSweepSkill() {
    if (boss.state !== 'sweepWarn' && boss.state !== 'sweep') return;
    const dir = sweepDirVec(), far = 700;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(boss.x, boss.y);
    ctx.lineTo(boss.x + dir.x * far, boss.y + dir.y * far);
    if (boss.state === 'sweepWarn') {
      ctx.strokeStyle = '#ff5bd1';
      ctx.lineWidth = 2;
      ctx.setLineDash([9, 7]);
      ctx.stroke();
      // 어느 쪽으로 돌지 화살표로 알려 준다
      const side = boss.sweepAngle + boss.sweepDir * 0.35;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, BOSS_R + 18, Math.min(boss.sweepAngle, side), Math.max(boss.sweepAngle, side));
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255,90,210,.9)';
      ctx.lineWidth = SWEEP_WIDTH;
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = SWEEP_WIDTH * 0.35;
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawClones() {
    clones.forEach(c => {
      const t = clamp(1 - (c.fireAt - clock) / CLONE_WARN_MS, 0, 1);
      ctx.globalAlpha = 0.25 + t * 0.35 + (Math.floor(clock / 80) % 2) * 0.1;
      ctx.fillStyle = '#6d3fb0';
      ctx.strokeStyle = '#d9b3ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, BOSS_R - 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffc22e'; // 흐릿한 왕관
      ctx.beginPath();
      ctx.moveTo(c.x - 18, c.y - 32); ctx.lineTo(c.x - 22, c.y - 52); ctx.lineTo(c.x - 9, c.y - 42);
      ctx.lineTo(c.x, c.y - 58); ctx.lineTo(c.x + 9, c.y - 42); ctx.lineTo(c.x + 22, c.y - 52); ctx.lineTo(c.x + 18, c.y - 32);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff2a2a';
      [-11, 11].forEach(dx => {
        ctx.beginPath();
        ctx.arc(c.x + dx, c.y - 6, 4.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.strokeStyle = `rgba(217,179,255,${1 - t})`; // 터지기 직전까지 줄어드는 고리
      ctx.beginPath();
      ctx.arc(c.x, c.y, BOSS_R + (1 - t) * 30, 0, Math.PI * 2);
      ctx.stroke();
    });
  }
  function drawMissiles() {
    missiles.forEach(m => {
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.angle);
      ctx.fillStyle = Math.floor(clock / 60) % 2 ? '#ffb13b' : '#ff6a1f'; // 꼬리 불꽃
      ctx.beginPath();
      ctx.moveTo(-8, -4); ctx.lineTo(-18, 0); ctx.lineTo(-8, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e8ecff';
      ctx.strokeStyle = '#2b1a10';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(10, 0); ctx.lineTo(4, -5); ctx.lineTo(-8, -5); ctx.lineTo(-8, 5); ctx.lineTo(4, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e2202a';
      ctx.fillRect(-8, -7, 4, 14);
      ctx.restore();
    });
  }
  function drawBolts() {
    bolts.forEach(bolt => {
      if (clock < bolt.warnAt) return;
      if (!bolt.struck) { // 떨어질 자리 표시: 점점 차오르는 노란 원
        const t = clamp((clock - bolt.warnAt) / (bolt.at - bolt.warnAt), 0, 1);
        ctx.strokeStyle = 'rgba(255,245,154,.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bolt.x, bolt.y, BOLT_R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,245,154,${t * 0.35})`;
        ctx.beginPath();
        ctx.arc(bolt.x, bolt.y, BOLT_R * t, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      // 내리친 번개: 위에서 지그재그로 떨어진다
      const life = clamp(1 - (clock - bolt.at) / 220, 0, 1);
      ctx.strokeStyle = `rgba(255,250,200,${life})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      let x = bolt.x + rand(-14, 14);
      ctx.moveTo(x, 0);
      for (let y = 40; y < bolt.y; y += 40) {
        x = bolt.x + rand(-16, 16);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(bolt.x, bolt.y);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,245,154,${life * 0.6})`;
      ctx.beginPath();
      ctx.arc(bolt.x, bolt.y, BOLT_R, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  function drawWalls() {
    walls.forEach(w => {
      const warn = clock < w.start;
      const x = warn ? (w.side < 0 ? WALL_W / 2 : W - WALL_W / 2) : wallX(w);
      const top = w.gapY - WALL_GAP / 2, bottom = w.gapY + WALL_GAP / 2;
      ctx.save();
      if (warn) { // 시작 전: 벽이 나올 자리와 틈을 점선으로 보여 준다
        ctx.strokeStyle = 'rgba(255,122,217,.85)';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x, top);
        ctx.moveTo(x, bottom); ctx.lineTo(x, H);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(255,90,210,.85)';
        ctx.fillRect(x - WALL_W / 2, 0, WALL_W, top);
        ctx.fillRect(x - WALL_W / 2, bottom, WALL_W, H - bottom);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 2, 0, 4, top);
        ctx.fillRect(x - 2, bottom, 4, H - bottom);
      }
      // 틈 양 끝 표시
      ctx.setLineDash([]);
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 10, top); ctx.lineTo(x + 10, top);
      ctx.moveTo(x - 10, bottom); ctx.lineTo(x + 10, bottom);
      ctx.stroke();
      ctx.restore();
    });
  }
  function drawPoison() {
    clouds.forEach(c => {
      const grow = clamp((clock - c.start) / POISON_FADE_MS, 0, 1);
      const fade = clamp((c.until - clock) / 500, 0, 1);
      ctx.globalAlpha = fade;
      for (let i = 0; i < 5; i++) { // 뭉게뭉게 겹친 초록 구름
        const a = i / 5 * Math.PI * 2 + clock / 900;
        ctx.fillStyle = grow < 1 ? 'rgba(120,230,110,.18)' : 'rgba(120,230,110,.32)';
        ctx.beginPath();
        ctx.arc(c.x + Math.cos(a) * 12 * grow, c.y + Math.sin(a) * 9 * grow, 20 * grow, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(40,90,40,.8)'; // 해골 대신 작은 독 방울
      [-7, 0, 7].forEach((dx, i) => {
        ctx.beginPath();
        ctx.arc(c.x + dx, c.y + Math.sin(clock / 200 + i) * 3, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    });
  }
  function drawTornadoes() {
    tornadoes.forEach(t => {
      if (clock < t.start) { // 들어올 쪽 가장자리에 화살표
        const x = t.dir > 0 ? 14 : W - 14;
        ctx.fillStyle = Math.floor(clock / 120) % 2 ? '#cfe3ff' : 'rgba(207,227,255,.4)';
        ctx.beginPath();
        ctx.moveTo(x + t.dir * 10, t.y0);
        ctx.lineTo(x - t.dir * 6, t.y0 - 10);
        ctx.lineTo(x - t.dir * 6, t.y0 + 10);
        ctx.closePath();
        ctx.fill();
        return;
      }
      ctx.save();
      ctx.translate(t.x, t.y);
      for (let i = 0; i < 5; i++) { // 아래로 갈수록 좁아지는 소용돌이
        const ry = -TORNADO_R + i * 12, rx = TORNADO_R - i * 4;
        ctx.strokeStyle = `rgba(207,227,255,${0.9 - i * 0.12})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(Math.sin(clock / 90 + i) * 4, ry, rx, 5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    });
  }
  function drawOrbs() {
    orbs.forEach(o => {
      const left = o.until - clock;
      // 끌어당기는 범위: 안쪽으로 빨려 드는 고리
      ctx.strokeStyle = 'rgba(180,138,255,.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(o.x, o.y, ORB_R + ((clock / 6) % (ORB_PULL_R - ORB_R)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(180,138,255,.18)';
      ctx.beginPath();
      ctx.arc(o.x, o.y, ORB_PULL_R, 0, Math.PI * 2);
      ctx.stroke();
      const blink = left < 700 && Math.floor(clock / 70) % 2; // 터지기 직전 깜빡임
      ctx.fillStyle = blink ? '#ffffff' : '#2a1350';
      ctx.strokeStyle = '#b48aff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(o.x, o.y, ORB_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#d9c4ff';
      ctx.beginPath();
      ctx.arc(o.x - 4, o.y - 4, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  function drawMines() {
    mines.forEach(m => {
      const armed = clock >= m.armAt;
      const fade = clamp((m.until - clock) / 400, 0, 1);
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#3a3f52';
      ctx.strokeStyle = '#11131a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (let i = 0; i < 4; i++) { // 뾰족한 침
        const a = i * Math.PI / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(m.x + Math.cos(a) * 8, m.y + Math.sin(a) * 8);
        ctx.lineTo(m.x + Math.cos(a) * 12, m.y + Math.sin(a) * 12);
        ctx.stroke();
      }
      // 켜지면 빨간 불이 깜빡이고, 터지는 범위가 옅게 보인다
      ctx.fillStyle = armed ? (Math.floor(clock / 250) % 2 ? '#ff3b3b' : '#7a1a1a') : '#6b6f80';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 3, 0, Math.PI * 2);
      ctx.fill();
      if (armed) {
        ctx.strokeStyle = 'rgba(255,90,90,.25)';
        ctx.beginPath();
        ctx.arc(m.x, m.y, MINE_TRIGGER_R, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
  }
  function draw() {
    drawSpace();
    drawIce();
    drawHole();
    drawMeteorShadows();
    drawBeamSkill();
    drawCrossSkill();
    drawSweepSkill();
    drawQuakes();
    drawClones();
    drawBoss();
    drawMinions();
    drawAllies();
    drawPlayer();
    drawBolts();
    drawWalls();
    drawPoison();
    drawTornadoes();
    drawMines();
    drawOrbs();
    drawBullets();
    drawMissiles();
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
      nextShot: 0, spin: 0, warnStart: 0, crossAngle: 0, rowsLeft: 0, sweepAngle: 0, sweepDir: 1,
      dashChain: 0, shotsLeft: 0,
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
    quakes = [];
    missiles = [];
    clones = [];
    iceZones = [];
    bolts = [];
    walls = [];
    clouds = [];
    tornadoes = [];
    orbs = [];
    mines = [];
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
    $('finalSumMerge').textContent = results.merge;
    $('finalSumRun').textContent = results.run;
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
    ['normal', 'shield', 'staff', 'archer', 'hero', 'astronaut'].forEach(id => {
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
