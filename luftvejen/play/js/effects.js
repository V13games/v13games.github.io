// Visual feedback that doesn't affect gameplay: particles, floating text,
// skid marks and screen shake. Positions are in world space so they stay
// glued to the road as the camera moves.

const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export class Effects {
  constructor() {
    this.clear();
  }

  clear() {
    this.particles = [];
    this.floats = [];
    this.skids = [];
    this.shakeAmp = 0;
  }

  burst(x, y, z, color, count, speed, { size = 0.07, gravity = 6, life = 0.6 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({
        x, y, z,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 1.5 + Math.random() * speed,
        life: life * (0.6 + Math.random() * 0.4), max: life,
        size, grow: 0, color, gravity,
      });
    }
  }

  // Tyre dust; the colour follows the road surface.
  smoke(x, y, color) {
    this.particles.push({
      x, y, z: 0.05,
      vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, vz: 0.5,
      life: 0.7, max: 0.7, size: 0.13, grow: 2.5,
      color, gravity: 0, alpha: 0.6,
    });
  }

  float(x, y, text, color, size = 22) {
    this.floats.push({ x, y, z: 0.9, text, color, size, life: 1.1, max: 1.1 });
  }

  skid(a, b, color) {
    this.skids.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, age: 0, color });
    if (this.skids.length > 600) this.skids.splice(0, this.skids.length - 600);
  }

  shake(amount) {
    if (REDUCED_MOTION) return;
    this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  shakeOffset() {
    if (this.shakeAmp <= 0.001) return { x: 0, y: 0 };
    const m = this.shakeAmp * 14;
    return { x: (Math.random() - 0.5) * m, y: (Math.random() - 0.5) * m };
  }

  update(dt) {
    this.shakeAmp *= Math.exp(-7 * dt);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vz -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z = Math.max(0, p.z + p.vz * dt);
    }

    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      f.z += dt * 1.1;
      if (f.life <= 0) this.floats.splice(i, 1);
    }

    for (const s of this.skids) s.age += dt;
    while (this.skids.length && this.skids[0].age > 6) this.skids.shift();
  }
}
