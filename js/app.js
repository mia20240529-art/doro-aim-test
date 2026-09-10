const { AimGame, MODE_CONFIG } = window.DoroAimGame;
const { formatDate, loadState, modeLabel, saveResult, saveState, updateSettings } = window.DoroStorage;

const state = loadState();
let selectedMode = 'classic';
let currentResult = null;
let game = null;
let musicContext = null;
let musicNodes = [];

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

function beep(kind = 'hit') {
  if (!state.settings.sound) return;
  try {
    const context = musicContext || new AudioContext();
    musicContext = context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === 'miss' ? 'sawtooth' : 'sine';
    oscillator.frequency.value = kind === 'head' ? 880 : kind === 'body' ? 560 : 150;
    gain.gain.setValueAtTime(0.045, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.11);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + 0.12);
  } catch { /* Audio is optional on browsers that block it. */ }
}

function setMusic(enabled) {
  if (!enabled) {
    musicNodes.forEach((node) => { try { node.stop(); } catch {} });
    musicNodes = [];
    return;
  }
  try {
    const context = musicContext || new AudioContext();
    musicContext = context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = 110;
    gain.gain.value = 0.008;
    oscillator.connect(gain).connect(context.destination); oscillator.start();
    musicNodes = [oscillator];
  } catch { /* Background music is an enhancement, not a dependency. */ }
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
  });
  $$('[data-mode]').forEach((button) => button.addEventListener('click', () => { selectedMode = button.dataset.mode; $$('[data-mode]').forEach((item) => item.classList.toggle('selected', item === button)); }));
  $('#setting-sound').addEventListener('change', (event) => updateSettings(state, { sound: event.target.checked }));
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
