const STORAGE_KEY = 'doro-aim-test:v1';

const DEFAULT_SETTINGS = {
  sound: true,
  vibration: true,
  music: false,
  targetSize: 'normal',
  refresh: 'normal',
  crosshair: 'cross',
  crosshairColor: '#ff4f9a',
  duration: 30,
  nickname: 'Doro',
};

const defaultState = () => ({
  nickname: 'Doro',
  best: { score: 0, fastest: null, accuracy: 0, combo: 0 },
  recent: null,
  history: [],
  modeBest: {},
  settings: { ...DEFAULT_SETTINGS },
});

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    const base = defaultState();
    return {
      ...base,
      ...saved,
      best: { ...base.best, ...(saved?.best || {}) },
      settings: { ...base.settings, ...(saved?.settings || {}) },
      history: Array.isArray(saved?.history) ? saved.history : [],
      modeBest: saved?.modeBest || {},
      nickname: String(saved?.nickname || saved?.settings?.nickname || 'Doro').slice(0, 12),
    };
  } catch (error) {
    console.warn('Unable to load local score data.', error);
    return defaultState();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Unable to save local score data.', error);
  }
}

function updateSettings(state, patch) {
  state.settings = { ...state.settings, ...patch };
  if (patch.nickname !== undefined) state.nickname = String(patch.nickname).trim().slice(0, 12) || 'Doro';
  saveState(state);
}

function saveResult(state, result) {
  const previous = state.best;
  const isNewRecord = result.score > previous.score;
  const fastest = previous.fastest === null ? result.fastest : (result.fastest === null ? previous.fastest : Math.min(previous.fastest, result.fastest));
  state.best = {
    score: Math.max(previous.score, result.score),
    fastest,
    accuracy: Math.max(previous.accuracy, result.accuracy),
    combo: Math.max(previous.combo, result.maxCombo),
  };
  const modeBest = state.modeBest[result.mode] || { score: 0, fastest: null, accuracy: 0 };
  state.modeBest[result.mode] = {
    score: Math.max(modeBest.score, result.score),
    fastest: modeBest.fastest === null ? result.fastest : (result.fastest === null ? modeBest.fastest : Math.min(modeBest.fastest, result.fastest)),
    accuracy: Math.max(modeBest.accuracy, result.accuracy),
  };
  const record = { ...result, nickname: state.nickname, date: new Date().toISOString() };
  state.recent = record;
  state.history = [record, ...state.history].sort((a, b) => b.score - a.score || a.date.localeCompare(b.date)).slice(0, 100);
  saveState(state);
  return { isNewRecord, record };
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

function modeLabel(mode) {
  return ({ classic: '经典模式', precision: '精准模式', crazy: '疯狂模式', single: '单次反应测试' })[mode] || '经典模式';
}

window.DoroStorage = { DEFAULT_SETTINGS, STORAGE_KEY, loadState, saveState, updateSettings, saveResult, formatDate, modeLabel };
