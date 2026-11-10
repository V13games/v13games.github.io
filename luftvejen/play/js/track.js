// Procedural sky road.
//
// The road is a chain of straight segments that alternate between the two
// lane directions, so every joint is a 90-degree corner. Each segment is
// made of axis-aligned rectangles in world space: normally one, or three
// when a narrow bridge cuts across the middle. That keeps "is the car
// still on the road?" down to a few comparisons.

import { DIR, ROAD, BIOMES, BIOME_LENGTH, CARS, TUNING, biomeIndexAt } from './config.js';
import { mulberry32, clamp, lerp } from './util.js';

export class Track {
  constructor() {
    this.segments = [];
  }

  reset(seed) {
    this.rng = mulberry32(seed);
    this.segments = [];
    this.lastPickup = -10;
    this.lastBridge = -10;
    this.carQueue = CARS.slice(1); // cars still waiting to appear, in order
    this.shieldWorld = 0;          // the last world that has had its shield
    // A long, wide starting runway with extra room behind the car, a
    // chequered start line just ahead of it and a flag marshal standing at
    // the far edge of the line.
    const w = ROAD.baseWidth + 0.4;
    this.add('L', 0, 0, 11, w, { back: 2.2 });
    this.start = { x: -2.2, half: w / 2, marshal: { x: -2.2, y: -w / 2 + 0.38 } };
    this.ensureAhead(0);
  }

  // 0 at the start of a run, 1 once the road is as hard as it gets.
  difficulty(dist) {
    return clamp(dist / 1600, 0, 1);
  }

  add(dir, sx, sy, len, w, { back = 0, bridge = null } = {}) {
    const d = DIR[dir];
    const prev = this.segments[this.segments.length - 1];
    const start = prev ? prev.start + prev.len : 0;
    const h = w / 2;

    // A rectangle covering distances p..q along the segment, half-width hw.
    const rect = (p, q, hw, kind) => (dir === 'L'
      ? { x0: sx - q, x1: sx - p, y0: sy - hw, y1: sy + hw, kind }
      : { x0: sx - hw, x1: sx + hw, y0: sy - q, y1: sy - p, kind });

    // Each segment reaches half its width past both corner points, so the
    // overlap of two neighbours fills the corner square.
    const rects = bridge
      ? [
        rect(-h - back, bridge.a0, h, 'road'),
        rect(bridge.a0, bridge.a0 + bridge.len, bridge.width / 2, 'bridge'),
        rect(bridge.a0 + bridge.len, len + h, h, 'road'),
      ]
      : [rect(-h - back, len + h, h, 'road')];

    const seg = {
      i: this.segments.length,
      dir, dx: d.dx, dy: d.dy, angle: d.angle,
      sx, sy, ex: sx + d.dx * len, ey: sy + d.dy * len, len, w,
      rects, bridge,
      x0: Math.min(...rects.map((r) => r.x0)),
      x1: Math.max(...rects.map((r) => r.x1)),
      y0: Math.min(...rects.map((r) => r.y0)),
      y1: Math.max(...rects.map((r) => r.y1)),
      start, // distance along the road
      biome: biomeIndexAt(start),
      coins: [],
      pickups: [],
    };
    this.segments.push(seg);
    return seg;
  }

  next() {
    const prev = this.segments[this.segments.length - 1];
    const dist = prev.start + prev.len;
    const k = this.difficulty(dist);
    const B = BIOMES[biomeIndexAt(dist)];
    const r = this.rng;
    const dir = prev.dir === 'L' ? 'R' : 'L';
    const early = this.segments.length < 4;
    const i = this.segments.length;

    let len;
    if (!early && r() < 0.16 + 0.2 * k) {
      len = B.minLen + r() * 0.8; // quick flick: two corners close together
    } else {
      len = (lerp(4.5, 3.8, k) + r() * lerp(5.5, 4, k)) * B.lenScale;
    }
    len = Math.max(B.minLen, len);

    const narrow = !early && dist > 250 && r() < 0.3 * k;
    let w = (early ? ROAD.baseWidth + 0.2 : narrow ? ROAD.narrowWidth : ROAD.baseWidth) + B.widthBonus;

    // Short narrow bridges, kept clear of the corners so a sliding car has
    // time to settle before it gets there. They get thinner and a little
    // longer the further you drive.
    let bridge = null;
    if (!early && dist > 60 && i - this.lastBridge > 2 && r() < 0.16 + 0.2 * k) {
      w = Math.max(w, ROAD.baseWidth);
      const narrowing = clamp(dist / ROAD.bridgeNarrowBy, 0, 1);
      const bw = lerp(ROAD.bridgeWidth[0], ROAD.bridgeWidth[1], narrowing);
      const bl = 1.4 + r() * 1.3 + narrowing * 0.8;
      const margin = w / 2 + 1.6 + (1 / B.grip - 1) * 1.2;
      len = Math.max(len, margin * 2 + bl + 0.5);
      len = Math.round(len * 2) / 2;
      bridge = { a0: margin + r() * (len - 2 * margin - bl), len: bl, width: bw };
      this.lastBridge = i;
    } else {
      len = Math.round(len * 2) / 2;
    }

    const seg = this.add(dir, prev.ex, prev.ey, len, w, { bridge });
    if (!early) this.decorate(seg, k);
    return seg;
  }

