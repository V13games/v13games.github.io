// Canvas renderer: a sunny sky with drifting clouds, the floating road
// with its grassy (or sandy, icy, chocolate) sides, and everything
// standing on it, drawn in an isometric projection.

import { ROAD, BIOMES, CARS, PICKUPS, TUNING } from './config.js';
import { mulberry32, mod, hexToRgb, shade } from './util.js';
import { drawCar } from './carArt.js';

export const ISO_X = Math.cos(Math.PI / 6);
export const ISO_Y = 0.5;

const BAND_DEPTH = 0.17;   // grass / icing strip at the top of each slab
const BRIDGE_DEPTH = 0.16;
const WOOD = { deck: '#d8995a', side: '#9c6234', sideDark: '#7f4c26', plank: 'rgba(110,60,25,0.35)', post: hexToRgb('#7a4722') };
const GOLD = '#ffc83d';
const GOLD_DARK = '#d18b12';

// Coin-style sprites for the coin and the three boosts. Each SVG is turned
// into a bitmap once it loads: drawing a vector image straight onto the
// canvas makes the browser re-render it every frame (worse when it's
// squashed to spin), which shows up as a steady stutter. Until a sprite is
// ready, the hand-drawn shape below stands in for it.
const SPRITE_PX = 160;
const ICONS = {};
for (const file of ['coin.svg', 'magnet.svg', 'shield.svg', 'double.svg']) {
  const name = file.split('.')[0];
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = c.height = SPRITE_PX;
    c.getContext('2d').drawImage(img, 0, 0, SPRITE_PX, SPRITE_PX);
    ICONS[name] = c;
  };
  img.src = `icons/${file}`;
}
const ready = (sprite) => !!sprite;

