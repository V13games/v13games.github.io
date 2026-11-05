// Every sound is synthesised with Web Audio, so there are no files to load.
// The context is created on the first user gesture (browsers block audio
// before that).

let ctx = null;
let master = null;
let engOsc = null, engFilter = null, engGain = null;
let skidGain = null;
let muted = false;
let lastEngine = null, lastSkid = null; // last levels sent, to skip repeats

const VOLUME = 0.5;

function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  try { ctx = new AC(); } catch { return false; }

  master = ctx.createGain();
  master.gain.value = muted ? 0 : VOLUME;
  master.connect(ctx.destination);

  // Engine: a filtered sawtooth whose pitch follows speed.
  engOsc = ctx.createOscillator();
  engOsc.type = 'sawtooth';
  engOsc.frequency.value = 55;
  engFilter = ctx.createBiquadFilter();
  engFilter.type = 'lowpass';
  engFilter.frequency.value = 300;
  engGain = ctx.createGain();
  engGain.gain.value = 0;
  engOsc.connect(engFilter);
  engFilter.connect(engGain);
  engGain.connect(master);
  engOsc.start();

  // Tyre squeal: looping band-passed noise, faded in while drifting.
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2100;
  band.Q.value = 2.5;
  skidGain = ctx.createGain();
  skidGain.gain.value = 0;
  noise.connect(band);
  band.connect(skidGain);
  skidGain.connect(master);
  noise.start();
  return true;
}

export const Sound = {
  unlock() {
    if (!ctx && !build()) return;
    if (ctx.state === 'suspended') ctx.resume();
  },

  setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : VOLUME, ctx.currentTime, 0.02);
  },

  // These two are called every frame. Each call queues an automation event
  // on the audio thread, and a queue that grows by 60 a second makes the
  // game hitch, so only send a change when it's big enough to hear.
  engine(on, speedNorm = 0) {
    if (!ctx) return;
    const level = on ? Math.round(speedNorm * 40) : -1;
    if (level === lastEngine) return;
    lastEngine = level;
    const t = ctx.currentTime;
    engGain.gain.cancelScheduledValues(t);
    engOsc.frequency.cancelScheduledValues(t);
    engFilter.frequency.cancelScheduledValues(t);
    engGain.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.12);
    engOsc.frequency.setTargetAtTime(48 + speedNorm * 50, t, 0.2);
    engFilter.frequency.setTargetAtTime(240 + speedNorm * 320, t, 0.2);
  },

  skid(amount) {
    if (!ctx) return;
    const level = Math.round(Math.min(1, Math.max(0, amount)) * 20);
    if (level === lastSkid) return;
    lastSkid = level;
    const t = ctx.currentTime;
    skidGain.gain.cancelScheduledValues(t);
    skidGain.gain.setTargetAtTime((level / 20) * 0.07, t, 0.05);
  },

  tone(freq, dur, { type = 'sine', vol = 0.12, to = null, delay = 0 } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  },

  coin() {
    this.tone(1320, 0.07, { type: 'square', vol: 0.04 });
    this.tone(1980, 0.12, { type: 'square', vol: 0.04, delay: 0.05 });
  },

  // Each Perfect in a row climbs a semitone.
  perfect(level) {
    const base = 523 * Math.pow(2, Math.min(level, 14) / 12);
    this.tone(base, 0.2, { type: 'triangle', vol: 0.12 });
    this.tone(base * 1.5, 0.26, { type: 'triangle', vol: 0.07, delay: 0.06 });
  },

  close() {
    this.tone(260, 0.28, { type: 'sawtooth', vol: 0.04, to: 880 });
  },

  pickup() {
    [660, 880, 1320].forEach((f, i) => this.tone(f, 0.14, { type: 'triangle', vol: 0.09, delay: i * 0.06 }));
  },

  // The shield catching the car: a hum and a few sharp glassy ticks as
  // the cracks spread.
  crack() {
    this.tone(220, 0.5, { type: 'sine', vol: 0.14, to: 330 });
    [0, 0.14, 0.26, 0.38, 0.47].forEach((d, i) => {
      this.tone(2600 - i * 220, 0.05, { type: 'square', vol: 0.035, to: 1400, delay: d });
    });
  },

  // ...and bursting: a thump under a shower of high glass tinkles.
  shatter() {
    this.tone(170, 0.3, { type: 'sine', vol: 0.18, to: 55 });
    for (let i = 0; i < 9; i++) {
      this.tone(2200 + Math.random() * 2400, 0.12 + Math.random() * 0.12, { type: 'triangle', vol: 0.04, delay: i * 0.03 });
    }
  },

  fall() {
    this.tone(520, 0.9, { type: 'sine', vol: 0.12, to: 55 });
  },

  revive() {
    [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.09, delay: i * 0.07 }));
  },

  // Crossing the start line: a rising whoosh under a bright fanfare.
  go() {
    this.tone(110, 0.5, { type: 'sawtooth', vol: 0.07, to: 880 });
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, { type: 'square', vol: 0.05, delay: 0.04 + i * 0.05 }));
    this.tone(1047, 0.5, { type: 'triangle', vol: 0.1, delay: 0.24 });
  },

  buy() {
    this.tone(880, 0.08, { type: 'square', vol: 0.05 });
    this.tone(1320, 0.16, { type: 'square', vol: 0.05, delay: 0.07 });
  },

  click() {
    this.tone(640, 0.05, { type: 'square', vol: 0.03 });
  },
};