  // Coins and pickups. Coin rows get more frequent and denser as the run
  // goes on; cars and boosts only show up once you've come far enough.
  decorate(seg, k) {
    const r = this.rng;
    const from = seg.w * 0.75;
    const usable = seg.len - seg.w * 1.1;
    if (usable <= 0.6) return;
    const mid = from + usable * 0.5;
    const place = (extra) => {
      seg.pickups.push({ x: seg.sx + seg.dx * mid, y: seg.sy + seg.dy * mid, taken: false, phase: r() * 6, ...extra });
      this.lastPickup = seg.i;
    };

    const nextCar = this.carQueue[0];
    if (nextCar && !seg.bridge && seg.start >= nextCar.at) {
      this.carQueue.shift();
      place({ type: 'car', car: nextCar.id });
      return;
    }

    // Every new world starts with one shield, right after the border.
    const world = Math.floor(seg.start / BIOME_LENGTH);
    if (world > this.shieldWorld && !seg.bridge) {
      this.shieldWorld = world;
      place({ type: 'shield' });
      return;
    }

    // Random boosts: magnets and 2× point (shields only come per world).
    if (!seg.bridge && seg.start > TUNING.boostsFrom && seg.i - this.lastPickup > 4 && r() < 0.13) {
      place({ type: r() < 0.5 ? 'magnet' : 'double' });
      return;
    }

    if (r() > 0.42 + 0.45 * k) return;
    // Over a bridge, coins always run down the middle as a guide.
    const pattern = seg.bridge ? 0 : r();
    const side = r() < 0.5 ? -1 : 1;
    const step = lerp(0.85, 0.62, k);
    let n = 0;
    for (let a = from; a <= from + usable; a += step) {
      let off = 0;
      if (pattern < 0.4) off = 0;                                      // centre line
      else if (pattern < 0.75) off = Math.sin(n * 0.9) * seg.w * 0.22; // weave
      else off = side * seg.w * 0.3;                                    // tempting edge line
      seg.coins.push({
        x: seg.sx + seg.dx * a + (seg.dir === 'R' ? off : 0),
        y: seg.sy + seg.dy * a + (seg.dir === 'L' ? off : 0),
        taken: false,
        spin: n * 0.5,
        item: (seg.i * 3 + n) % 5, // which product it shows in beauty mode
      });
      n++;
    }
  }

  ensureAhead(dist) {
    let last = this.segments[this.segments.length - 1];
    while (last.start + last.len < dist + 70) last = this.next();
  }

  // Index of the furthest segment containing the point, or -1 if it's over
  // the void. Only segments near `hint` are checked.
  locate(x, y, hint) {
    const hi = Math.min(this.segments.length - 1, hint + 2);
    const lo = Math.max(0, hint - 2);
    for (let i = hi; i >= lo; i--) {
      for (const g of this.segments[i].rects) {
        if (x >= g.x0 && x <= g.x1 && y >= g.y0 && y <= g.y1) return i;
      }
    }
    return -1;
  }

  // The closest bit of road to a point that has left it: which segment,
  // how far away (0 if on the road) and the nearest road point. Looks at
  // every segment near `hint`, so at a corner the next straight counts too.
  nearest(x, y, hint) {
    const hi = Math.min(this.segments.length - 1, hint + 2);
    const lo = Math.max(0, hint - 2);
    let best = { i: hint, d: Infinity, qx: x, qy: y };
    for (let i = hi; i >= lo; i--) {
      for (const g of this.segments[i].rects) {
        const qx = clamp(x, g.x0, g.x1), qy = clamp(y, g.y0, g.y1);
        const d = Math.hypot(x - qx, y - qy);
        if (d < best.d) best = { i, d, qx, qy };
      }
    }
    return best;
  }

  // Distance travelled along a segment from its starting corner.
  along(g, x, y) {
    return (x - g.sx) * g.dx + (y - g.sy) * g.dy;
  }

  // Signed sideways distance from a segment's centre line.
  lateral(g, x, y) {
    return g.dir === 'L' ? y - g.sy : x - g.sx;
  }
}
