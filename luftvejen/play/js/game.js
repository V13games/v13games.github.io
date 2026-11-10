// Game state machine and main loop.
//
// Modes:
//   demo      – autopilot drives behind the main menu
//   ready     – run is set up, waiting for the first press
//   play      – the player is driving (or falling)
//   countdown – frozen for a moment after a revive or un-pause
//   shatter   – the shield cracks and breaks after saving the car
//   paused
//   over      – crash screen, revive offer may be open

import { CARS, BIOMES, PICKUPS, TUNING } from './config.js';
import { Track } from './track.js';
import { Car } from './car.js';
import { Effects } from './effects.js';
import { Renderer, ISO_X, ISO_Y } from './renderer.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Sound } from './audio.js';
import { Leaderboard, cleanName } from './leaderboard.js';
import { loadSave, writeSave, makePlayer } from './storage.js';
import { clamp } from './util.js';

const speedFor = (dist) => TUNING.startSpeed + TUNING.speedGain * (1 - Math.exp(-dist / TUNING.speedRamp));
const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Camera zoom for the start: a sharp push in as the car hits the line, a
// whoosh out past normal (a wider view, like the field of view opening up
// with speed) and a gentle settle back.
function startZoom(t) {
  const ease = (k) => k * k * (3 - 2 * k);
  if (t < 0.1) return 1 + 0.12 * ease(t / 0.1);
  if (t < 0.42) return 1.12 - 0.24 * ease((t - 0.1) / 0.32);
  if (t < 1.4) return 0.88 + 0.12 * ease((t - 0.42) / 0.98);
  return 1;
}

