// Small shared helpers.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mod = (a, m) => ((a % m) + m) % m;

// Seeded PRNG so a track can be rebuilt from one number.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Scale an [r,g,b] colour by `f` (0..2) and return a CSS colour string.
export function shade(rgb, f, a = 1) {
  const r = Math.min(255, Math.round(rgb[0] * f));
  const g = Math.min(255, Math.round(rgb[1] * f));
  const b = Math.min(255, Math.round(rgb[2] * f));
  return `rgba(${r},${g},${b},${a})`;
}
