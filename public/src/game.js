// 게임 상태 머신 + 메인 루프

import { VIEW, CONFIG, STAGES } from './config.js';
import { Sfx } from './audio.js';
import * as S from './scene.js';
import * as R from './records.js';

const KEY_RUN = new Set(['KeyW', 'ArrowUp']);
const KEY_LOOK = new Set(['Space', 'KeyS', 'ArrowDown']);

export class Game {
  constructor(canvas, hud, emit) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hud = hud;
    this.emit = emit;

    this.keys = new Set();
    this.mouse = { x: VIEW.W / 2, y: VIEW.H / 2 };
    this.state = 'idle';       // idle | play | scare | clear
    this.view = 'forward';     // forward | back
    this.run = null;
    this.rec = null;
    this.stageIndex = 0;
    this.raf = null;
    this.lastTs = 0;
    this._hudCache = {};

    this._bind();
  }

  /* ------------------------------------------------ 입력 */

  _bind() {
    this._onKeyDown = (e) => {
      if (this.state !== 'play') return;
      if (KEY_RUN.has(e.code) || KEY_LOOK.has(e.code)) e.preventDefault();
      if (this.keys.has(e.code)) return;
      this.keys.add(e.code);
      if (KEY_LOOK.has(e.code)) this.tryEnterLook();
    };
    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
      if (KEY_LOOK.has(e.code) && this.state === 'play' && this.view === 'back') {
        this.exitLook(false);
      }
    };
    this._onMove = (e) => {
      const p = this.pointer(e);
      this.mouse.x = p.x; this.mouse.y = p.y;
    };
    this._onDown = (e) => {
      if (this.state !== 'play' || this.view !== 'back') return;
      e.preventDefault();
      const p = this.pointer(e);
      this.mouse.x = p.x; this.mouse.y = p.y;
      this.shoot(p.x, p.y);
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.canvas.addEventListener('mousemove', this._onMove);
    this.canvas.addEventListener('mousedown', this._onDown);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  pointer(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (VIEW.W / r.width),
      y: (e.clientY - r.top) * (VIEW.H / r.height),
    };
  }

  /* ------------------------------------------------ 진행 관리 */

  newRun(nickname) {
    this.run = R.createRun(nickname);
    this.stageIndex = 0;
    return this.run;
  }

  currentStage() { return STAGES[this.stageIndex]; }

  beginStage() {
    const stage = this.currentStage();
    this.rec = R.beginStage(this.run, stage);

    this.stage = stage;
    this.distanceLeft = stage.distance;
    this.travelled = 0;
    this.gapStart = stage.gap;
    this.gap = stage.gap;
    this.elapsed = 0;
    this.lookMeter = stage.search;
    this.lookLockUntil = 0;
    this.reloadUntil = 0;
    this.forward = S.createForwardScene((Math.random() * 1e9) | 0);
    this.back = null;
    this.view = 'forward';
    this.turnT = 1;
    this.shake = 0;
    this.bob = 0;
    this.stepTimer = 0;
    this.muzzle = null;
    this.hitFlash = 0;
    this.banner = null;
    this.pendingReturn = 0;
    this.scareT = 0;
    this.clearT = 0;
    this.state = 'play';
    this.keys.clear();

    if (this.hud.root) this.hud.root.style.opacity = '1';
    this._hudCache = {};
    this.startLoop();
  }

  nextStage() {
    this.stageIndex = Math.min(this.stageIndex + 1, STAGES.length - 1);
  }

  stop() {
    this.state = 'idle';
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  startLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.lastTs = performance.now();
    const step = (ts) => {
      const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      this.update(dt);
      this.render();
      if (this.state !== 'idle') this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  /* ------------------------------------------------ 뒤돌아보기 */

  get danger() {
    const span = Math.max(1, this.gapStart - CONFIG.player.caughtDistance);
    return S.clamp(1 - (this.gap - CONFIG.player.caughtDistance) / span, 0, 1);
  }

  tryEnterLook() {
    if (this.view !== 'forward') return;
    if (performance.now() < this.lookLockUntil) return;
    if (this.lookMeter < 0.35) return;
    this.view = 'back';
    this.turnT = 0;
    this.back = S.buildBackScene((Math.random() * 1e9) | 0, {
      coverCount: this.stage.covers,
      exposure: this.stage.exposure,
      minRatio: this.stage.minRatio,
      maxRatio: this.stage.maxRatio,
      gap: this.gap,
    });
    R.recordLookback(this.run, this.rec);
    Sfx.turn();
  }

  exitLook(forced) {
    if (this.view !== 'back') return;
    this.view = 'forward';
    this.turnT = 0;
    this.pendingReturn = 0;
    Sfx.turn();
    if (forced) {
      this.gap -= CONFIG.look.forcedPenalty;
      this.lookLockUntil = performance.now() + CONFIG.look.lockoutMs;
      this.banner = { text: 'TOO SLOW', color: '#ff5a3c', t: 0 };
    }
  }

  shoot(x, y) {
    const now = performance.now();
    if (now < this.reloadUntil || !this.back) return;
    this.reloadUntil = now + CONFIG.shot.reloadMs;
    this.muzzle = { x, y, t: 0 };
    Sfx.gunshot();

    const hit = S.testHit(this.back, x, y, CONFIG.shot.tolerance);
    R.recordShot(this.run, this.rec, hit);

    if (hit) {
      this.gap = Math.min(this.gapStart + 25, this.gap + this.stage.repel);
      R.recordRepel(this.run, this.rec);
      Sfx.hit();
      this.hitFlash = 1;
      this.banner = { text: 'PREDATOR REPELLED', color: '#ffb04a', t: 0 };
      this.pendingReturn = 0.55; // 잠시 후 자동으로 앞을 본다
    } else {
      this.lookMeter -= CONFIG.shot.missPenalty;
      Sfx.miss();
      this.banner = { text: 'MISS', color: '#ff4a3c', t: 0 };
    }
  }

  /* ------------------------------------------------ 업데이트 */

  update(dt) {
    if (this.state === 'scare') { this.scareT = Math.min(1, this.scareT + dt / 1.15); return; }
    if (this.state === 'clear') { this.clearT = Math.min(1, this.clearT + dt / 0.9); return; }
    if (this.state !== 'play') return;

    this.elapsed += dt;
    this.sunT = S.clamp(this.elapsed / this.stage.sunset, 0, 1);
    this.turnT = Math.min(1, this.turnT + dt / (CONFIG.look.turnMs / 1000));
    if (this.muzzle) { this.muzzle.t += dt / 0.14; if (this.muzzle.t >= 1) this.muzzle = null; }
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 1.1) this.banner = null; }
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.6);

    if (this.sunT >= 1) { this.gameOver('sunset'); return; }

    if (this.view === 'forward') {
      const running = this.keys.has('KeyW') || this.keys.has('ArrowUp');
      if (running) {
        const dz = CONFIG.player.speed * dt;
        this.travelled += dz;
        this.distanceLeft -= dz;
        S.updateForwardScene(this.forward, dz);
        this.bob += dt * 12;
      }
      // 앞을 보는 동안 공룡은 계속 접근한다
      this.gap -= this.stage.dinoSpeed * dt;
      this.lookMeter = Math.min(
        this.stage.search,
        this.lookMeter + this.stage.search * CONFIG.look.refillRatio * dt
      );

      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        const d = this.danger;
        Sfx.footstep(d);
        this.shake = Math.max(this.shake, 3 + d * 16);
        this.stepTimer = S.lerp(1.05, 0.2, Math.pow(d, 1.25));
      }

      if (this.distanceLeft <= 0) { this.stageClear(); return; }
      if (this.gap <= CONFIG.player.caughtDistance) { this.gameOver('caught'); return; }
    } else {
      // 뒤를 보는 동안 공룡은 멈춰 있다. 대신 탐색 시간이 줄어든다.
      this.lookMeter -= dt;
      if (this.pendingReturn > 0) {
        this.pendingReturn -= dt;
        if (this.pendingReturn <= 0) this.exitLook(false);
      } else if (this.lookMeter <= 0) {
        this.lookMeter = 0;
        this.exitLook(true);
      }
    }

    this.shake = Math.max(0, this.shake - dt * 26);
    this.updateHud();
  }

  stageClear() {
    this.distanceLeft = 0;
    this.state = 'clear';
    this.clearT = 0;
    R.endStage(this.run, this.rec, true, this.elapsed * 1000, 1 - this.sunT);
    Sfx.clear();
    setTimeout(() => {
      this.stop();
      this.emit('stageClear', { stage: this.stage, rec: this.rec, run: this.run });
    }, 1000);
  }

  gameOver(reason) {
    this.state = 'scare';
    this.scareT = 0;
    if (this.hud.root) this.hud.root.style.opacity = '0';
    this.canvas.style.cursor = 'default';
    R.endStage(this.run, this.rec, false, this.elapsed * 1000, 1 - this.sunT);
    Sfx.jumpscare();
    setTimeout(() => {
      this.stop();
      this.emit('gameOver', { reason, run: this.run, stage: this.stage });
    }, 1450);
  }

  /* ------------------------------------------------ 렌더 */

  render() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, VIEW.W, VIEW.H);

    if (this.state === 'scare') { S.drawJumpscare(ctx, this.scareT); return; }
    if (this.state === 'idle') return;

    const amp = this.shake;
    const bobY = this.view === 'forward' ? Math.sin(this.bob) * 3 : 0;
    ctx.save();
    ctx.translate(
      (Math.random() - 0.5) * amp,
      (Math.random() - 0.5) * amp + bobY
    );

    if (this.view === 'forward') {
      S.drawForward(ctx, {
        scene: this.forward,
        sunT: this.sunT,
        travelled: this.travelled,
        distanceLeft: Math.max(0, this.distanceLeft),
        stageDistance: this.stage.distance,
      });
    } else {
      S.drawBack(ctx, this.back, { sunT: this.sunT, eyePulse: this.elapsed });
    }
    ctx.restore();

    if (this.view === 'back') {
      if (this.muzzle) S.drawMuzzleFlash(ctx, this.muzzle.x, this.muzzle.y, this.muzzle.t);
      S.drawCrosshair(ctx, this.mouse.x, this.mouse.y, performance.now() >= this.reloadUntil);
    }
    if (this.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,120,40,${this.hitFlash * 0.28})`;
      ctx.fillRect(0, 0, VIEW.W, VIEW.H);
    }
    if (this.turnT < 1) S.drawTurnWipe(ctx, this.turnT);
    if (this.state === 'clear') S.drawShelterFlash(ctx, this.clearT);
    if (this.banner) this.drawBanner(ctx);

    // 위험이 극에 달하면 화면 가장자리가 붉게 물든다
    const d = this.danger;
    if (d > 0.55 && this.view === 'forward') {
      const a = (d - 0.55) / 0.45;
      const g = ctx.createRadialGradient(VIEW.W / 2, VIEW.H / 2, VIEW.H * 0.3, VIEW.W / 2, VIEW.H / 2, VIEW.W * 0.62);
      g.addColorStop(0, 'rgba(120,0,0,0)');
      g.addColorStop(1, `rgba(150,0,0,${a * 0.55})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VIEW.W, VIEW.H);
    }
  }

  drawBanner(ctx) {
    const b = this.banner;
    const a = S.clamp(1 - b.t / 1.1, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = 'bold 46px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = b.color;
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 12;
    ctx.fillText(b.text, VIEW.W / 2, 180 - b.t * 22);
    ctx.restore();
  }

  /* ------------------------------------------------ HUD */

  updateHud() {
    const h = this.hud, c = this._hudCache;
    const set = (key, el, value, prop = 'textContent') => {
      if (c[key] === value) return;
      c[key] = value;
      if (!el) return;
      if (prop.includes('.')) {
        const parts = prop.split('.');
        let t = el;
        for (let i = 0; i < parts.length - 1; i++) t = t[parts[i]];
        t[parts[parts.length - 1]] = value;
      } else {
        el[prop] = value;
      }
    };
    const pct = (v) => `${(S.clamp(v, 0, 1) * 100).toFixed(1)}%`;

    set('stage', h.stage, `STAGE ${this.stage.id}/${STAGES.length}`);
    set('stageName', h.stageName, this.stage.name);
    set('dist', h.distanceVal, `${Math.max(0, Math.round(this.distanceLeft))} m`);
    set('distBar', h.distanceBar, pct(1 - this.distanceLeft / this.stage.distance), 'style.width');
    set('sunBar', h.sunBar, pct(1 - this.sunT), 'style.width');
    set('sunVal', h.sunVal, `${Math.max(0, Math.ceil(this.stage.sunset - this.elapsed))}s`);
    set('dangerBar', h.dangerBar, pct(this.danger), 'style.width');
    set('lookBar', h.lookBar, pct(this.lookMeter / this.stage.search), 'style.width');
    set('repels', h.repels, String(this.rec.repels));

    if (h.dangerBar) {
      const d = this.danger;
      const col = d > 0.75 ? '#ff2a18' : d > 0.45 ? '#ff8a2a' : '#8a6a3a';
      set('dangerCol', h.dangerBar, col, 'style.background');
    }
    const hint = this.view === 'back'
      ? '붉은 눈을 찾아 클릭 · 키를 떼면 다시 앞을 본다'
      : (performance.now() < this.lookLockUntil ? '숨이 가쁘다… 잠시 뒤를 볼 수 없다' : 'W / ↑ 달리기 · SPACE 길게 눌러 뒤돌아보기');
    set('hint', h.hint, hint);
    if (h.root) {
      const cls = this.view === 'back' ? 'hud back' : 'hud';
      set('rootCls', h.root, cls, 'className');
    }
    set('cursor', this.canvas, this.view === 'back' ? 'none' : 'default', 'style.cursor');
  }
}
