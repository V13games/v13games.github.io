// Low-poly cars built from shaded boxes.
//
// `P(x, y, z)` projects a world point to the screen. Each model is a list
// of boxes in the car's own frame: [colour, forward offset, side offset,
// bottom z, length, width, height]. Boxes never overlap: they are stacked
// in layers (same bottom z) and sit side by side within a layer, so
// drawing layer by layer, far to near, always looks right whichever way
// the car is turned. `tail` is [half body length, body bottom z].
// Wheels sit just outside the body's sides, never inside it, so each one
// is cleanly in front of or behind the body.

import { hexToRgb, shade } from './util.js';

const LIGHT = [0.28, 0.96]; // light from the +y side (screen lower-left)
const WHEEL = hexToRgb('#15111f');
const GLASS = hexToRgb('#1f2a5c');
const TAIL = hexToRgb('#ff2d55');
const SIGN = hexToRgb('#fff2a8');
const RED = hexToRgb('#ff2440');
const BLUE = hexToRgb('#2f7bff');

const MODELS = {
  hatch: {
    wheels: { off: 0.32, side: 0.32, size: [0.24, 0.08, 0.2] },
    tail: [0.5, 0.08],
    parts: [
      ['body', 0, 0, 0.08, 1.0, 0.56, 0.2],
      ['glass', -0.06, 0, 0.28, 0.52, 0.48, 0.15],
      ['trim', -0.47, 0, 0.36, 0.1, 0.58, 0.035],
      ['body', -0.06, 0, 0.43, 0.48, 0.46, 0.03],
    ],
  },
  taxi: {
    wheels: { off: 0.33, side: 0.32, size: [0.24, 0.08, 0.2] },
    tail: [0.52, 0.08],
    parts: [
      ['body', 0, 0, 0.08, 1.04, 0.56, 0.2],
      ['glass', -0.04, 0, 0.28, 0.56, 0.48, 0.15],
      ['body', -0.04, 0, 0.43, 0.52, 0.46, 0.03],
      ['sign', -0.04, 0, 0.46, 0.14, 0.3, 0.09],
    ],
  },
  police: {
    wheels: { off: 0.33, side: 0.32, size: [0.24, 0.08, 0.2] },
    tail: [0.52, 0.08],
    parts: [
      // Dark bonnet and boot with a white middle, side by side.
      ['trim', 0.37, 0, 0.08, 0.3, 0.56, 0.2],
      ['body', -0.02, 0, 0.08, 0.48, 0.56, 0.2],
      ['trim', -0.39, 0, 0.08, 0.26, 0.56, 0.2],
      ['glass', -0.04, 0, 0.28, 0.56, 0.48, 0.15],
      ['body', -0.04, 0, 0.43, 0.52, 0.46, 0.03],
      ['lightA', -0.04, -0.1, 0.46, 0.12, 0.18, 0.06],
      ['lightB', -0.04, 0.1, 0.46, 0.12, 0.18, 0.06],
    ],
  },
  van: {
    wheels: { off: 0.36, side: 0.33, size: [0.24, 0.08, 0.2] },
    tail: [0.55, 0.08],
    parts: [
      ['body', 0, 0, 0.08, 1.1, 0.58, 0.2],
      ['trim', -0.13, 0, 0.28, 0.82, 0.56, 0.34],
      ['glass', 0.405, 0, 0.28, 0.25, 0.5, 0.16],
      ['body', -0.13, 0, 0.62, 0.84, 0.58, 0.03],
    ],
    cone: { off: -0.13, z: 0.65 },
  },
  monster: {
    wheels: { off: 0.34, side: 0.36, size: [0.4, 0.16, 0.4] },
    tail: [0.475, 0.32],
    parts: [
      ['body', 0, 0, 0.32, 0.95, 0.56, 0.2],
      ['trim', 0.5, 0, 0.32, 0.05, 0.56, 0.12],
      ['glass', -0.06, 0, 0.52, 0.5, 0.46, 0.17],
      ['body', -0.06, 0, 0.69, 0.46, 0.44, 0.03],
    ],
  },
  super: {
    wheels: { off: 0.36, side: 0.35, size: [0.24, 0.08, 0.18] },
    tail: [0.56, 0.07],
    parts: [
      ['body', 0, 0, 0.07, 1.12, 0.62, 0.15],
      ['glass', -0.05, 0, 0.22, 0.46, 0.46, 0.12],
      ['trim', -0.5, -0.24, 0.22, 0.04, 0.04, 0.08],
      ['trim', -0.5, 0.24, 0.22, 0.04, 0.04, 0.08],
      ['trim', -0.52, 0, 0.3, 0.12, 0.66, 0.03],
    ],
  },
};