export class Game {
  constructor(canvas) {
    this.save = loadSave();
    this.renderer = new Renderer(canvas);
    this.effects = new Effects();
    this.track = new Track();
    this.car = new Car();
    this.input = new Input(canvas);
    this.input.onPress = () => Sound.unlock();
    this.input.onRelease = () => this.onRelease();
    this.ui = new UI({
      play: () => this.play(),
      createPlayer: (name) => this.createPlayer(name),
      selectPlayer: (id) => this.selectPlayer(id),
      openBoard: () => this.ui.showBoard(this.board),
      backToMenu: () => this.ui.showMenu(this.save, this.board),
      toggleMute: () => this.toggleMute(),
      pause: () => this.pause(),
      resume: () => this.resume(),
      quit: () => this.toMenu(),
      reviveCoins: () => this.revive(),
      declineRevive: () => this.closeRevive(),
      toggleBeauty: () => this.toggleBeauty(),
    });
    this.board = new Leaderboard((b) => {
      this.checkSeason(b);
      this.ui.renderBoards(b);
    });
    this.board.currentPid = this.save.current;
    Sound.setMuted(this.save.muted);
    this.ui.setMuted(this.save.muted);
    this.ui.setBeauty(this.save.beauty);

    this.time = 0;
    this.dt = 0;
    this.cam = { x: 0, y: 0 };
    this.toMenu();

    window.addEventListener('resize', () => this.renderer.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (this.mode === 'play' || this.mode === 'countdown') && !this.car.falling) this.pause();
    });

    this.last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.033, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.update(dt);
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  player() {
    return this.save.players.find((p) => p.id === this.save.current) || null;
  }

  seg() {
    return this.track.segments[this.run.segIndex];
  }

  // --------------------------------------------------------------- players

  // Make a new player, or switch to an existing one with the same name.
  createPlayer(raw) {
    const name = cleanName(raw);
    if (name.length < 2) return this.ui.nameError();
    const same = this.save.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (same) {
      this.save.current = same.id;
      this.ui.toast(`${same.name} findes allerede og er valgt`);
    } else {
      const p = makePlayer(name);
      this.save.players.push(p);
      this.save.current = p.id;
      this.ui.toast(`Ny spiller: ${p.name}`);
      Sound.buy();
    }
    this.playerChanged();
    this.ui.clearNewName();
  }

  selectPlayer(id) {
    if (!this.save.players.some((p) => p.id === id)) return;
    this.save.current = id;
    this.playerChanged();
  }

  // When the leaderboard has been reset (a new season id on the board),
  // every player on this device starts over: record, coins and runs.
  checkSeason(board) {
    if (!board.season || board.season === this.save.season) return;
    const first = this.save.season === null && this.save.players.length === 0;
    for (const p of this.save.players) {
      p.best = 0;
      p.coins = 0;
      p.runs = 0;
    }
    this.save.season = board.season;
    writeSave(this.save);
    if (this.mode === 'demo') this.ui.renderMenu(this.save);
    if (!first) this.ui.toast('Ranglisten er nulstillet – alle starter forfra!');
  }

  // Players can be switched from the menu or straight from the crash
  // screen. A revive belongs to whoever crashed, so switching closes it.
  playerChanged() {
    this.board.currentPid = this.save.current;
    writeSave(this.save);
    if (this.mode === 'over') {
      if (this.run.pid !== this.save.current) this.closeRevive();
      this.ui.renderPlayers(this.save);
      this.ui.renderBoards(this.board);
    } else {
      this.ui.showMenu(this.save, this.board);
    }
  }

  // ------------------------------------------------------------ run set-up

  newRun(demo) {
    this.demo = demo;
    this.track.reset(demo ? 9000 + Math.floor(Math.random() * 1000) : Math.floor(Math.random() * 1e9));
    this.car.spec = CARS[0];
    this.car.reset(-0.6, 0, Math.PI);
    this.car.launch(TUNING.startSpeed);
    this.effects.clear();
    this.prevWheels = null;
    this.demoHold = false;
    this.jitterSeg = -1;
    this.goTime = -1; // seconds since the car crossed the start line
    this.run = {
      pid: this.save.current,
      score: 0, dist: 0, coins: 0,
      perfects: 0, combo: 0, bestCombo: 0,
      segIndex: 0, evalSeg: -1, evalMax: 0, leaveAlong: 0,
      biome: 0,
      shield: false,
      buffs: { magnet: 0, double: 0 },
      revived: false, fallTimer: 0,
    };
    this.snapCamera();
  }

  toMenu() {
    this.newRun(true);
    this.mode = 'demo';
    this.input.enabled = false;
    Sound.engine(false);
    Sound.skid(0);
    this.ui.hideHUD();
    this.ui.hideHint();
    this.ui.showMenu(this.save, this.board);
  }

  play() {
    if (!this.player()) {
      this.ui.showMenu(this.save, this.board);
      this.ui.nameError();
      return;
    }
    this.newRun(false);
    this.mode = 'ready';
    this.input.enabled = true;
    this.input.down = false;
    this.ui.screen(null);
    this.ui.showHUD();
    this.ui.showHint('ready');
    this.ui.updateHUD(this.hudData(), 0);
  }

  onRelease() {
    if (this.mode === 'ready') {
      this.mode = 'play';
      this.ui.hideHint();
    }
  }

  pause() {
    if (this.mode !== 'play' && this.mode !== 'countdown' && this.mode !== 'ready') return;
    this.pausedFrom = this.mode === 'ready' ? 'ready' : 'countdown';
    this.mode = 'paused';
    this.input.enabled = false;
    this.input.down = false;
    Sound.engine(false);
    Sound.skid(0);
    this.ui.screen('pause');
  }

  resume() {
    if (this.mode !== 'paused') return;
    this.ui.screen(null);
    this.input.enabled = true;
    if (this.pausedFrom === 'ready') {
      this.mode = 'ready';
      this.ui.showHint('ready');
    } else {
      this.startCountdown(1.6);
    }
  }

  startCountdown(seconds) {
    this.mode = 'countdown';
    this.countdown = seconds;
    this.ui.showHint('countdown', this.seg().dir === 'R' ? 'hold' : 'release');
    this.ui.setCountdown(Math.ceil(seconds));
  }

  // ------------------------------------------------------------------ loop

  update(dt) {
    this.dt = dt;
    this.time += dt;
    this.effects.update(dt);
    if (this.goTime >= 0) this.goTime += dt;

    if (this.mode === 'demo' || this.mode === 'play') {
      if (this.car.falling) this.stepFall(dt);
      else this.drive(dt, this.mode === 'demo' ? this.autopilot() : this.input.down);
    } else if (this.mode === 'countdown') {
      this.countdown -= dt;
      this.ui.setCountdown(Math.ceil(this.countdown));
      if (this.countdown <= 0) {
        this.mode = 'play';
        this.ui.hideHint();
      }
    } else if (this.mode === 'shatter') {
      this.stepShatter(dt);
    } else if (this.mode === 'over' && this.reviveLeft > 0) {
      this.reviveLeft -= dt;
      this.ui.setReviveTimer(this.reviveLeft / TUNING.reviveWindow);
      if (this.reviveLeft <= 0) this.closeRevive();
    }

    if (!this.car.falling) this.followCamera(dt);
    if (this.mode === 'play' || this.mode === 'ready' || this.mode === 'countdown' || this.mode === 'shatter') {
      this.ui.updateHUD(this.hudData(), dt);
    }
  }

  drive(dt, holding) {
    const { car, run, track } = this;
    const B = BIOMES[this.seg().biome];
    const grip = car.spec.grip * B.grip * (B.id === 'is' ? car.spec.iceGrip || 1 : 1);
    car.steer(holding, dt);
    car.drive(dt, speedFor(run.dist) * B.speed, grip);
    run.buffs.magnet = Math.max(0, run.buffs.magnet - dt);
    run.buffs.double = Math.max(0, run.buffs.double - dt);

    // A car with a wheel or two over the edge still has most of its weight
    // on the road. It only tips off once its middle is clearly past it.
    let idx = track.locate(car.x, car.y, run.segIndex);
    if (idx < 0) {
      const near = track.nearest(car.x, car.y, run.segIndex);
      if (near.d > TUNING.edgeGrace) {
        this.leaveRoad(near);
        return;
      }
      idx = near.i;
      if (Math.random() < 14 * dt) this.effects.smoke(near.qx, near.qy, B.dust);
    }
    if (idx > run.segIndex) {
      run.segIndex = idx;
      run.evalSeg = idx;
      run.evalMax = 0;
    }

    // The nose crossing the start line is the real start of the run.
    if (!this.demo && this.goTime < 0 && car.x - 0.5 <= track.start.x) this.go();

    const seg = this.seg();
    if (seg.biome !== run.biome) {
      run.biome = seg.biome;
      if (!this.demo) {
        this.ui.showBanner('Ny verden', BIOMES[seg.biome].name, BIOMES[seg.biome].tip, BIOMES[seg.biome].id);
        Sound.pickup();
      }
    }

    const along = track.along(seg, car.x, car.y);
    run.leaveAlong = along;
    const d = seg.start + clamp(along, 0, seg.len);
    if (d > run.dist) {
      run.score += (d - run.dist) * this.multiplier();
      run.dist = d;
    }

    // Judge each corner by how far from the centre line the car runs once
    // the slide out of the turn has settled.
    if (run.evalSeg === run.segIndex) {
      if (along >= seg.w * 0.6) {
        const off = Math.abs(track.lateral(seg, car.x, car.y)) / (seg.w / 2);
        run.evalMax = Math.max(run.evalMax, off);
      }
      if (along >= Math.min(seg.w * 0.6 + 1.6, seg.len - 0.3)) this.judgeCorner(seg);
    }

    this.collect(dt);
    track.ensureAhead(run.dist);
    this.driftFx(dt, B);

    if (!this.demo) {
      Sound.engine(true, clamp((car.speed - TUNING.startSpeed) / TUNING.speedGain, 0, 1));
    }
  }

  go() {
    const { track, effects } = this;
    this.goTime = 0;
    const st = track.start;
    const colors = ['#ffffff', '#2d2150', '#ffcb2f', '#ff5fa2', '#2bb3ff'];
    for (let j = 0; j <= 6; j++) {
      const y = -st.half + (st.half * 2 * j) / 6;
      effects.burst(st.x, y, 0.1, colors[j % colors.length], 9, 4.5, { size: 0.07, life: 0.9, gravity: 9 });
    }
    effects.shake(0.55);
    Sound.go();
    this.ui.showGo();
  }

  stepFall(dt) {
    this.car.fall(dt, TUNING.gravity);
    this.run.fallTimer -= dt;
    if (this.run.fallTimer <= 0) {
      if (this.demo) this.newRun(true);
      else this.gameOver();
    }
  }

  multiplier() {
    const run = this.run;
    const combo = 1 + Math.min(run.combo, TUNING.comboMax) * TUNING.comboStep;
    return combo * (run.buffs.double > 0 ? 2 : 1) * (this.car.spec.scoreBonus || 1);
  }

  judgeCorner(seg) {
    const { run, car, effects } = this;
    const m = run.evalMax;
    run.evalSeg = -1;
    if (m <= TUNING.perfectLimit) {
      run.combo++;
      run.perfects++;
      run.bestCombo = Math.max(run.bestCombo, run.combo);
      const col = seg.dir === 'R' ? '#ff5fa2' : '#2bb3ff';
      effects.float(car.x, car.y, run.combo > 1 ? `Perfekt ×${run.combo}` : 'Perfekt', col, 22);
      if (!this.demo) {
        Sound.perfect(run.combo);
        this.ui.popScore();
      }
      if (car.spec.perfectCoin) this.addCoins(car.spec.perfectCoin, car.x, car.y, false);
    } else if (m >= TUNING.closeLimit) {
      run.combo = 0;
      run.score += TUNING.closeBonus;
      effects.float(car.x, car.y, `Tæt på! +${TUNING.closeBonus}`, '#ffb020', 22);
      effects.shake(0.45);
      if (!this.demo) Sound.close();
    } else {
      run.combo = 0;
    }
  }

  // Every coin is both money for revives and extra points.
  addCoins(n, x, y, withText = true) {
    const run = this.run;
    run.coins += n;
    const points = n * TUNING.coinScore * (run.buffs.double > 0 ? 2 : 1);
    run.score += points;
    const p = this.player();
    if (!this.demo && p) {
      p.coins += n;
      Sound.coin();
    }
    const col = this.save.beauty ? '#ff5fa2' : '#ffc83d';
    if (withText) this.effects.float(x, y, `+${points}`, col, 18);
    this.effects.burst(x, y, 0.4, col, 6, 2.2, { size: 0.05, life: 0.45 });
  }

  collect(dt) {
    const { car, run, track } = this;
    const r2 = TUNING.coinRadius ** 2;
    const magnetOn = run.buffs.magnet > 0;
    const mr = TUNING.magnetRadius;
    const lo = Math.max(0, run.segIndex - 1);
    const hi = Math.min(track.segments.length - 1, run.segIndex + 2);
    for (let i = lo; i <= hi; i++) {
      const seg = track.segments[i];
      for (const c of seg.coins) {
        if (c.taken) continue;
        let dx = car.x - c.x, dy = car.y - c.y;
        let d2 = dx * dx + dy * dy;
        if (magnetOn && d2 < mr * mr) {
          const d = Math.sqrt(d2) || 1;
          const step = Math.min(d, TUNING.magnetPull * dt);
          c.x += (dx / d) * step;
          c.y += (dy / d) * step;
          dx = car.x - c.x;
          dy = car.y - c.y;
          d2 = dx * dx + dy * dy;
        }
        if (d2 < r2) {
          c.taken = true;
          this.addCoins(1, c.x, c.y);
        }
      }
      for (const p of seg.pickups) {
        if (p.taken) continue;
        const dx = car.x - p.x, dy = car.y - p.y;
        const radius = p.type === 'car' ? 1.0 : TUNING.pickupRadius;
        if (dx * dx + dy * dy < radius * radius) {
          p.taken = true;
          this.applyPickup(p);
        }
      }
    }
  }

  applyPickup(p) {
    const { run, car, effects } = this;
    if (p.type === 'car') {
      const spec = CARS.find((c) => c.id === p.car);
      car.spec = spec;
      if (spec.giveShield) run.shield = true;
      effects.burst(p.x, p.y, 0.5, '#ffc83d', 30, 4, { size: 0.08, life: 0.8 });
      effects.shake(0.25);
      if (!this.demo) {
        this.ui.showBanner('Ny bil', spec.name, spec.perk, 'car');
        Sound.revive();
      }
      return;
    }
    const info = PICKUPS[p.type];
    if (p.type === 'magnet') run.buffs.magnet = Math.max(run.buffs.magnet, TUNING.pickupTime.magnet * (car.spec.magnetTime || 1));
    if (p.type === 'double') run.buffs.double = Math.max(run.buffs.double, TUNING.pickupTime.double);
    if (p.type === 'shield') run.shield = true;
    effects.float(p.x, p.y, info.name, info.color, 24);
    effects.burst(p.x, p.y, 0.6, info.color, 18, 3, { size: 0.06 });
    if (!this.demo) Sound.pickup();
  }

  driftFx(dt, B) {
    const car = this.car;
    const slide = Math.abs(car.slip);
    if (slide > 0.9) {
      const [a, b] = car.rearWheels();
      if (this.prevWheels) {
        this.effects.skid(this.prevWheels[0], a, B.skid);
        this.effects.skid(this.prevWheels[1], b, B.skid);
      }
      this.prevWheels = [a, b];
      if (Math.random() < slide * 12 * dt) {
        const w = Math.random() < 0.5 ? a : b;
        this.effects.smoke(w.x, w.y, B.dust);
      }
    } else {
      this.prevWheels = null;
    }
    if (!this.demo) Sound.skid((slide - 0.6) / 3);
  }

  // Simple autopilot for the menu backdrop: start turning early enough to
  // finish the slide on the centre line, with a little randomness so it
  // looks human.
  autopilot() {
    const { run, car, track } = this;
    const seg = this.seg();
    const next = track.segments[run.segIndex + 1];
    if (this.jitterSeg !== run.segIndex) {
      this.jitterSeg = run.segIndex;
      this.jitter = (Math.random() - 0.5) * 0.3;
    }
    const B = BIOMES[seg.biome];
    const grip = car.spec.grip * B.grip * (B.id === 'is' ? car.spec.iceGrip || 1 : 1);
    const lead = car.speed * (1 / car.spec.turn + 1 / grip) + this.jitter;
    let dir = seg.dir;
    if (next && track.along(seg, car.x, car.y) >= seg.len - lead) dir = next.dir;
    this.demoHold = dir === 'R';
    return this.demoHold;
  }

  // ------------------------------------------------------ falling & revive

  leaveRoad(near) {
    const { run, car, effects } = this;
    if (run.shield) {
      this.breakShield();
      return;
    }
    // Which side did it go over? Cars that fall off the far edge are drawn
    // behind the road once they drop below it. The car keeps its speed and
    // simply rolls off the edge, no hop.
    car.falling = true;
    car.behind = car.x + car.y < near.qx + near.qy;
    car.vz = 0;
    // Tip toward the side it went over, as seen on screen.
    car.tiltDir = car.x - car.y >= near.qx - near.qy ? 1 : -1;
    car.spin = (Math.random() - 0.5) * 3;
    run.fallTimer = 1.1;
    run.combo = 0;
    this.prevWheels = null;
    if (!this.demo) {
      Sound.engine(false);
      Sound.skid(0);
      Sound.fall();
      effects.shake(0.6);
    }
  }

  // The shield catches the car at the edge: everything freezes while the
  // bubble cracks, then it bursts into shards, the car is put back on the
  // road and a countdown starts.
  breakShield() {
    const { run, effects } = this;
    run.shield = false;
    run.combo = 0;
    this.mode = 'shatter';
    this.breakTime = 0;
    this.breakSeed = Math.floor(Math.random() * 1e6);
    this.shattered = false;
    this.prevWheels = null;
    effects.shake(0.35);
    Sound.engine(false);
    Sound.skid(0);
    Sound.crack();
  }

  stepShatter(dt) {
    const { car, effects } = this;
    this.breakTime += dt;
    if (!this.shattered && this.breakTime >= TUNING.shieldCrack) {
      this.shattered = true;
      effects.shake(0.6);
      effects.burst(car.x, car.y, 0.6, '#bfe8ff', 26, 4.5, { size: 0.06, life: 0.7 });
      effects.float(car.x, car.y, 'Skjoldet reddede dig!', '#2bb3ff', 22);
      Sound.shatter();
    }
    if (this.breakTime >= TUNING.shieldCrack + TUNING.shieldShatter) {
      this.rescue();
      this.startCountdown(TUNING.shieldCountdown);
    }
  }

  // Put the car back on the centre line near where it left the road.
  rescue() {
    const { run, car, track, effects } = this;
    let seg = this.seg();
    let a = run.leaveAlong;
    if (a > seg.len - 0.6 && track.segments[run.segIndex + 1]) {
      run.segIndex++;
      seg = this.seg();
      a = 0.8;
    }
    a = clamp(a, 0.3, seg.len - 0.6);
    // Never park the car on a bridge.
    if (seg.bridge && a > seg.bridge.a0 - 0.6 && a < seg.bridge.a0 + seg.bridge.len + 0.6) {
      a = Math.max(0.3, seg.bridge.a0 - 0.6);
    }
    car.reset(seg.sx + seg.dx * a, seg.sy + seg.dy * a, seg.angle);
    car.launch(speedFor(run.dist));
    run.evalSeg = -1;
    this.prevWheels = null;
    effects.burst(car.x, car.y, 0.3, '#2bb3ff', 26, 3.5, { size: 0.07 });
  }

  gameOver() {
    const { run, save } = this;
    const p = this.player();
    this.mode = 'over';
    this.input.enabled = false;
    this.input.down = false;
    Sound.engine(false);
    Sound.skid(0);
    const score = Math.floor(run.score);
    const newBest = score > p.best;
    if (newBest) p.best = score;
    p.runs++;
    writeSave(save);
    this.board.submit(p, score).then(() => this.ui.renderBoards(this.board));

    const offer = !run.revived && p.coins >= TUNING.reviveCost;
    this.reviveLeft = offer ? TUNING.reviveWindow : 0;
    this.ui.hideHUD();
    this.ui.showGameOver({
      name: p.name,
      score,
      best: p.best,
      newBest,
      coins: run.coins,
      perfects: run.perfects,
      bestCombo: run.bestCombo,
      revive: offer ? { cost: TUNING.reviveCost, have: p.coins } : null,
    }, save, this.board);
  }

  closeRevive() {
    this.reviveLeft = 0;
    this.ui.hideRevive();
  }

  revive() {
    const { run, save } = this;
    const p = this.player();
    if (this.mode !== 'over' || run.revived || p?.id !== run.pid || p.coins < TUNING.reviveCost) return;
    p.coins -= TUNING.reviveCost;
    writeSave(save);
    run.revived = true;
    this.reviveLeft = 0;
    this.rescue();
    this.snapCamera();
    Sound.revive();
    this.input.enabled = true;
    this.ui.screen(null);
    this.ui.showHUD();
    this.startCountdown(2.4);
  }

  toggleMute() {
    this.save.muted = !this.save.muted;
    Sound.setMuted(this.save.muted);
    writeSave(this.save);
    this.ui.setMuted(this.save.muted);
  }

  toggleBeauty() {
    this.save.beauty = !this.save.beauty;
    writeSave(this.save);
    this.ui.setBeauty(this.save.beauty);
    this.ui.toast(this.save.beauty ? 'Skønhedstilstand: saml produkterne!' : 'Tilbage til mønterne');
  }

  // --------------------------------------------------------------- drawing

  hudData() {
    const run = this.run;
    return {
      score: Math.floor(run.score),
      coins: run.coins,
      mult: this.multiplier(),
      combo: Math.min(run.combo, TUNING.comboMax) / TUNING.comboMax,
      car: this.car.spec.name,
      shield: run.shield,
      magnet: Math.ceil(run.buffs.magnet),
      double: Math.ceil(run.buffs.double),
    };
  }

  cameraTarget() {
    const c = this.car;
    const lx = c.x + Math.cos(c.vel) * 1.6;
    const ly = c.y + Math.sin(c.vel) * 1.6;
    return { x: (lx - ly) * ISO_X, y: (lx + ly) * ISO_Y };
  }

  snapCamera() {
    this.cam = this.cameraTarget();
  }

  followCamera(dt) {
    const t = this.cameraTarget();
    const k = 1 - Math.exp(-4.5 * dt);
    this.cam.x += (t.x - this.cam.x) * k;
    this.cam.y += (t.y - this.cam.y) * k;
  }

  draw() {
    const sh = this.effects.shakeOffset();
    const zoom = this.goTime >= 0 && !REDUCED_MOTION ? startZoom(this.goTime) : 1;
    this.renderer.setCamera(this.cam.x, this.cam.y, sh.x, sh.y, zoom);
    this.renderer.render({
      track: this.track,
      start: this.track.start,
      go: REDUCED_MOTION ? -1 : this.goTime,
      segIndex: this.run.segIndex,
      biome: this.seg().biome,
      car: this.car,
      spec: this.car.spec,
      shield: this.run.shield,
      breakTime: this.mode === 'shatter' ? this.breakTime : -1,
      breakSeed: this.breakSeed,
      beauty: this.save.beauty,
      effects: this.effects,
      t: this.time,
      dt: this.dt,
      camX: this.cam.x,
      camY: this.cam.y,
    });
  }
}
