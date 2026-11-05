// Car physics.
//
// The car has a heading (where the nose points) and a velocity vector
// (where it is actually going). Input swings the heading toward one of the
// two lane directions. Each frame the velocity is split into a forward
// part and a sideways part; tyre friction slowly kills the sideways part.
// When you turn hard the old momentum becomes sideways motion, so the car
// slides out before it grips again. Less grip (sand, ice) means a longer
// slide. The car never loses speed: whatever isn't sliding sideways goes
// forward, so the total speed always matches the road's pace.

import { DIR } from './config.js';

export class Car {
  constructor() {
    this.spec = null;
    this.reset(0, 0, DIR.L.angle);
  }

  reset(x, y, angle) {
    this.x = x;
    this.y = y;
    this.z = 0;
    this.vz = 0;
    this.vx = 0;
    this.vy = 0;
    this.heading = angle;
    this.vel = angle;    // direction of travel, kept continuous with heading
    this.speed = 0;
    this.slip = 0;       // sideways speed
    this.falling = false;
    this.behind = false; // fell off the far edge, so draw it behind the road
    this.spin = 0;
    this.tilt = 0;       // how far it has tipped over the edge (radians, on screen)
    this.tiltDir = 1;    // which way it tips on screen: -1 left, 1 right
  }

  // Start moving straight ahead at `speed`.
  launch(speed) {
    this.vx = Math.cos(this.heading) * speed;
    this.vy = Math.sin(this.heading) * speed;
    this.speed = speed;
  }

  get drift() {
    return this.heading - this.vel;
  }

  steer(holding, dt) {
    const target = holding ? DIR.R.angle : DIR.L.angle;
    const step = this.spec.turn * dt;
    const diff = target - this.heading;
    this.heading += Math.max(-step, Math.min(step, diff));
  }

  // Advance one step at `speed`. `grip` is the friction rate for sideways
  // motion on the current surface.
  drive(dt, speed, grip) {
    const fx = Math.cos(this.heading), fy = Math.sin(this.heading);
    const rx = -fy, ry = fx;
    let vl = this.vx * rx + this.vy * ry;

    vl *= Math.exp(-grip * dt);
    vl = Math.max(-speed, Math.min(speed, vl));
    const vf = Math.sqrt(speed * speed - vl * vl);

    this.vx = fx * vf + rx * vl;
    this.vy = fy * vf + ry * vl;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.slip = vl;
    this.speed = Math.hypot(this.vx, this.vy);
    this.vel = this.heading + Math.atan2(vl, vf);
  }

  fall(dt, gravity) {
    this.vz -= gravity * dt;
    this.z += this.vz * dt;
    const damp = Math.exp(-0.8 * dt);
    this.vx *= damp;
    this.vy *= damp;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.heading += this.spin * dt;
    this.tilt = Math.min(1.1, this.tilt + 3.2 * dt);
  }

  // Ground positions of the two rear tyres, for skid marks and dust.
  rearWheels() {
    const fx = Math.cos(this.heading), fy = Math.sin(this.heading);
    const rx = -fy, ry = fx;
    const bx = this.x - fx * 0.34, by = this.y - fy * 0.34;
    return [
      { x: bx + rx * 0.24, y: by + ry * 0.24 },
      { x: bx - rx * 0.24, y: by - ry * 0.24 },
    ];
  }
}