// Pre-computed colour strings for each biome.
const PAL = BIOMES.map((b) => ({
  ...b,
  bandDark: shade(hexToRgb(b.band), 0.86),
  skyRgb: b.sky.map(hexToRgb),
}));

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ox = 0;
    this.oy = 0;
    this.s = 50;
    this.baseS = 50;
    this.zoom = 1;
    this.sky = PAL[0].skyRgb.map((c) => c.slice());
    this.P = (x, y, z = 0) => [
      (x - y) * ISO_X * this.s + this.ox,
      (x + y) * ISO_Y * this.s - z * this.s + this.oy,
    ];
    this.resize();
  }

  resize() {
    const W = this.canvas.clientWidth || window.innerWidth;
    const H = this.canvas.clientHeight || window.innerHeight;
    // 1.5× is sharp enough and fills far fewer pixels than 2× every frame,
    // which keeps high-resolution screens smooth.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Pixels per world unit: fit the road comfortably on phones and desktops.
    this.baseS = Math.max(30, Math.min(W / 8.5, H / 12.5, 90));
    this.s = this.baseS * this.zoom;
    this.buildClouds();
  }

  // cx/cy is the camera target in isometric units (before scaling). `zoom`
  // above 1 pushes the camera in, below 1 pulls it out (a wider view).
  setCamera(cx, cy, shakeX = 0, shakeY = 0, zoom = 1) {
    this.zoom = zoom;
    this.s = this.baseS * zoom;
    this.ox = this.W / 2 - cx * this.s + shakeX;
    this.oy = this.H * 0.64 - cy * this.s + shakeY;
  }

  // ---------------------------------------------------------------- backdrop

  buildClouds() {
    const rng = mulberry32(5);
    const make = (count, minS, maxS, par, alpha) => {
      const TW = Math.max(this.W, 500) * 1.6, TH = this.H * 1.6;
      const clouds = Array.from({ length: count }, () => {
        const size = minS + rng() * (maxS - minS);
        const n = 4 + Math.floor(rng() * 3);
        const puffs = Array.from({ length: n }, (_, i) => ({
          dx: (i - (n - 1) / 2) * size * 0.55 + (rng() - 0.5) * size * 0.2,
          dy: -rng() * size * 0.35,
          r: size * (0.38 + rng() * 0.3),
        }));
        return { x: rng() * TW, y: rng() * TH, size, puffs, drift: 4 + rng() * 8 };
      });
      return { clouds, TW, TH, par, alpha };
    };
    this.cloudLayers = [make(9, 30, 60, 0.04, 0.6), make(7, 60, 110, 0.12, 0.9)];
  }

  drawBackdrop(camX, camY, t, biome, dt) {
    const { ctx, W, H, s } = this;

    // Ease the sky toward the current world's colours.
    const target = PAL[biome].skyRgb;
    const k = 1 - Math.exp(-1.5 * dt);
    for (let i = 0; i < 2; i++) for (let c = 0; c < 3; c++) this.sky[i][c] += (target[i][c] - this.sky[i][c]) * k;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, shade(this.sky[0], 1));
    g.addColorStop(1, shade(this.sky[1], 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Sun.
    const sx = W * 0.82, sy = H * 0.14, sr = Math.min(W, H) * 0.065;
    const halo = ctx.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 3.4);
    halo.addColorStop(0, 'rgba(255,244,190,0.7)');
    halo.addColorStop(1, 'rgba(255,244,190,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(sx - sr * 3.4, sy - sr * 3.4, sr * 6.8, sr * 6.8);
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();

    // Two layers of clouds, drifting slowly and sliding past as the road climbs.
    for (const L of this.cloudLayers) {
      ctx.fillStyle = `rgba(255,255,255,${L.alpha})`;
      for (const c of L.clouds) {
        const x = mod(c.x + t * c.drift - camX * s * L.par, L.TW) - L.TW * 0.2;
        const y = mod(c.y - camY * s * L.par, L.TH) - L.TH * 0.2;
        if (x < -c.size * 2 || x > W + c.size * 2 || y < -c.size || y > H + c.size) continue;
        ctx.beginPath();
        for (const p of c.puffs) {
          ctx.moveTo(x + p.dx + p.r, y + p.dy);
          ctx.arc(x + p.dx, y + p.dy, p.r, 0, Math.PI * 2);
        }
        ctx.ellipse(x, y + c.size * 0.12, c.size * 1.5, c.size * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // -------------------------------------------------------------------- road

  quad(a, b, c, d) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(c[0], c[1]);
    ctx.lineTo(d[0], d[1]);
    ctx.closePath();
  }

  fillQuad(a, b, c, d, color) {
    this.quad(a, b, c, d);
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }

  segVisible(g) {
    const { s, ox, oy, W, H } = this;
    const top = (g.x0 + g.y0) * ISO_Y * s + oy - 20;
    const bottom = (g.x1 + g.y1) * ISO_Y * s + oy + ROAD.slabDepth * s + 20;
    const left = (g.x0 - g.y1) * ISO_X * s + ox - 20;
    const right = (g.x1 - g.y0) * ISO_X * s + ox + 20;
    return bottom > 0 && top < H && right > 0 && left < W;
  }

  // The two faces of a slab that turn toward the camera.
  slabSides(r, depth, near, far, bandNear, bandFar) {
    const { P } = this;
    const { x0, y0, x1, y1 } = r;
    this.fillQuad(P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, -depth), P(x0, y1, -depth), near);
    this.fillQuad(P(x1, y0, 0), P(x1, y1, 0), P(x1, y1, -depth), P(x1, y0, -depth), far);
    if (bandNear) {
      const b = Math.min(BAND_DEPTH, depth);
      this.fillQuad(P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, -b), P(x0, y1, -b), bandNear);
      this.fillQuad(P(x1, y0, 0), P(x1, y1, 0), P(x1, y1, -b), P(x1, y0, -b), bandFar);
    }
  }

  drawRoad(segs, lo, hi) {
    const { ctx, P } = this;
    const T = ROAD.slabDepth;
    const e = 0.12; // width of the painted edge line
    const vis = [];
    for (let i = hi; i >= lo; i--) if (this.segVisible(segs[i])) vis.push(segs[i]);

    // Pass 1, far to near: slab sides and an edge-coloured lid.
    for (const g of vis) {
      const b = PAL[g.biome];
      for (let j = g.rects.length - 1; j >= 0; j--) {
        const r = g.rects[j];
        if (r.kind === 'bridge') {
          this.slabSides(r, BRIDGE_DEPTH, WOOD.side, WOOD.sideDark);
          this.fillQuad(P(r.x0, r.y0), P(r.x1, r.y0), P(r.x1, r.y1), P(r.x0, r.y1), WOOD.deck);
        } else {
          this.slabSides(r, T, b.side, b.sideDark, b.band, b.bandDark);
          this.fillQuad(P(r.x0, r.y0), P(r.x1, r.y0), P(r.x1, r.y1), P(r.x0, r.y1), b.edge);
        }
      }
    }

    // Pass 2: the driving surface, inset so only the outer edges keep their
    // painted line. Overlapping insets hide the seams where slabs meet.
    for (const g of vis) {
      ctx.fillStyle = PAL[g.biome].road;
      for (const r of g.rects) {
        if (r.kind !== 'road') continue;
        this.quad(P(r.x0 + e, r.y0 + e), P(r.x1 - e, r.y0 + e), P(r.x1 - e, r.y1 - e), P(r.x0 + e, r.y1 - e));
        ctx.fill();
      }
    }

    // Tile lines across the road and planks across bridges.
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const g of vis) {
      for (const r of g.rects) {
        if (r.kind !== 'road') continue;
        if (g.dir === 'L') {
          for (let k = Math.ceil(r.x0 + e); k <= r.x1 - e; k++) {
            const a = P(k, r.y0 + e), c = P(k, r.y1 - e);
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(c[0], c[1]);
          }
        } else {
          for (let k = Math.ceil(r.y0 + e); k <= r.y1 - e; k++) {
            const a = P(r.x0 + e, k), c = P(r.x1 - e, k);
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(c[0], c[1]);
          }
        }
      }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.stroke();

    ctx.beginPath();
    for (const g of vis) {
      const r = g.rects[1];
      if (!r || r.kind !== 'bridge') continue;
      const horiz = g.dir === 'L';
      const from = horiz ? r.x0 : r.y0, to = horiz ? r.x1 : r.y1;
      for (let k = from + 0.22; k < to; k += 0.22) {
        const a = horiz ? P(k, r.y0) : P(r.x0, k);
        const c = horiz ? P(k, r.y1) : P(r.x1, k);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(c[0], c[1]);
      }
    }
    ctx.strokeStyle = WOOD.plank;
    ctx.stroke();
  }

  // Chequered start line painted across the runway.
  drawStartLine(st) {
    const { ctx, P } = this;
    const e = 0.12;
    const across = st.half * 2 - e * 2;
    const cols = Math.round(across / 0.27);
    const cw = across / cols, rows = 2, rh = 0.24;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const x0 = st.x - rh + i * rh, x1 = x0 + rh;
        const y0 = -st.half + e + j * cw, y1 = y0 + cw;
        this.fillQuad(P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1), (i + j) % 2 ? '#2d2150' : '#ffffff');
      }
    }
  }

  // The flag marshal. Before the start they wave the chequered flag over
  // their head; when the car crosses the line (`drop` seconds ago) the arm
  // sweeps down. Drawn in screen space around their feet in units of `u`.
  drawMarshal(m, t, drop) {
    const { ctx, P, s } = this;
    const [fx, fy] = P(m.x, m.y, 0);
    const u = s * 0.12;
    ctx.fillStyle = 'rgba(40,30,80,0.22)';
    ctx.beginPath();
    ctx.ellipse(fx, fy, u * 2.6, u * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();

    const INK = '#2d2150', SKIN = '#ffcf9e', VEST = '#ff7a2f';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.2, u * 0.28);

    // Legs, then body with a reflective stripe.
    const hop = drop >= 0 && drop < 0.6 ? Math.sin((drop / 0.6) * Math.PI) * u * 1.2 : 0;
    const by = fy - hop;
    ctx.fillStyle = INK;
    for (const dx of [-0.75, 0.75]) {
      ctx.beginPath();
      ctx.roundRect(fx + (dx - 0.45) * u, by - 3.2 * u, 0.9 * u, 3.2 * u, 0.3 * u);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.roundRect(fx - 1.45 * u, by - 6.3 * u, 2.9 * u, 3.5 * u, 0.9 * u);
    ctx.fillStyle = VEST;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff4c2';
    ctx.fillRect(fx - 1.3 * u, by - 4.75 * u, 2.6 * u, 0.5 * u);

    // Arm without the flag hangs at the side.
    ctx.lineWidth = u * 0.8;
    ctx.strokeStyle = VEST;
    ctx.beginPath();
    ctx.moveTo(fx - 1.2 * u, by - 5.6 * u);
    ctx.lineTo(fx - 1.9 * u, by - 3.4 * u);
    ctx.stroke();

    // Head with a cap.
    const hx = fx, hy = by - 7.5 * u;
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.arc(hx, hy, 1.15 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1.2, u * 0.28);
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(hx, hy - 0.15 * u, 1.2 * u, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(hx, hy - 0.4 * u, 1.9 * u, 0.4 * u);
    for (const ex of [-0.1, 0.55]) {
      ctx.beginPath();
      ctx.arc(hx + ex * u, hy + 0.3 * u, 0.17 * u, 0, Math.PI * 2);
      ctx.fill();
    }

    // Flag arm: waving overhead, then a quick sweep down at the start.
    const up = -Math.PI * 0.55 + Math.sin(t * 7) * 0.45;
    let a = up;
    if (drop >= 0) {
      const k = Math.min(1, drop / 0.22);
      const ease = 1 - Math.pow(1 - k, 3);
      const down = Math.PI * 0.18 + (drop > 1 ? Math.sin(t * 5) * 0.12 : 0);
      a = up + (down - up) * ease;
    }
    const dx = Math.cos(a), dy = Math.sin(a);
    const sx = fx + 1.2 * u, sy = by - 5.7 * u;
    const hand = [sx + dx * 2.6 * u, sy + dy * 2.6 * u];
    const tip = [hand[0] + dx * 3.8 * u, hand[1] + dy * 3.8 * u];
    ctx.strokeStyle = VEST;
    ctx.lineWidth = u * 0.8;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(hand[0], hand[1]);
    ctx.stroke();
    ctx.strokeStyle = '#8b8fa6';
    ctx.lineWidth = Math.max(1.5, u * 0.35);
    ctx.beginPath();
    ctx.moveTo(hand[0] - dx * 0.4 * u, hand[1] - dy * 0.4 * u);
    ctx.lineTo(tip[0], tip[1]);
    ctx.stroke();
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.arc(hand[0], hand[1], 0.5 * u, 0, Math.PI * 2);
    ctx.fill();

    // The flag hangs off the top of the pole and ripples.
    const nx = -dy, ny = dx; // to the right of the pole when it points up
    const cols = 4, rows = 3, fw = 4.2 * u, fh = 2.9 * u;
    const pt = (i, j) => {
      const w = Math.sin(t * 11 - j * 1.4) * 0.5 * u * (j / cols);
      return [
        tip[0] - dx * (fh * i / rows) + nx * (fw * j / cols) + dx * w,
        tip[1] - dy * (fh * i / rows) + ny * (fw * j / cols) + dy * w,
      ];
    };
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        this.fillQuad(pt(i, j), pt(i, j + 1), pt(i + 1, j + 1), pt(i + 1, j), (i + j) % 2 ? INK : '#ffffff');
      }
    }
    this.quad(pt(0, 0), pt(0, cols), pt(rows, cols), pt(rows, 0));
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, u * 0.2);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // The "you're off!" moment: a white flash, speed lines rushing out from
  // the car and a dark rim that fades as the camera settles.
  drawGoFx(go, cx, cy) {
    const { ctx, W, H } = this;
    const DUR = 1.1;
    if (go < 0 || go > DUR) return;
    const k = go / DUR;
    const diag = Math.hypot(W, H);

    const rim = ctx.createRadialGradient(cx, cy, diag * 0.18, cx, cy, diag * 0.62);
    rim.addColorStop(0, 'rgba(45,33,80,0)');
    rim.addColorStop(1, `rgba(45,33,80,${(0.22 * (1 - k)).toFixed(3)})`);
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, W, H);

    const rng = mulberry32(77);
    ctx.fillStyle = `rgba(255,255,255,${(0.42 * (1 - k)).toFixed(3)})`;
    ctx.beginPath();
    for (let i = 0; i < 34; i++) {
      const ang = rng() * Math.PI * 2;
      const r0 = diag * (0.2 + rng() * 0.25) + go * diag * (0.9 + rng() * 0.8);
      const len = diag * (0.1 + rng() * 0.16);
      const wide = 1 + rng() * 2.5;
      const c = Math.cos(ang), sn = Math.sin(ang);
      ctx.moveTo(cx + c * r0, cy + sn * r0);
      ctx.lineTo(cx + c * (r0 + len) - sn * wide, cy + sn * (r0 + len) + c * wide);
      ctx.lineTo(cx + c * (r0 + len) + sn * wide, cy + sn * (r0 + len) - c * wide);
      ctx.closePath();
    }
    ctx.fill();

    if (go < 0.22) {
      ctx.fillStyle = `rgba(255,255,255,${(0.3 * (1 - go / 0.22)).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // Little wooden posts at the corners of each bridge.
  drawBridgePosts(segs, lo, hi) {
    const { ctx, P } = this;
    for (let i = hi; i >= lo; i--) {
      const g = segs[i];
      const r = g.rects[1];
      if (!r || r.kind !== 'bridge' || !this.segVisible(g)) continue;
      const pts = [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]].sort((a, b) => a[0] + a[1] - b[0] - b[1]);
      for (const [x, y] of pts) {
        const top = P(x, y, 0.32), bot = P(x, y, 0);
        ctx.strokeStyle = shade(WOOD.post, 1);
        ctx.lineWidth = Math.max(2.5, this.s * 0.07);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bot[0], bot[1]);
        ctx.lineTo(top[0], top[1]);
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
  }

  // Skid marks fade over six seconds. Rather than stroke hundreds of tiny
  // lines one at a time, marks of the same colour and similar age are
  // gathered into one path each.
  drawSkids(skids) {
    const { ctx, P } = this;
    const STEPS = 8;
    const groups = new Map();
    for (const k of skids) {
      const step = Math.min(STEPS - 1, Math.floor((k.age / 6) * STEPS));
      const key = `${k.color}|${step}`;
      let list = groups.get(key);
      if (!list) groups.set(key, (list = []));
      list.push(k);
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, this.s * 0.08);
    for (const [key, list] of groups) {
      const [color, step] = key.split('|');
      ctx.strokeStyle = `rgba(${color},${(0.4 * (1 - (+step + 0.5) / STEPS)).toFixed(3)})`;
      ctx.beginPath();
      for (const k of list) {
        const a = P(k.x1, k.y1), b = P(k.x2, k.y2);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  // ---------------------------------------------------------------- entities

  drawCoin(c, t) {
    const { ctx, P, s } = this;
    const z = 0.38 + Math.sin(t * 3 + c.spin) * 0.06;
    const [gx, gy] = P(c.x, c.y, 0);
    ctx.fillStyle = 'rgba(40,30,80,0.18)';
    ctx.beginPath();
    ctx.ellipse(gx, gy, s * 0.17, s * 0.085, 0, 0, Math.PI * 2);
    ctx.fill();
    const [x, y] = P(c.x, c.y, z);
    const r = s * 0.2;
    const w = Math.max(0.16, Math.abs(Math.cos(t * 2.5 + c.spin)));
    // The coin icon, squashed sideways so it spins, with a darker rim
    // behind it so it has some thickness side-on.
    if (ready(ICONS.coin)) {
      const R = r * 1.16;
      ctx.fillStyle = '#e0900f';
      ctx.beginPath();
      ctx.ellipse(x + r * 0.12, y, R * w, R, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(w, 1);
      ctx.drawImage(ICONS.coin, -r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
      ctx.restore();
      return;
    }
    ctx.fillStyle = GOLD_DARK;
    ctx.beginPath();
    ctx.ellipse(x + r * 0.14 * w, y, r * w, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.ellipse(x, y, r * w, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(x - r * w * 0.3, y - r * 0.3, r * w * 0.22, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Beauty mode: a little shop product bobs and sways where a coin would be.
  // Shapes are drawn in units of `u` around the product's centre.
  drawProduct(c, t) {
    const { ctx, P, s } = this;
    const [gx, gy] = P(c.x, c.y, 0);
    ctx.fillStyle = 'rgba(40,30,80,0.18)';
    ctx.beginPath();
    ctx.ellipse(gx, gy, s * 0.17, s * 0.085, 0, 0, Math.PI * 2);
    ctx.fill();

    const u = s * 0.25;
    const [x, y] = P(c.x, c.y, 0.42 + Math.sin(t * 3 + c.spin) * 0.06);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 2.6 + c.spin) * 0.2);
    ctx.lineWidth = Math.max(1.2, s * 0.025);
    ctx.strokeStyle = '#2d2150';
    ctx.lineJoin = 'round';
    const box = (x0, y0, x1, y1, r, fill) => {
      ctx.beginPath();
      ctx.roundRect(x0 * u, y0 * u, (x1 - x0) * u, (y1 - y0) * u, r * u);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
    };
    const shine = (x0, y0, h) => {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.roundRect(x0 * u, y0 * u, 0.13 * u, h * u, 0.06 * u);
      ctx.fill();
    };

    switch (c.item) {
      case 0: // lipstick
        box(-0.36, 0.1, 0.36, 1, 0.08, '#f5c542');
        box(-0.3, -0.12, 0.3, 0.1, 0.03, '#d39a1c');
        ctx.beginPath();
        ctx.moveTo(-0.24 * u, -0.12 * u);
        ctx.lineTo(-0.24 * u, -0.72 * u);
        ctx.lineTo(0.24 * u, -0.95 * u);
        ctx.lineTo(0.24 * u, -0.12 * u);
        ctx.closePath();
        ctx.fillStyle = '#e0245e';
        ctx.fill();
        ctx.stroke();
        shine(-0.26, 0.2, 0.6);
        break;
      case 1: // perfume
        box(-0.14, -0.42, 0.14, -0.18, 0.03, '#d39a1c');
        box(-0.3, -0.85, 0.3, -0.42, 0.1, '#f5c542');
        box(-0.62, -0.2, 0.62, 1, 0.26, '#ffc2dc');
        box(-0.42, 0.25, 0.42, 0.85, 0.16, '#ff7eb6');
        shine(-0.48, -0.08, 0.6);
        break;
      case 2: // nail polish
        box(-0.17, -0.98, 0.17, 0.08, 0.06, '#2d2150');
        box(-0.46, 0.05, 0.46, 1, 0.18, '#ff4f8b');
        shine(-0.32, 0.18, 0.55);
        break;
      case 3: // cream jar
        box(-0.68, 0.12, 0.68, 0.95, 0.14, '#ffffff');
        box(-0.74, -0.22, 0.74, 0.16, 0.08, '#3dbfae');
        box(-0.5, 0.36, 0.5, 0.7, 0.06, '#c9f1ea');
        break;
      default: // shampoo
        box(-0.26, -0.95, 0.26, -0.6, 0.06, '#ffffff');
        box(-0.44, -0.62, 0.44, 1, 0.2, '#2bb3ff');
        box(-0.3, -0.1, 0.3, 0.55, 0.06, '#e6f6ff');
        shine(-0.34, -0.5, 0.3);
    }

    // A twinkle so products catch the eye like coins do.
    const tw = Math.max(0, Math.sin(t * 3.4 + c.spin * 2.3));
    if (tw > 0.05) {
      const sx = 0.62 * u, sy = -0.78 * u, k = 0.32 * u * tw;
      ctx.fillStyle = `rgba(255,255,255,${tw.toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(sx, sy - k);
      ctx.quadraticCurveTo(sx, sy, sx + k, sy);
      ctx.quadraticCurveTo(sx, sy, sx, sy + k);
      ctx.quadraticCurveTo(sx, sy, sx - k, sy);
      ctx.quadraticCurveTo(sx, sy, sx, sy - k);
      ctx.fill();
    }
    ctx.restore();
  }

  // A new car waiting on the road: a slowly turning model on a golden ring.
  drawCarPickup(p, t) {
    const { ctx, P, s } = this;
    const [gx, gy] = P(p.x, p.y, 0);
    const pulse = 0.5 + 0.5 * Math.sin(t * 4 + p.phase);
    ctx.strokeStyle = `rgba(255,200,61,${(0.6 + pulse * 0.4).toFixed(2)})`;
    ctx.lineWidth = Math.max(3, s * 0.08);
    ctx.fillStyle = 'rgba(255,200,61,0.25)';
    ctx.beginPath();
    ctx.ellipse(gx, gy, s * (0.75 + pulse * 0.08), s * (0.38 + pulse * 0.04), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const spec = CARS.find((c) => c.id === p.car);
    const lift = 0.25 + Math.sin(t * 2.4 + p.phase) * 0.08;
    drawCar(ctx, P, s, p.x, p.y, lift, Math.PI * 1.25 + Math.sin(t * 1.5) * 0.9, spec, t);
  }

  drawPickup(p, t) {
    if (p.type === 'car') return this.drawCarPickup(p, t);
    const { ctx, P, s } = this;
    const col = PICKUPS[p.type].color;
    const [gx, gy] = P(p.x, p.y, 0);
    ctx.fillStyle = 'rgba(40,30,80,0.18)';
    ctx.beginPath();
    ctx.ellipse(gx, gy, s * 0.3, s * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    const [x, y] = P(p.x, p.y, 0.62 + Math.sin(t * 2.4 + p.phase) * 0.1);
    const r = s * 0.3;

    // The boost's coin-style token, with a soft halo in its colour.
    const icon = ICONS[p.type];
    if (icon && ready(icon)) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4 + p.phase);
      ctx.globalAlpha = 0.25 + pulse * 0.2;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, r * (1.3 + pulse * 0.12), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      const k = r * 1.12;
      ctx.drawImage(icon, x - k, y - k, k * 2, k * 2);
      return;
    }

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(2, s * 0.05);
    ctx.stroke();

    ctx.lineWidth = Math.max(1.5, s * 0.045);
    ctx.lineCap = 'round';
    const u = r * 0.45;
    ctx.beginPath();
    if (p.type === 'shield') {
      ctx.moveTo(x, y - u);
      ctx.lineTo(x + u * 0.85, y - u * 0.6);
      ctx.quadraticCurveTo(x + u * 0.8, y + u * 0.6, x, y + u);
      ctx.quadraticCurveTo(x - u * 0.8, y + u * 0.6, x - u * 0.85, y - u * 0.6);
      ctx.closePath();
    } else if (p.type === 'magnet') {
      ctx.arc(x, y - u * 0.1, u * 0.7, Math.PI, 0, true);
      ctx.moveTo(x - u * 0.7, y - u * 0.1);
      ctx.lineTo(x - u * 0.7, y - u * 0.8);
      ctx.moveTo(x + u * 0.7, y - u * 0.1);
      ctx.lineTo(x + u * 0.7, y - u * 0.8);
    } else {
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(r * 1.15)}px "Bebas Neue", Impact, sans-serif`;
      ctx.fillText('2×', x, y + r * 0.05);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // The shield: a glassy force-field dome over the car with a honeycomb
  // skin and a glowing ring where it meets the road. It's big enough to
  // hold the whole car; the back is drawn before the car and the front
  // after it, so the car sits inside the bubble instead of poking out.
  //
  // Painting the honeycomb takes hundreds of paths, far too slow to do
  // every frame, so each half is painted once into an offscreen canvas and
  // reused; only a cheap shimmer is added live.
  shieldDome(car) {
    const { P, s } = this;
    const R = 0.95;
    const [gx, gy] = P(car.x, car.y, 0);
    // A circle of radius R on the ground and a dome of height R, on screen.
    return { gx, gy, rx: 1.2247 * R * s, ry: 0.7071 * R * s, h: 1.25 * R * s };
  }

  domePath(d) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.ellipse(d.gx, d.gy, d.rx, d.h, 0, Math.PI, 0);
    ctx.ellipse(d.gx, d.gy, d.rx, d.ry, 0, 0, Math.PI);
    ctx.closePath();
  }

  // The two halves of the dome as offscreen canvases, rebuilt only when the
  // dome's size on screen changes (a resize or the start zoom).
  shieldSprites(d) {
    const key = Math.round(d.rx * 2);
    const c = this.shieldCache;
    if (c && c.key === key && c.dpr === this.dpr) return c;
    const pad = 20;
    const w = Math.ceil(d.rx * 2 + pad * 2), h = Math.ceil(d.h + d.ry + pad * 2);
    const local = { ...d, gx: pad + d.rx, gy: pad + d.h };
    const paint = (fn) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(w * this.dpr);
      canvas.height = Math.ceil(h * this.dpr);
      const off = canvas.getContext('2d');
      off.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const main = this.ctx;
      this.ctx = off;
      try { fn.call(this, local); } finally { this.ctx = main; }
      return canvas;
    };
    this.shieldCache = {
      key, dpr: this.dpr, pad, w, h,
      back: paint(this.paintShieldBack),
      front: paint(this.paintShieldFront),
    };
    return this.shieldCache;
  }

  // Stamp one cached half over the car, breathing very slightly.
  drawShieldLayer(d, img, t) {
    const c = this.shieldCache;
    const k = 1 + Math.sin(t * 3) * 0.015;
    this.ctx.drawImage(img, d.gx - (c.pad + d.rx) * k, d.gy - (c.pad + d.h) * k, c.w * k, c.h * k);
  }

  // A soft band of light sweeping across the front of the glass.
  drawShieldShimmer(d, t) {
    const { ctx } = this;
    const x = d.gx - d.rx * 1.4 + ((t * 0.45) % 1) * d.rx * 2.8;
    const band = ctx.createLinearGradient(x - d.rx * 0.3, 0, x + d.rx * 0.3, 0);
    band.addColorStop(0, 'rgba(200,240,255,0)');
    band.addColorStop(0.5, 'rgba(200,240,255,0.22)');
    band.addColorStop(1, 'rgba(200,240,255,0)');
    this.domePath(d);
    ctx.fillStyle = band;
    ctx.fill();
  }

  // Cracks spreading across the glass from where the car hit the edge.
  // `k` runs 0 → 1 over the cracking time. The shapes come from `seed`, so
  // they stay put from frame to frame and only grow.
  drawShieldCracks(d, k, seed) {
    const { ctx } = this;
    const rng = mulberry32(seed);
    const ox = d.gx + d.rx * (rng() - 0.5) * 0.5, oy = d.gy - d.h * (0.3 + rng() * 0.25);
    const SEGS = 5;
    const cracks = [];
    for (let i = 0; i < 9; i++) {
      let a = (i / 9) * Math.PI * 2 + rng() * 0.5;
      const step = (d.rx * (0.55 + rng() * 0.7)) / SEGS;
      let x = ox, y = oy;
      const pts = [[x, y]];
      const branches = [];
      for (let j = 1; j <= SEGS; j++) {
        a += (rng() - 0.5) * 0.8;
        x += Math.cos(a) * step;
        y += Math.sin(a) * step * 0.85;
        pts.push([x, y]);
        const ba = a + (rng() < 0.5 ? -1 : 1) * (0.6 + rng() * 0.5);
        const bl = step * (0.6 + rng() * 0.8);
        if (rng() < 0.4) branches.push({ at: j / SEGS, x, y, x2: x + Math.cos(ba) * bl, y2: y + Math.sin(ba) * bl * 0.85 });
      }
      cracks.push({ pts, branches });
    }

    const grow = Math.min(1, k * 1.3);
    ctx.save();
    this.domePath(d);
    ctx.clip();

    // A bright bruise where the glass took the hit.
    const glow = ctx.createRadialGradient(ox, oy, 0, ox, oy, d.rx * 0.45);
    glow.addColorStop(0, `rgba(230,248,255,${(0.75 * grow).toFixed(3)})`);
    glow.addColorStop(1, 'rgba(230,248,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(ox - d.rx, oy - d.rx, d.rx * 2, d.rx * 2);

    ctx.beginPath();
    for (const { pts, branches } of cracks) {
      const n = grow * SEGS;
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let j = 1; j <= SEGS && j - 1 < n; j++) {
        const f = Math.min(1, n - (j - 1));
        const [ax, ay] = pts[j - 1], [bx, by] = pts[j];
        ctx.lineTo(ax + (bx - ax) * f, ay + (by - ay) * f);
      }
      for (const b of branches) {
        if (grow < b.at) continue;
        const f = Math.min(1, (grow - b.at) * SEGS);
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x + (b.x2 - b.x) * f, b.y + (b.y2 - b.y) * f);
      }
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(110,190,255,0.55)';
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
    ctx.lineCap = 'butt';
  }

  // The burst: glass shards thrown out of the dome and a ring of light
  // racing along the road. `t` is seconds since it broke.
  drawShieldShards(d, t, seed) {
    const { ctx } = this;
    const k = t / TUNING.shieldShatter;
    if (k >= 1) return;
    const fade = 1 - k;
    const grow = 1 + (1 - (1 - k) ** 3) * 0.9;

    ctx.strokeStyle = `rgba(175,232,255,${(0.85 * fade).toFixed(3)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(d.gx, d.gy, d.rx * grow, d.ry * grow, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (t < 0.12) {
      ctx.fillStyle = `rgba(220,245,255,${(0.7 * (1 - t / 0.12)).toFixed(3)})`;
      this.domePath(d);
      ctx.fill();
    }

    const rng = mulberry32(seed + 7);
    const cy = d.gy - d.h * 0.45;
    const gravity = d.h * 7;
    ctx.lineWidth = 1;
    for (let i = 0; i < 28; i++) {
      const ang = rng() * Math.PI * 2;
      const r0 = rng();
      const speed = (0.9 + rng() * 1.5) * d.rx * 1.5;
      const spin = (rng() - 0.5) * 14;
      const size = d.rx * (0.07 + rng() * 0.1);
      const p1 = 2 + rng() * 0.6, p2 = 4.1 + rng() * 0.6;
      const x = d.gx + Math.cos(ang) * d.rx * r0 * 0.85 + Math.cos(ang) * speed * t;
      const y = cy + Math.sin(ang) * d.h * r0 * 0.75 + (Math.sin(ang) * speed * 0.7 - d.h * 1.3) * t + 0.5 * gravity * t * t;
      const rot = ang + spin * t;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(rot) * size, y + Math.sin(rot) * size);
      ctx.lineTo(x + Math.cos(rot + p1) * size * 0.8, y + Math.sin(rot + p1) * size * 0.8);
      ctx.lineTo(x + Math.cos(rot + p2) * size * 0.7, y + Math.sin(rot + p2) * size * 0.7);
      ctx.closePath();
      ctx.fillStyle = `rgba(160,220,255,${(0.75 * fade).toFixed(3)})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${(0.9 * fade).toFixed(3)})`;
      ctx.stroke();
    }
  }

  paintShieldBack(d) {
    const { ctx } = this;
    // Glow pooled on the road under the dome.
    ctx.save();
    ctx.translate(d.gx, d.gy);
    ctx.scale(1, d.ry / d.rx);
    const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, d.rx * 1.15);
    pool.addColorStop(0, 'rgba(90,190,255,0.32)');
    pool.addColorStop(1, 'rgba(90,190,255,0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(0, 0, d.rx * 1.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Inside of the far wall, and the far half of the base ring.
    this.domePath(d);
    const wall = ctx.createLinearGradient(0, d.gy - d.h, 0, d.gy + d.ry);
    wall.addColorStop(0, 'rgba(40,110,255,0.10)');
    wall.addColorStop(1, 'rgba(80,200,255,0.2)');
    ctx.fillStyle = wall;
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,220,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(d.gx, d.gy, d.rx, d.ry, 0, Math.PI, 0);
    ctx.stroke();
  }

  paintShieldFront(d) {
    const { ctx, s } = this;
    const cy = d.gy - d.h * 0.4;

    // Glass that gets denser toward the edge, like a real bubble.
    this.domePath(d);
    const glass = ctx.createRadialGradient(d.gx - d.rx * 0.15, cy - d.h * 0.1, 0, d.gx, cy, d.rx * 1.1);
    glass.addColorStop(0, 'rgba(120,200,255,0.03)');
    glass.addColorStop(0.62, 'rgba(90,180,255,0.1)');
    glass.addColorStop(1, 'rgba(70,160,255,0.4)');
    ctx.fillStyle = glass;
    ctx.fill();

    // Honeycomb skin, brightest near the rim, with the odd cell lit up.
    ctx.save();
    this.domePath(d);
    ctx.clip();
    const hs = Math.max(5, s * 0.105);
    const dx = hs * Math.sqrt(3), dy = hs * 1.5;
    ctx.lineWidth = 1;
    let row = 0;
    for (let y = d.gy - d.h - dy; y < d.gy + d.ry + dy; y += dy, row++) {
      let col = 0;
      for (let x = d.gx - d.rx - dx + (row % 2) * dx / 2; x < d.gx + d.rx + dx; x += dx, col++) {
        const nx = (x - d.gx) / d.rx, ny = (y - cy) / (d.h * 0.95);
        const edge = Math.min(1, Math.sqrt(nx * nx + ny * ny));
        const a = 0.06 + 0.45 * edge ** 2.5;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const ang = Math.PI / 6 + (k * Math.PI) / 3;
          const px = x + Math.cos(ang) * hs * 0.9, py = y + Math.sin(ang) * hs * 0.9;
          if (k) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
        ctx.closePath();
        const seed = Math.sin(row * 12.9898 + col * 78.233) * 43758.5453;
        const lit = seed - Math.floor(seed);
        if (lit < 0.1) {
          ctx.fillStyle = `rgba(150,215,255,${(a * 0.4).toFixed(3)})`;
          ctx.fill();
        }
        ctx.strokeStyle = `rgba(170,228,255,${a.toFixed(3)})`;
        ctx.stroke();
      }
    }
    ctx.restore();

    // Glowing outline and the near half of the base ring.
    ctx.save();
    ctx.shadowColor = 'rgba(60,170,255,0.9)';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = 'rgba(160,228,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(d.gx, d.gy, d.rx, d.h, 0, Math.PI, 0);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(185,240,255,0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(d.gx, d.gy, d.rx, d.ry, 0, 0, Math.PI);
    ctx.stroke();
    ctx.restore();

    // A curved highlight on the upper left of the glass.
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = Math.max(2, s * 0.035);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(d.gx, d.gy - d.h * 0.04, d.rx * 0.84, d.h * 0.88, 0, Math.PI * 1.13, Math.PI * 1.4);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  drawCarScene(v) {
    const { ctx, P, s } = this;
    const car = v.car;
    // While the shield is breaking the dome stays up (cracking) until it
    // bursts, then only the shards are left.
    const breaking = v.breakTime >= 0;
    const intact = !car.falling && (v.shield || (breaking && v.breakTime < TUNING.shieldCrack));
    const dome = intact || breaking ? this.shieldDome(car) : null;
    const sprites = intact && this.shieldSprites(dome);

    if (!car.falling) {
      const [ux, uy] = P(car.x, car.y, 0);
      ctx.fillStyle = 'rgba(40,30,80,0.25)';
      ctx.beginPath();
      ctx.ellipse(ux + s * 0.05, uy + s * 0.04, s * 0.52, s * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (intact) this.drawShieldLayer(dome, sprites.back, v.t);

    ctx.save();
    if (car.falling) {
      ctx.globalAlpha = Math.max(0, Math.min(1, 1 + car.z * 0.25));
      // Tip the car over around the point where it touches the ground.
      const [px, py] = P(car.x, car.y, car.z);
      ctx.translate(px, py);
      ctx.rotate(car.tiltDir * car.tilt);
      ctx.translate(-px, -py);
    }
    drawCar(ctx, P, s, car.x, car.y, car.z, car.heading, v.spec, v.t);
    ctx.restore();

    if (intact && breaking) {
      // Flickering glass with the cracks spreading over it.
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(v.breakTime * 70);
      this.drawShieldLayer(dome, sprites.front, v.t);
      ctx.globalAlpha = 1;
      this.drawShieldCracks(dome, v.breakTime / TUNING.shieldCrack, v.breakSeed);
    } else if (intact) {
      this.drawShieldLayer(dome, sprites.front, v.t);
      this.drawShieldShimmer(dome, v.t);
    } else if (breaking) {
      this.drawShieldShards(dome, v.breakTime - TUNING.shieldCrack, v.breakSeed);
    }
  }

  drawParticles(list) {
    const { ctx, P, s } = this;
    for (const p of list) {
      const k = p.life / p.max;
      const [x, y] = P(p.x, p.y, p.z);
      const r = Math.max(0.5, p.size * s * (1 + (1 - k) * p.grow));
      if (p.color.startsWith('#')) {
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
      } else {
        ctx.fillStyle = `rgba(${p.color},${((p.alpha ?? 1) * k).toFixed(3)})`;
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  drawFloats(list) {
    const { ctx, P } = this;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const f of list) {
      const k = f.life / f.max;
      const [x, y] = P(f.x, f.y, f.z);
      const pop = k > 0.85 ? 1 + (k - 0.85) * 2.5 : 1;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `${Math.round(f.size * pop * 1.2)}px "Bebas Neue", Impact, sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#2d2150';
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------- frame

  render(v) {
    this.drawBackdrop(v.camX, v.camY, v.t, v.biome, v.dt);
    const segs = v.track.segments;
    const lo = Math.max(0, v.segIndex - 10);
    const hi = Math.min(segs.length - 1, v.segIndex + 40);
    const car = v.car;
    // Off the far edge, the road only hides the car once it has dropped
    // below the road surface.
    const carBehind = car.falling && car.behind && car.z < -0.05;

    if (carBehind) this.drawCarScene(v);
    this.drawRoad(segs, lo, hi);
    const atStart = lo === 0 && v.start && this.segVisible(segs[0]);
    if (atStart) this.drawStartLine(v.start);
    this.drawSkids(v.effects.skids);
    this.drawBridgePosts(segs, lo, hi);

    // Coins, pickups, the marshal and the car, sorted far to near.
    const items = [];
    for (let i = lo; i <= hi; i++) {
      const g = segs[i];
      if (!this.segVisible(g)) continue;
      for (const c of g.coins) if (!c.taken) items.push({ d: c.x + c.y, k: 0, o: c });
      for (const p of g.pickups) if (!p.taken) items.push({ d: p.x + p.y, k: 1, o: p });
    }
    if (atStart) items.push({ d: v.start.marshal.x + v.start.marshal.y, k: 3, o: v.start.marshal });
    if (!carBehind) items.push({ d: car.x + car.y, k: 2, o: car });
    items.sort((a, b) => a.d - b.d);
    for (const it of items) {
      if (it.k === 0) {
        if (v.beauty) this.drawProduct(it.o, v.t);
        else this.drawCoin(it.o, v.t);
      }
      else if (it.k === 1) this.drawPickup(it.o, v.t);
      else if (it.k === 3) this.drawMarshal(it.o, v.t, v.go);
      else this.drawCarScene(v);
    }

    this.drawParticles(v.effects.particles);
    this.drawFloats(v.effects.floats);
    if (v.go >= 0) {
      const [cx, cy] = this.P(car.x, car.y, 0.3);
      this.drawGoFx(v.go, cx, cy);
    }
  }
}
