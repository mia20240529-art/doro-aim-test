// Run with node tests/interaction.cjs. Exercises classic-script loading together
// and input dispatch; this is not a substitute for real-device rendering checks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const data = new Map();

function boot() {
  let now = 1000, timerId = 0;
  const timers = new Map(), nodes = new Map(), frames = new Map();
  const audio = { resumes: 0, starts: 0 };
  function element() {
    const classes = new Set(), listeners = new Map();
    return {
      style: { setProperty() {} }, dataset: {}, complete: false,
      classList: {
        add: (...names) => names.forEach(n => classes.add(n)),
        remove: (...names) => names.forEach(n => classes.delete(n)),
        toggle(n, on) { on ? classes.add(n) : classes.delete(n); },
        contains: n => classes.has(n),
      },
      addEventListener(name, fn) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
      },
      removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
      dispatch(name, event) { for (const fn of listeners.get(name) || []) fn(event); },
      count(name) { return listeners.get(name)?.size || 0; },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }),
      getContext: () => ({}), append() {}, remove() {},
    };
  }
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, element());
    return nodes.get(id);
  };
  const views = ['home', 'game', 'results', 'mode', 'settings', 'leaderboard', 'card'].map(name => {
    const view = get('#' + name + '-view'); view.dataset.view = name; return view;
  });
  const document = Object.assign(element(), {
    querySelector: get,
    querySelectorAll: selector => selector === '.view' ? views : [],
    createElement: element,
  });
  const setTimer = (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; };
  const window = {
    scrollTo() {}, setTimeout: setTimer, setInterval: setTimer,
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
    requestAnimationFrame: fn => { frames.set(++timerId, fn); return timerId; },
    cancelAnimationFrame: id => frames.delete(id),
    getComputedStyle: () => ({ paddingTop: '94px', paddingBottom: '64px' }),
    matchMedia: () => ({ matches: false }),
    AudioContext: class {
      constructor() { this.state = 'suspended'; this.currentTime = 0; }
      resume() { audio.resumes++; this.state = 'running'; return Promise.resolve(); }
      createOscillator() { return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect(n) { return n; }, start() { audio.starts++; }, stop() {}, disconnect() {} }; }
      createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {}, disconnect() {} }; }
    },
  };
  const context = vm.createContext({ window, document, console,
    navigator: {}, performance: { now: () => now },
    localStorage: { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) },
  });
  for (const file of ['storage', 'game', 'app']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file + '.js'), 'utf8'), context, { filename: file + '.js' });
  }
  const action = name => document.dispatch('click', { target: { closest: () => ({ dataset: { action: name } }) } });
  const tap = (x, y) => get('#game-stage').dispatch('pointerdown', { clientX: x, clientY: y, preventDefault() {} });
  const firstSpawn = () => {
    for (const [id, fn] of [...frames]) { frames.delete(id); fn(); }
    const entry = [...timers].find(([, timer]) => timer.delay === 260);
    assert.ok(entry, 'first target was scheduled'); timers.delete(entry[0]); entry[1].fn();
  };
  const targetTap = fraction => {
    const style = get('#target').style;
    now += 150;
    const offset = style.transform.match(/translate3d\(([-.\d]+)px, ([-.\d]+)px/);
    tap(parseFloat(style.left) + Number(offset?.[1] || 0) + parseFloat(style.width) / 2,
      parseFloat(style.top) + Number(offset?.[2] || 0) + parseFloat(style.width) * fraction);
  };
  return { get, action, tap, firstSpawn, targetTap, window, timers, frames, audio,
    advance: value => { now += value; },
  };
}

const app = boot();
app.action('show-mode');
assert.ok(app.get('#mode-view').classList.contains('active'));
app.action('start-default');
assert.ok(app.get('#game-view').classList.contains('active'));
assert.equal(app.get('#game-stage').count('pointerdown'), 1);
app.firstSpawn();
assert.ok(parseFloat(app.get('#target').style.width) < 120, 'smaller mobile target');
app.advance(300);
for (const [id, fn] of [...app.frames]) { app.frames.delete(id); fn(); }
assert.notEqual(app.get('#target').style.transform, 'translate3d(0, 0, 0)', 'live target moves');
app.targetTap(0.2);
assert.equal(app.get('#game-score').textContent, '250', 'head hit');
// Trigger the pending next-target timer (other timeouts are visual feedback).
for (const [id, timer] of [...app.timers]) {
  if (timer.delay >= 180 && timer.delay <= 460) { app.timers.delete(id); timer.fn(); }
}
app.targetTap(0.7);
assert.equal(app.get('#game-score').textContent, '350', 'body hit');
app.tap(0, 0);
assert.equal(app.get('#game-score').textContent, '300', 'miss');
assert.equal(app.get('#game-combo').textContent, '0');
app.advance(31000);
[...app.timers.values()].find(timer => timer.delay === 50).fn();
assert.ok(app.get('#results-view').classList.contains('active'));
assert.equal(app.get('#result-score').textContent, '300');
assert.equal(app.get('#result-combo').textContent, 2);
app.action('replay');
assert.equal(app.get('#game-stage').count('pointerdown'), 1, 'no input listener leak on replay');
const reloaded = boot();
assert.equal(reloaded.get('#home-best-score').textContent, '300', 'best score survives reload');
const { AimGame } = reloaded.window.DoroAimGame;
const single = new AimGame(reloaded.get('#game-stage'), reloaded.get('#target'), {}, { duration: 30 });
single.mode = 'single'; single.running = true; single.spawnTarget();
assert.equal(reloaded.frames.size, 0, 'single reaction mode stays stationary');
single.mode = 'crazy'; single.spawnTarget();
for (let i = 0; i < 100; i++) {
  reloaded.advance(100);
  for (const [id, fn] of [...reloaded.frames]) { reloaded.frames.delete(id); fn(); }
  const t = single.targetState;
  assert.ok(t.x >= 20 && t.x + t.width <= 370, 'horizontal safe bounds');
  assert.ok(t.y >= 94 && t.y + t.height <= 780, 'vertical safe bounds');
}
single.destroy();
assert.equal(reloaded.frames.size, 0, 'motion stops on destruction');
setImmediate(() => {
  assert.ok(app.audio.resumes > 0, 'suspended mobile audio resumes on start');
  assert.ok(app.audio.starts >= 5, 'start and hit sounds are scheduled');
  console.log('PASS: startup, scoring moving targets, smaller size, bounds, static single mode, audio resume, results, replay, storage');
});
