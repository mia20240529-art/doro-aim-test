// Keep imported names local: classic scripts otherwise share global declarations.
(() => {
const { AimGame, MODE_CONFIG } = window.DoroAimGame;
const { formatDate, loadState, modeLabel, saveResult, saveState, updateSettings } = window.DoroStorage;

const state = loadState();
let selectedMode = 'classic';
let currentResult = null;
let game = null;
let musicContext = null;
let musicNodes = [];
let musicTimer = null;
let musicGeneration = 0;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function showView(name) {
  $$('.view').forEach((view) => view.classList.toggle('active', view.dataset.view === name));
  window.scrollTo?.(0, 0);
  if (name === 'home') refreshHome();
  if (name === 'leaderboard') renderLeaderboard();
  if (name === 'settings') renderSettings();
}

function refreshHome() {
  $('#home-best-score').textContent = state.best.score.toLocaleString();
  $('#home-best-reaction').textContent = state.best.fastest === null ? '—' : `${Math.round(state.best.fastest)}ms`;
  $('#home-recent-score').textContent = state.recent ? `${state.recent.score.toLocaleString()} 分` : '—';
  $('#home-recent-meta').textContent = state.recent ? `${modeLabel(state.recent.mode)} · ${formatDate(state.recent.date)}` : '还没有训练记录';
}

function renderLeaderboard() {
  const body = $('#leaderboard-body');
  const records = state.history.slice(0, 10);
  body.innerHTML = records.length ? records.map((record, index) => `<tr><td class="rank">${String(index + 1).padStart(2, '0')}</td><td><strong>${escapeHtml(record.nickname || 'Doro')}</strong><small>${modeLabel(record.mode)}</small></td><td class="table-score">${record.score.toLocaleString()}</td><td>${Math.round(record.accuracy * 100)}%</td><td>${record.fastest === null ? '—' : `${Math.round(record.fastest)}ms`}</td><td>${formatDate(record.date)}</td></tr>`).join('') : '<tr><td colspan="6" class="empty-row">完成一局训练后，成绩会出现在这里。</td></tr>';
}

function renderSettings() {
  const settings = state.settings;
  $('#setting-sound').checked = settings.sound;
  $('#setting-volume').value = String(settings.volume ?? 0.7);
  $('#setting-vibration').checked = settings.vibration;
  $('#setting-music').checked = settings.music;
  $('#setting-target-size').value = settings.targetSize;
  $('#setting-refresh').value = settings.refresh;
  $('#setting-crosshair').value = settings.crosshair;
  $('#setting-crosshair-color').value = settings.crosshairColor;
  $('#setting-duration').value = String(settings.duration);
  $('#setting-nickname').value = state.nickname;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function vibrate(pattern) {
  if (state.settings.vibration && navigator.vibrate) navigator.vibrate(pattern);
}

function unlockAudio() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return Promise.resolve(null);
    if (!musicContext || musicContext.state === 'closed') musicContext = new Audio();
    // Call resume inside the start/tap gesture, including iOS interrupted sessions.
    const ready = musicContext.state === 'running' ? Promise.resolve() : musicContext.resume();
    return ready.then(() => musicContext).catch(() => null);
  } catch { return Promise.resolve(null); }
}

function playTone(context, frequency, offset, duration, strength, type = 'triangle') {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start = context.currentTime + offset;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.7, start + duration);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.linearRampToValueAtTime(strength * (state.settings.volume ?? 0.7), start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  oscillator.start(start); oscillator.stop(start + duration + 0.01);
  return oscillator;
}

function beep(kind = 'body', preview = false) {
  if (!preview && !state.settings.sound) return;
  void unlockAudio().then(context => {
    if (!context || context.state !== 'running') {
      if (preview) showToast('声音未启用，请在 Safari / Chrome 中重试');
      return;
    }
    const frequency = { head: 1200, body: 680, miss: 240, start: 880 }[kind] || 680;
    playTone(context, frequency, 0, 0.16, 0.28);
    if (kind === 'head' || kind === 'start') playTone(context, frequency * 1.4, 0.07, 0.15, 0.16);
    if (preview) showToast('已播放测试音，请确认手机媒体音量');
  });
}

function setMusic(enabled) {
  const generation = ++musicGeneration;
  window.clearInterval(musicTimer);
  musicNodes.forEach(node => { try { node.stop(); } catch {} });
  musicNodes = [];
  if (!enabled) return;
  void unlockAudio().then(context => {
    if (!context || generation !== musicGeneration) return;
    let step = 0;
    const notes = [220, 330, 440, 330, 262, 392, 523, 392];
    const beat = () => {
      musicNodes = [playTone(context, notes[step++ % notes.length], 0, 0.24, 0.08, 'sine')];
    };
    beat();
    musicTimer = window.setInterval(beat, 300);
  });
}

function showFeedback({ x, y, text, tone }) {
  const layer = $('#hit-layer');
  const crosshair = document.createElement('div');
  crosshair.className = `crosshair crosshair-${state.settings.crosshair} tone-${tone}`;
  crosshair.style.left = `${x}px`; crosshair.style.top = `${y}px`; crosshair.style.setProperty('--crosshair-color', state.settings.crosshairColor);
  crosshair.innerHTML = '<span></span>';
  layer.append(crosshair);
  window.setTimeout(() => crosshair.remove(), 500);
  if (text) {
    const float = document.createElement('div'); float.className = `float-score tone-${tone}`; float.style.left = `${x}px`; float.style.top = `${y - 24}px`; float.textContent = text; layer.append(float); window.setTimeout(() => float.remove(), 700);
  }
}

function startGame(mode = selectedMode) {
  beep('start');
  game?.destroy();
  selectedMode = mode;
  showView('game');
  const settings = { ...state.settings };
  const stage = $('#game-stage');
  const target = $('#target');
  $('#game-mode-label').textContent = MODE_CONFIG[mode].short;
  $('#game-progress').textContent = mode === 'single' ? 'SHOT 0 / 5' : 'LIVE TRAINING';
  game = new AimGame(stage, target, {
    onStart: ({ duration }) => { $('#game-time').textContent = duration ? `${duration}.0` : '—'; $('#game-score').textContent = '0'; $('#game-combo').textContent = '0'; setMusic(state.settings.music); },
    onTick: (seconds) => { $('#game-time').textContent = seconds.toFixed(1); },
    onTarget: () => { $('#game-progress').textContent = mode === 'single' ? `SHOT ${game.singleCount + 1} / 5` : 'TARGET LIVE'; },
    onProgress: (current, total) => { $('#game-progress').textContent = `SHOT ${current} / ${total}`; },
    onPointer: (x, y) => showFeedback({ x, y, tone: 'tap' }),
    onHit: ({ type, points, combo, reaction, x, y }) => { showFeedback({ x, y, text: `+${points}`, tone: type }); beep(type); vibrate(type === 'head' ? [14, 18, 14] : 12); $('#game-combo').textContent = String(combo); $('#game-time').classList.remove('pulse'); void $('#game-time').offsetWidth; $('#game-time').classList.add('pulse'); },
    onMiss: ({ x, y }) => { showFeedback({ x, y, text: '−50', tone: 'miss' }); beep('miss'); vibrate(36); $('#game-combo').textContent = '0'; },
    onUpdate: (stats) => { $('#game-score').textContent = stats.score.toLocaleString(); $('#game-combo').textContent = String(stats.combo); },
    onFinish: finishGame,
    onQuit: () => setMusic(false),
  }, settings);
  game.start(mode);
}

function finishGame(result) {
  setMusic(false);
  currentResult = result;
  const saved = saveResult(state, result);
  $('#result-score').textContent = result.score.toLocaleString();
  $('#result-mode').textContent = `${modeLabel(result.mode)} · ${result.mode === 'single' ? '5 次' : `${result.duration} 秒`}`;
  $('#result-head').textContent = result.headHits;
  $('#result-body').textContent = result.bodyHits;
  $('#result-hits').textContent = result.hits;
  $('#result-misses').textContent = result.misses;
  $('#result-accuracy').textContent = `${Math.round(result.accuracy * 100)}%`;
  $('#result-fastest').textContent = result.fastest === null ? '—' : `${Math.round(result.fastest)}ms`;
  $('#result-average').textContent = result.average === null ? '—' : `${Math.round(result.average)}ms`;
  $('#result-combo').textContent = result.maxCombo;
  $('#new-record-badge').classList.toggle('hidden', !saved.isNewRecord);
  showView('results');
}

function populateCard() {
  if (!currentResult) return;
  const result = currentResult;
  $('#card-nickname').textContent = state.nickname;
  $('#card-score-value').textContent = result.score.toLocaleString();
  $('#card-fastest').textContent = result.fastest === null ? '—' : `${Math.round(result.fastest)}ms`;
  $('#card-average').textContent = result.average === null ? '—' : `${Math.round(result.average)}ms`;
  $('#card-accuracy').textContent = `${Math.round(result.accuracy * 100)}%`;
  $('#card-head').textContent = result.headHits;
  $('#card-body').textContent = result.bodyHits;
  $('#card-combo').textContent = result.maxCombo;
  $('#card-mode').textContent = modeLabel(result.mode).replace('模式', '');
  $('#card-date').textContent = formatDate(new Date());
  $('#card-best').textContent = result.score >= state.best.score ? 'LOCAL BEST' : 'SESSION REPORT';
}

function resultText() {
  if (!currentResult) return '';
  const r = currentResult;
  return `Doro Aim Test｜${state.nickname}\n${modeLabel(r.mode)}\n总分 ${r.score}｜命中率 ${Math.round(r.accuracy * 100)}%\n最快反应 ${r.fastest === null ? '—' : `${Math.round(r.fastest)}ms`}｜平均反应 ${r.average === null ? '—' : `${Math.round(r.average)}ms`}\n头部 ${r.headHits}｜身体 ${r.bodyHits}｜最高连击 ${r.maxCombo}`;
}

async function copyResult() {
  const text = resultText();
  try { await navigator.clipboard.writeText(text); showToast('成绩已复制'); }
  catch { showToast('复制失败，请手动截图分享'); }
}

function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 1800);
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'start-default') startGame('classic');
    if (action === 'start-selected') startGame(selectedMode);
    if (action === 'show-mode') showView('mode');
    if (action === 'show-leaderboard') showView('leaderboard');
    if (action === 'show-settings') showView('settings');
    if (action === 'show-help') showView('help');
    if (action === 'go-home') { game?.stop(false); setMusic(false); showView('home'); }
    if (action === 'quit-game') { game?.stop(true); setMusic(false); showView('home'); }
    if (action === 'replay') startGame(currentResult?.mode || selectedMode);
    if (action === 'show-card') { populateCard(); showView('card'); }
    if (action === 'back-results') showView('results');
    if (action === 'copy-result') copyResult();
    if (action === 'test-sound') beep('head', true);
  });
  $$('[data-mode]').forEach((button) => button.addEventListener('click', () => { selectedMode = button.dataset.mode; $$('[data-mode]').forEach((item) => item.classList.toggle('selected', item === button)); }));
  $('#setting-sound').addEventListener('change', (event) => {
    updateSettings(state, { sound: event.target.checked });
    if (event.target.checked) beep('head');
  });
  $('#setting-volume').addEventListener('input', event => updateSettings(state, { volume: Number(event.target.value) }));
  $('#setting-vibration').addEventListener('change', (event) => updateSettings(state, { vibration: event.target.checked }));
  $('#setting-music').addEventListener('change', (event) => { updateSettings(state, { music: event.target.checked }); setMusic(event.target.checked); });
  $('#setting-target-size').addEventListener('change', (event) => updateSettings(state, { targetSize: event.target.value }));
  $('#setting-refresh').addEventListener('change', (event) => updateSettings(state, { refresh: event.target.value }));
  $('#setting-crosshair').addEventListener('change', (event) => updateSettings(state, { crosshair: event.target.value }));
  $('#setting-crosshair-color').addEventListener('change', (event) => updateSettings(state, { crosshairColor: event.target.value }));
  $('#setting-duration').addEventListener('change', (event) => updateSettings(state, { duration: Number(event.target.value) }));
  $('#setting-nickname').addEventListener('input', (event) => { state.nickname = event.target.value.trim().slice(0, 12) || 'Doro'; state.settings.nickname = state.nickname; saveState(state); });
}

refreshHome(); renderSettings(); bindEvents();
})();
