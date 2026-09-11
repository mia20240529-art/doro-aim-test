const HITBOX_CONFIG = {
  headTop: 0,
  headBottom: 0.42,
  bodyTop: 0.42,
  bodyBottom: 1,
};

const MODE_CONFIG = {
  classic: { label: '经典模式', short: 'CLASSIC', duration: 30, spawnMin: 180, spawnMax: 460, targetScale: 1 },
  precision: { label: '精准模式', short: 'PRECISION', duration: 30, spawnMin: 180, spawnMax: 430, targetScale: 0.82 },
  crazy: { label: '疯狂模式', short: 'CRAZY', duration: 30, spawnMin: 70, spawnMax: 210, targetScale: 1 },
  single: { label: '单次反应测试', short: '5 SHOTS', duration: 0, spawnMin: 400, spawnMax: 700, targetScale: 0.94 },
};

const SIZE_SCALE = { small: 0.82, normal: 1, large: 1.16 };
const REFRESH_SCALE = { slow: 1.5, normal: 1, fast: 0.58 };

class AimGame {
  constructor(stage, target, callbacks, settings) {
    this.stage = stage;
    this.target = target;
    this.callbacks = callbacks;
    this.settings = settings;
    this.mode = 'classic';
    this.running = false;
    this.targetState = null;
    this.spawnTimer = null;
    this.clockTimer = null;
    this.motionFrame = null;
    this.singleCount = 0;
    this.deadline = 0;
    this.startedAt = 0;
    this.hitCanvas = document.createElement('canvas');
    this.hitContext = this.hitCanvas.getContext('2d', { willReadFrequently: true });
    this.hitReady = false;
    this.stats = this.newStats();
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onImageLoad = this.onImageLoad.bind(this);
    this.stage.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    this.target.addEventListener('load', this.onImageLoad);
    if (this.target.complete) this.onImageLoad();
  }

  destroy() {
    this.stop(false);
    this.stage.removeEventListener('pointerdown', this.onPointerDown);
    this.target.removeEventListener('load', this.onImageLoad);
  }

  newStats() {
    return { score: 0, headHits: 0, bodyHits: 0, hits: 0, misses: 0, reactions: [], combo: 0, maxCombo: 0 };
  }

  onImageLoad() {
    if (!this.target.naturalWidth) return;
    this.hitCanvas.width = this.target.naturalWidth;
    this.hitCanvas.height = this.target.naturalHeight;
    try {
      this.hitContext.clearRect(0, 0, this.hitCanvas.width, this.hitCanvas.height);
      this.hitContext.drawImage(this.target, 0, 0);
      this.hitReady = true;
    } catch { this.hitReady = false; }
  }

  start(mode = 'classic') {
    this.stop(false);
    this.mode = mode;
    this.stats = this.newStats();
    this.singleCount = 0;
    this.running = true;
    const config = MODE_CONFIG[mode];
    const duration = mode === 'single' ? 0 : Number(this.settings.duration || config.duration);
    this.deadline = duration ? performance.now() + duration * 1000 : 0;
    this.startedAt = performance.now();
    this.target.classList.remove('is-visible');
    this.callbacks.onStart?.({ mode, duration });
    if (duration) this.clockTimer = window.setInterval(() => this.updateClock(), 50);
    window.requestAnimationFrame(() => this.spawnTarget(260));
  }

  stop(emit = true) {
    window.cancelAnimationFrame(this.motionFrame);
    this.running = false;
    window.clearTimeout(this.spawnTimer);
    window.clearInterval(this.clockTimer);
    this.spawnTimer = null;
    this.clockTimer = null;
    this.target.classList.remove('is-visible');
    this.targetState = null;
    if (emit) this.callbacks.onQuit?.();
  }

  updateClock() {
    if (!this.running || !this.deadline) return;
    const left = Math.max(0, this.deadline - performance.now());
    this.callbacks.onTick?.(left / 1000);
    if (left <= 0) this.finish();
  }

  finish() {
    if (!this.running) return;
    window.cancelAnimationFrame(this.motionFrame);
    this.running = false;
    window.clearTimeout(this.spawnTimer);
    window.clearInterval(this.clockTimer);
    this.target.classList.remove('is-visible');
    this.targetState = null;
    const reactions = this.stats.reactions;
    const result = {
      mode: this.mode,
      duration: Number(this.settings.duration || MODE_CONFIG[this.mode].duration),
      score: this.stats.score,
      headHits: this.stats.headHits,
      bodyHits: this.stats.bodyHits,
      hits: this.stats.hits,
      misses: this.stats.misses,
      accuracy: this.stats.hits + this.stats.misses ? this.stats.hits / (this.stats.hits + this.stats.misses) : 0,
      fastest: reactions.length ? Math.min(...reactions) : null,
      average: reactions.length ? reactions.reduce((sum, value) => sum + value, 0) / reactions.length : null,
      maxCombo: this.stats.maxCombo,
    };
    this.callbacks.onFinish?.(result);
  }

  scheduleNext() {
    const config = MODE_CONFIG[this.mode];
    const refresh = REFRESH_SCALE[this.settings.refresh] || 1;
    const delay = Math.round((config.spawnMin + Math.random() * (config.spawnMax - config.spawnMin)) * refresh);
    window.clearTimeout(this.spawnTimer);
    this.spawnTimer = window.setTimeout(() => this.spawnTarget(), delay);
  }