function quad(ctx, a, b, c, d, fill) {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.lineTo(c[0], c[1]);
  ctx.lineTo(d[0], d[1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

// Draw one box. Only the faces turned toward the camera (normals with a
// positive x+y component) are drawn, then the lid on top.
function box(ctx, P, cx, cy, cz, fx, fy, off, side, z0, L, W, H, rgb, glow = 1) {
  const rx = -fy, ry = fx;
  const ox = cx + fx * off + rx * side;
  const oy = cy + fy * off + ry * side;
  const hl = L / 2, hw = W / 2;
  const za = cz + z0, zb = cz + z0 + H;
  const pt = (i, j, z) => P(ox + fx * hl * i + rx * hw * j, oy + fy * hl * i + ry * hw * j, z);

  const faces = [
    [fx, fy, 1, -1, 1, 1],
    [-fx, -fy, -1, 1, -1, -1],
    [rx, ry, 1, 1, -1, 1],
    [-rx, -ry, -1, -1, 1, -1],
  ];
  for (const [nx, ny, ai, aj, bi, bj] of faces) {
    if (nx + ny <= 0.001) continue;
    const lum = (0.52 + 0.3 * (nx * LIGHT[0] + ny * LIGHT[1])) * glow;
    quad(ctx, pt(ai, aj, za), pt(bi, bj, za), pt(bi, bj, zb), pt(ai, aj, zb), shade(rgb, lum));
  }
  quad(ctx, pt(1, -1, zb), pt(1, 1, zb), pt(-1, 1, zb), pt(-1, -1, zb), shade(rgb, 1.04 * glow));
}

function partColor(key, rgb, t) {
  switch (key) {
    case 'body': return [rgb.body, 1];
    case 'trim': return [rgb.trim, 1];
    case 'glass': return [GLASS, 1.15];
    case 'sign': return [SIGN, 1.25];
    case 'lightA': return [RED, Math.floor(t * 6) % 2 ? 1.5 : 0.55];
    case 'lightB': return [BLUE, Math.floor(t * 6) % 2 ? 0.55 : 1.5];
    default: return [rgb.body, 1];
  }
}

export function drawCar(ctx, P, s, x, y, z, heading, spec, t) {
  const m = MODELS[spec.kind] || MODELS.hatch;
  const rgb = spec._rgb || (spec._rgb = { body: hexToRgb(spec.colors.body), trim: hexToRgb(spec.colors.trim) });
  const fx = Math.cos(heading), fy = Math.sin(heading);
  const rx = -fy, ry = fx;
  const w = m.wheels;

  // A wheel is beside the body, so the side it's on decides the order:
  // wheels on the side facing the camera go over the body, the others
  // under it. (Going by the wheel's centre instead put both rear wheels
  // on top when the car drove away from the camera.)
  const far = [], near = [];
  for (const i of [1, -1]) {
    for (const j of [1, -1]) {
      const depth = (fx + fy) * i * w.off + (rx + ry) * j * w.side;
      (j * (rx + ry) > 0 ? near : far).push({ o: i * w.off, sd: j * w.side, depth });
    }
  }
  far.sort((a, b) => a.depth - b.depth);
  near.sort((a, b) => a.depth - b.depth);
  const [wl, ww, wh] = w.size;

  // Painter's order: lowest layer first, and within a layer the box
  // furthest from the camera first (the camera looks along +x+y).
  const parts = m.parts
    .map(([key, off, side, z0, L, W, H]) => ({
      key, off, side, z0, L, W, H,
      depth: (fx + fy) * off + (rx + ry) * side,
    }))
    .sort((a, b) => a.z0 - b.z0 || a.depth - b.depth);
  const baseZ = parts[0].z0;
  const drawPart = (p) => {
    const [c, glow] = partColor(p.key, rgb, t);
    box(ctx, P, x, y, z, fx, fy, p.off, p.side, p.z0, p.L, p.W, p.H, c, glow);
  };

  for (const { o, sd } of far) box(ctx, P, x, y, z, fx, fy, o, sd, 0, wl, ww, wh, WHEEL);
  for (const p of parts) if (p.z0 === baseZ) drawPart(p);
  for (const { o, sd } of near) box(ctx, P, x, y, z, fx, fy, o, sd, 0, wl, ww, wh, WHEEL);

  // Tail lights sit on the rear face; only draw them when it faces us.
  if (-fx - fy > 0) {
    const [half, bz] = m.tail;
    for (const sd of [-0.19, 0.19]) {
      box(ctx, P, x, y, z, fx, fy, -half - 0.01, sd, bz + 0.08, 0.02, 0.12, 0.05, TAIL, 1.5);
    }
  }

  for (const p of parts) if (p.z0 !== baseZ) drawPart(p);

  if (m.cone) {
    const [bx, by] = P(x + fx * m.cone.off, y + fy * m.cone.off, z + m.cone.z);
    const u = s * 0.1;
    ctx.fillStyle = '#e8b06a';
    ctx.beginPath();
    ctx.moveTo(bx - u, by - u * 2.4);
    ctx.lineTo(bx + u, by - u * 2.4);
    ctx.lineTo(bx, by);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff8fc4';
    ctx.beginPath();
    ctx.arc(bx, by - u * 2.9, u * 1.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff2d55';
    ctx.beginPath();
    ctx.arc(bx + u * 0.2, by - u * 4.1, u * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}
