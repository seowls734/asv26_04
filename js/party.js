// 동료 시스템: 단계를 깰 때마다 합류하는 동료의 데이터와 그림, 동료 목록, 획득 알림 창을 맡는다.
// 동료는 모두 gainAlly(동료키)로만 추가한다.
(function () {
  const POPUP_MS = 3000;
  // 순서가 곧 최종 결전에서 줄지어 따라오는 순서다. attackEvery와 skillCooldown의 단위는 초다.
  const PARTY_MEMBERS = [
    {
      id: 'normal', name: '일반 두더지', hp: 52, attack: 2, attackName: '돌멩이', attackEvery: 1.4,
      skillName: '응원 치료', skillDesc: '내 하트 +1', skillCooldown: 13,
    },
    {
      id: 'shield', name: '방패 두더지', hp: 144, attack: 1, attackName: '돌멩이', attackEvery: 1.4,
      skillName: '철벽 방어', skillDesc: '3초 동안 나와 동료 모두 무적', skillCooldown: 11,
    },
    {
      // 공격 대신 다른 동료를 heal만큼 회복한다. 화염구 피해는 skillDamage.
      id: 'staff', name: '지팡이 두더지', hp: 60, attack: 0, heal: 10, attackName: '치유 마법', attackEvery: 4,
      skillName: '화염구 던지기', skillDesc: '화염구 30', skillDamage: 30, skillCooldown: 7,
    },
    {
      id: 'archer', name: '화살 두더지', hp: 72, attack: 10, attackName: '화살', attackEvery: 1.2,
      skillName: '3연발', skillDesc: '화살 3발 부채꼴', skillCooldown: 6,
    },
    {
      id: 'hero', name: '용사 두더지', hp: 144, attack: 35, attackName: '검기', attackEvery: 2.6,
      skillName: '필살 베기', skillDesc: '큰 검기 70', skillCooldown: 8,
    },
    {
      id: 'astronaut', name: '우주 두더지', hp: 200, attack: 70, attackName: '레이저', attackEvery: 3.6,
      skillName: '레이저 포', skillDesc: '굵은 레이저 150', skillCooldown: 10,
    },
  ];

  const LINE = 'stroke="#2b1a10" stroke-width="2.500"';
  const ACCESSORIES = {
    normal: '',
    shield: `<path d="M55 58h34v22q0 18-17 26-17-8-17-26Z" fill="#3f7fd0" ${LINE}/>
      <path d="M72 64v34M61 78h22" stroke="#fff8e6" stroke-width="3"/>`,
    staff: `<path d="M50 1l-30 31h60Z" fill="#5b3fa8" ${LINE}/>
      <path d="M14 32h72" stroke="#2b1a10" stroke-width="5" stroke-linecap="round"/>
      <path d="M14 32h72" stroke="#7a5cd0" stroke-width="2.500" stroke-linecap="round"/>
      <circle cx="46" cy="14" r="3" fill="#ffc22e"/><circle cx="56" cy="22" r="2" fill="#ffc22e"/>
      <path d="M92 40v66" stroke="#2b1a10" stroke-width="6" stroke-linecap="round"/>
      <path d="M92 40v66" stroke="#a0703f" stroke-width="3" stroke-linecap="round"/>
      <circle cx="92" cy="36" r="7" fill="#ff8a3d" ${LINE}/>
      <circle cx="90" cy="34" r="2.500" fill="#ffe3a0"/>`,
    archer: `<path d="M13 30q37-14 74 0v9q-37-13-74 0Z" fill="#d92f2f" ${LINE}/>
      <path d="M87 34l10-6M87 36l10 5" stroke="#d92f2f" stroke-width="4" stroke-linecap="round"/>
      <path d="M12 54q-16 24 0 48" fill="none" stroke="#6b4526" stroke-width="4"/>
      <path d="M12 54v48" stroke="#fff8e6" stroke-width="1.500"/>`,
    hero: `<path d="M12 31a38 28 0 0 1 76 0l-2 5H14Z" fill="#aeb9c4" ${LINE}/>
      <path d="M50 3v33" stroke="#2b1a10" stroke-width="2.500"/>
      <path d="M50 3q15-8 18 4-9-2-18 4Z" fill="#e2452f" ${LINE}/>
      <path d="M92 44v48" stroke="#2b1a10" stroke-width="7" stroke-linecap="round"/>
      <path d="M92 44v48" stroke="#dfe7ee" stroke-width="4" stroke-linecap="round"/>
      <path d="M83 90h18" stroke="#e6b422" stroke-width="5" stroke-linecap="round"/>
      <path d="M92 92v12" stroke="#6b4526" stroke-width="5" stroke-linecap="round"/>`,
    astronaut: `<circle cx="50" cy="48" r="46" fill="rgba(190,230,255,.28)" stroke="#dcefff" stroke-width="4"/>
      <path d="M22 26q10-14 26-16" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`,
  };

  // 갈색 두더지를 기본으로 동료마다 장비를 더한다.
  function memberArt(id) {
    return `<svg viewBox="0 0 100 110" aria-hidden="true">
      <path d="M10 112V50a40 40 0 0 1 80 0v62Z" fill="#8a5a35" ${LINE}/>
      <ellipse cx="50" cy="94" rx="26" ry="28" fill="#d9b48a"/>
      <ellipse cx="50" cy="60" rx="20" ry="14" fill="#d9b48a"/>
      <circle cx="36" cy="44" r="6" fill="#1c120c"/><circle cx="64" cy="44" r="6" fill="#1c120c"/>
      <circle cx="38" cy="42" r="2" fill="#fff"/><circle cx="66" cy="42" r="2" fill="#fff"/>
      <ellipse cx="50" cy="55" rx="7" ry="5" fill="#e8788a" ${LINE}/>
      <path d="M44 66h12v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2Z" fill="#fff" ${LINE}/>
      <path d="M50 66v10" stroke="#2b1a10" stroke-width="2"/>
      ${ACCESSORIES[id]}
    </svg>`;
  }

  const byId = id => PARTY_MEMBERS.find(member => member.id === id);
  // 회복 동료는 공격력 대신 회복량을 보여 준다.
  const statLine = member => (member.heal
    ? `체력 ${member.hp} · 회복 ${member.heal}`
    : `체력 ${member.hp} · 공격력 ${member.attack}`);
  let joined = [];
  let popup = null, popupTimer = 0;

  /* 획득 알림 창 */
  function closePopup() {
    clearTimeout(popupTimer);
    if (popup) popup.hidden = true;
  }
  function showPopup(member) {
    if (!popup) {
      popup = document.createElement('div');
      popup.id = 'allyPopup';
      popup.className = 'ally-popup';
      popup.setAttribute('role', 'status');
      popup.addEventListener('pointerdown', e => {
        e.preventDefault();
        closePopup();
      });
      document.body.append(popup);
    }
    popup.innerHTML = `<div class="ally-popup-box">
      <h2>동료 획득!</h2>
      <b class="ally-popup-name">${member.name} 획득!</b>
      <div class="ally-popup-art">${memberArt(member.id)}</div>
      <p>${statLine(member)}</p>
      <p class="ally-popup-skill"><b>${member.skillName}</b> ${member.skillDesc}</p>
      <small>동료 ${joined.length}/${PARTY_MEMBERS.length}</small>
    </div>`;
    popup.hidden = false;
    clearTimeout(popupTimer);
    popupTimer = setTimeout(closePopup, POPUP_MS);
    GameSound.play('allyJoin');
  }
  document.addEventListener('keydown', e => {
    if (popup && !popup.hidden && (e.code === 'Enter' || e.code === 'Escape')) closePopup();
  });

  window.gainAlly = id => {
    if (joined.includes(id)) return;
    joined.push(id);
    showPopup(byId(id));
  };

  window.Party = {
    reset() {
      joined = [];
      closePopup();
    },
    // 합류한 순서와 상관없이 정해진 행동 순서로 돌려준다.
    members() { return PARTY_MEMBERS.filter(member => joined.includes(member.id)); },
    art: memberArt,
    // 성공 카드 안의 data-join 자리를 합류 안내로 채운다.
    fillJoinCards() {
      document.querySelectorAll('[data-join]').forEach(el => {
        const member = byId(el.dataset.join);
        el.innerHTML = `<div class="join-art">${memberArt(member.id)}</div>
          <div class="join-text"><b>${member.name}가 동료가 되었어요!</b>
          <span>${statLine(member)}</span></div>`;
      });
    },
  };
})();
