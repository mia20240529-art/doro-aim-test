// Run with node tests/interaction.cjs. Exercises classic-script loading together
// and input dispatch; this is not a substitute for real-device rendering checks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const data = new Map();

function boot() {
  let now = 1000, timerId = 0;
  const timers = new Map(), nodes = new Map();
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
    requestAnimationFrame: fn => fn(),
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
    const entry = [...timers].find(([, timer]) => timer.delay === 260);
    assert.ok(entry, 'first target was scheduled'); timers.delete(entry[0]); entry[1].fn();
  };
  const targetTap = fraction => {
    const style = get('#target').style;
    now += 150;
    tap(parseFloat(style.left) + parseFloat(style.width) / 2,
      parseFloat(style.top) + parseFloat(style.width) * fraction);
  };
  return { get, action, tap, firstSpawn, targetTap, window, timers,
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
console.log('PASS: script startup, mode button, start, pointer scoring, combo, timed results, replay and storage reload');