  spawnTarget(extraDelay = 0) {
    if (!this.running) return;
    if (extraDelay) {
      this.spawnTimer = window.setTimeout(() => this.spawnTarget(), extraDelay);
      return;
    }
    const rect = this.stage.getBoundingClientRect();
    const config = MODE_CONFIG[this.mode];
    const base = Math.min(rect.width * 0.29, 154);
    const scale = (SIZE_SCALE[this.settings.targetSize] || 1) * config.targetScale;
    const ratio = this.target.naturalHeight && this.target.naturalWidth ? this.target.naturalHeight / this.target.naturalWidth : 1;
    const stageStyle = window.getComputedStyle(this.stage);
    const safeTop = parseFloat(stageStyle.paddingTop) || 94;
    const safeBottom = parseFloat(stageStyle.paddingBottom) || 64;
    const width = Math.max(1, Math.min(Math.max(78, base * scale), rect.width - 40, (rect.height - safeTop - safeBottom) / ratio));
    const height = width * ratio;
    const maxX = Math.max(20, rect.width - width - 20);
    const maxY = Math.max(safeTop, rect.height - height - safeBottom);
    const x = 20 + Math.random() * Math.max(0, maxX - 20);
    const y = safeTop + Math.random() * Math.max(0, maxY - safeTop);
    this.target.style.width = `${width}px`;
    this.target.style.left = `${x}px`;
    this.target.style.top = `${y}px`;
    this.target.style.transform = 'translate3d(0, 0, 0)';
    this.targetState = { x, y, originX: x, originY: y, width, height, maxX, maxY, safeTop, spawnedAt: performance.now() };
    this.target.classList.add('is-visible');
    window.cancelAnimationFrame(this.motionFrame);
    if (this.mode !== 'single' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.motionFrame = window.requestAnimationFrame(() => this.moveTarget());
    }
    this.callbacks.onTarget?.();
  }

  moveTarget() {
    const t = this.targetState;
    if (!this.running || !t) return;
    const elapsed = (performance.now() - t.spawnedAt) / 1000;
    const speed = this.mode === 'crazy' ? 3.6 : 2.2;
    const distance = this.mode === 'crazy' ? 52 : this.mode === 'precision' ? 18 : 30;
    t.x = Math.max(20, Math.min(t.maxX, t.originX + Math.sin(elapsed * speed) * distance));
    t.y = Math.max(t.safeTop, Math.min(t.maxY, t.originY + Math.sin(elapsed * speed * 1.3) * distance * 0.45));
    // Render and hit testing share the same position, so movement never leaves a stale hitbox.
    this.target.style.transform = `translate3d(${t.x - t.originX}px, ${t.y - t.originY}px, 0)`;
    this.motionFrame = window.requestAnimationFrame(() => this.moveTarget());
  }

  pointIsOpaque(localX, localY) {
    if (!this.hitReady || !this.hitContext || !this.targetState) return true;
    const px = Math.round((localX / this.targetState.width) * this.hitCanvas.width);
    const py = Math.round((localY / this.targetState.height) * this.hitCanvas.height);
    if (px < 0 || py < 0 || px >= this.hitCanvas.width || py >= this.hitCanvas.height) return false;
    try {
      const [r, g, b, a] = this.hitContext.getImageData(px, py, 1, 1).data;
      // Supports transparent PNGs and treats the supplied white backdrop as non-target.
      return a > 24 && !(r > 247 && g > 247 && b > 247);
    } catch { return true; }
  }

  onPointerDown(event) {
    if (!this.running) return;
    if (this.deadline && performance.now() >= this.deadline) { this.finish(); return; }
    event.preventDefault();
    const rect = this.stage.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.callbacks.onPointer?.(x, y);
    const targetState = this.targetState;
    const inside = targetState && x >= targetState.x && x <= targetState.x + targetState.width && y >= targetState.y && y <= targetState.y + targetState.height;
    if (!inside || !this.pointIsOpaque(x - (targetState?.x || 0), y - (targetState?.y || 0))) {
      this.stats.score -= 50;
      this.stats.misses += 1;
      this.stats.combo = 0;
      this.callbacks.onMiss?.({ score: this.stats.score, x, y });
      this.callbacks.onUpdate?.(this.stats);
      return;
    }
    const relativeY = (y - targetState.y) / targetState.height;
    const isHead = relativeY >= HITBOX_CONFIG.headTop && relativeY <= HITBOX_CONFIG.headBottom;
    const reaction = Math.max(0, performance.now() - targetState.spawnedAt);
    this.stats.score += isHead ? 250 : 100;
    isHead ? this.stats.headHits++ : this.stats.bodyHits++;
    this.stats.hits += 1;
    this.stats.reactions.push(reaction);
    this.stats.combo += 1;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.combo);
    this.target.classList.remove('is-visible');
    window.cancelAnimationFrame(this.motionFrame);
    this.targetState = null;
    this.callbacks.onHit?.({ type: isHead ? 'head' : 'body', points: isHead ? 250 : 100, reaction, combo: this.stats.combo, x, y });
    this.callbacks.onUpdate?.(this.stats);
    if (this.mode === 'single') {
      this.singleCount += 1;
      this.callbacks.onProgress?.(this.singleCount, 5);
      if (this.singleCount >= 5) window.setTimeout(() => this.finish(), 180);
      else this.scheduleNext();
    } else this.scheduleNext();
  }
}

window.DoroAimGame = { AimGame, HITBOX_CONFIG, MODE_CONFIG };
