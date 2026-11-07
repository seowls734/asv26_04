// 화면 전환과 키보드 입력 연결: 일곱 단계를 이어 주고, 키 입력은 지금 켜진 게임에만 전달한다.
(function () {
  const $ = id => document.getElementById(id);
  const SCREENS = ['mole', 'merge', 'run', 'arrow', 'boss', 'space', 'final'];
  const results = { mole: 0, merge: 0, run: 0, arrow: 0, boss: '', space: 0 };
  let activeGame = MoleGame;

  function setScreen(name) {
    SCREENS.forEach(screen => { $(screen + 'Screen').hidden = screen !== name; });
    document.body.dataset.screen = name;
    document.querySelectorAll('.stages li').forEach(li => {
      if (li.dataset.stage === name) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
  }
  function stopAll() {
    MoleGame.stop();
    MergeGame.stop();
    RunGame.stop();
    ArrowGame.stop();
    BossGame.stop();
    SpaceGame.stop();
    FinalGame.stop();
  }
  // "처음부터 다시"와 "두더지로 돌아가기"가 모두 이 함수로 오므로 동료도 여기서 초기화한다.
  function showMoleScreen() {
    stopAll();
    Party.reset();
    activeGame = MoleGame;
    setScreen('mole');
    MoleGame.showStart();
  }
  function showMergeScreen() {
    stopAll();
    activeGame = MergeGame;
    setScreen('merge');
    MergeGame.showIntro();
  }
  function showRunScreen() {
    stopAll();
    activeGame = RunGame;
    setScreen('run');
    RunGame.showIntro();
  }
  function showArrowScreen() {
    stopAll();
    activeGame = ArrowGame;
    setScreen('arrow');
    ArrowGame.showIntro();
  }
  function showBossScreen() {
    stopAll();
    activeGame = BossGame;
    setScreen('boss');
    BossGame.showIntro();
  }
  function showSpaceScreen() {
    stopAll();
    activeGame = SpaceGame;
    setScreen('space');
    SpaceGame.showIntro();
  }
  function showFinalScreen() {
    stopAll();
    activeGame = FinalGame;
    setScreen('final');
    FinalGame.begin(results);
  }

  function renderSoundButton() {
    const on = GameSound.isEnabled();
    const btn = $('soundBtn');
    btn.textContent = on ? '소리 켜짐' : '소리 꺼짐';
    btn.setAttribute('aria-pressed', String(on));
  }
  $('soundBtn').addEventListener('click', () => {
    GameSound.setEnabled(!GameSound.isEnabled());
    renderSoundButton();
    GameSound.play('start');
  });

  document.addEventListener('pointerdown', GameSound.unlock);
  document.addEventListener('keydown', e => {
    GameSound.unlock();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // 두더지 외의 게임 중에는 포커스가 남은 버튼이 스페이스에 눌리지 않게 한다.
    if (activeGame !== MoleGame && activeGame.isPlaying() && document.activeElement.tagName === 'BUTTON') {
      document.activeElement.blur();
    }
    if (activeGame.handleKey(e)) e.preventDefault(); // 방향키로 화면이 스크롤되지 않게 막는다
  });
  document.addEventListener('keyup', e => {
    if (activeGame.handleKeyUp) activeGame.handleKeyUp(e);
  });

  MoleGame.init({
    onSuccess(score) {
      results.mole = score;
      showMergeScreen();
    },
  });
  MergeGame.init({
    onBack: showMoleScreen,
    onSuccess(score) {
      results.merge = score;
      showRunScreen();
    },
  });
  RunGame.init({
    onBack: showMoleScreen,
    onSuccess(score) {
      results.run = score;
      showArrowScreen();
    },
  });
  ArrowGame.init({
    onBack: showMoleScreen,
    onSuccess(dodged) {
      results.arrow = dodged;
      showBossScreen();
    },
  });
  BossGame.init({
    onBack: showMoleScreen,
    onSuccess(time) {
      results.boss = time;
      showSpaceScreen();
    },
  });
  SpaceGame.init({
    onBack: showMoleScreen,
    onSuccess(destroyed) {
      results.space = destroyed;
      showFinalScreen();
    },
  });
  FinalGame.init({ onBack: showMoleScreen });
  Party.fillJoinCards();
  renderSoundButton();
  setScreen('mole');
})();
