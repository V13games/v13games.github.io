// Tunable numbers and content for Luftvejen.
//
// World space: x/y lie on the ground plane and z points up. The road only
// ever heads toward -x (the "let go" lane) or -y (the "hold" lane). The
// isometric camera shows those as up-left and up-right on screen.

export const DIR = {
  L: { dx: -1, dy: 0, angle: Math.PI },       // button released
  R: { dx: 0, dy: -1, angle: Math.PI * 1.5 }, // button held
};

export const ROAD = {
  baseWidth: 2.6,
  narrowWidth: 1.95,
  slabDepth: 0.7,
  minLen: 3.5,
  bridgeWidth: [1.35, 0.8], // at the start of a run → far into it
  bridgeNarrowBy: 2000,     // distance at which bridges reach their narrowest
};

export const TUNING = {
  startSpeed: 4.8,     // world units per second
  speedGain: 1.0,      // extra speed reached far into a run (kept small on purpose)
  speedRamp: 1500,     // distance over which most of the gain arrives
  gravity: 24,
  coinRadius: 0.6,
  pickupRadius: 0.8,
  magnetRadius: 3.2,
  magnetPull: 14,
  perfectLimit: 0.36,  // max offset from the centre line (fraction of half-width)
  closeLimit: 0.76,    // above this a corner counts as a close call
  comboStep: 0.1,
  comboMax: 20,
  closeBonus: 10,
  edgeGrace: 0.2,      // how far the car's centre may hang over an edge before it tips off
  coinScore: 5,        // points per coin (doubled while 2× point is active)
  reviveCost: 75,
  reviveWindow: 6,     // seconds the revive offer stays open
  pickupTime: { magnet: 10, double: 15 },
  shieldCrack: 0.6,    // seconds the shield spends cracking when it saves you
  shieldShatter: 0.8,  // seconds the shards fly before the countdown
  shieldCountdown: 2.4,
  boostsFrom: 120,     // distance before boost pickups start to appear
};

// The road changes world every `BIOME_LENGTH` units of distance. `grip`
// multiplies the car's own grip, so ice slides far more than asphalt.
export const BIOME_LENGTH = 320;

export const BIOMES = [
  {
    id: 'eng', name: 'Engen', tip: 'Godt greb på asfalten',
    grip: 1, speed: 1, lenScale: 1, minLen: 3.5, widthBonus: 0,
    sky: ['#58c2ff', '#d4f2ff'],
    road: '#707a96', edge: '#ffffff', band: '#63d35c', side: '#b0703f', sideDark: '#8e5730',
    dust: '240,240,245', skid: '45,45,60',
  },
  {
    id: 'strand', name: 'Stranden', tip: 'Sandet er lidt glat',
    grip: 0.72, speed: 1, lenScale: 1.1, minLen: 4, widthBonus: 0.1,
    sky: ['#ff9f5a', '#ffe7c2'],
    road: '#f1cf8b', edge: '#fff7e0', band: '#ffe3a8', side: '#d69a52', sideDark: '#b57c39',
    dust: '238,205,140', skid: '176,128,66',
  },
  {
    id: 'is', name: 'Isbjergene', tip: 'Meget glat føre!',
    grip: 0.45, speed: 0.93, lenScale: 1.3, minLen: 5, widthBonus: 0.3,
    sky: ['#7fa8ff', '#e9f1ff'],
    road: '#bfe7fb', edge: '#ffffff', band: '#ffffff', side: '#7cc4ea', sideDark: '#5aa5d3',
    dust: '255,255,255', skid: '110,160,205',
  },
  {
    id: 'slik', name: 'Slikland', tip: 'Højere fart',
    grip: 0.9, speed: 1.1, lenScale: 1.05, minLen: 3.5, widthBonus: 0,
    sky: ['#ff8fcf', '#ffe9f6'],
    road: '#ff8fc4', edge: '#ffffff', band: '#fff0f8', side: '#8f4e30', sideDark: '#713b23',
    dust: '255,205,232', skid: '150,60,110',
  },
];

export const biomeIndexAt = (dist) => Math.floor(dist / BIOME_LENGTH) % BIOMES.length;

// Every car handles differently: `turn` is how fast the nose swings
// (radians per second) and `grip` is how quickly sideways sliding dies
// out (higher = shorter drifts).
// Every run starts in Gnisten. The other cars wait on the road: once you
// have driven `at` units, the next one appears as a pickup, and driving
// through it swaps your car for the rest of the run.
export const CARS = [
  {
    id: 'spark', name: 'Gnisten', at: 0, kind: 'hatch',
    perk: 'God balance',
    turn: 8.0, grip: 4.6,
    colors: { body: '#ff5a5f', trim: '#ffffff' },
  },
  {
    id: 'cab', name: 'Taxa', at: 250, kind: 'taxi',
    perk: '+1 mønt for hvert perfekt sving · bedre vejgreb',
    turn: 7.8, grip: 6.2, perfectCoin: 1,
    colors: { body: '#ffc22e', trim: '#2b2140' },
  },
  {
    id: 'patrol', name: 'Politi', at: 520, kind: 'police',
    perk: 'Magneter varer dobbelt så længe · bedre vejgreb',
    turn: 8.4, grip: 6.6, magnetTime: 2,
    colors: { body: '#ffffff', trim: '#2a4bd7' },
  },
  {
    id: 'scoop', name: 'Isbilen', at: 800, kind: 'van',
    perk: 'Ekstra godt greb på is',
    turn: 7.2, grip: 4.4, iceGrip: 1.6,
    colors: { body: '#9ef0ff', trim: '#ff7eb6' },
  },
  {
    id: 'brute', name: 'Bulderbassen', at: 1100, kind: 'monster',
    perk: 'Kommer med et skjold · store dæk der sidder fast',
    turn: 7.0, grip: 7.4, giveShield: true,
    colors: { body: '#7bd148', trim: '#2a1a12' },
  },
  {
    id: 'phantom', name: 'Raketten', at: 1450, kind: 'super',
    perk: '+15 % point · bedste vejgreb',
    turn: 9.0, grip: 8.0, scoreBonus: 1.15,
    colors: { body: '#7b5cff', trim: '#ffd23f' },
  },
];

// Boost pickups that turn up on the road once you're far enough.
export const PICKUPS = {
  magnet: { name: 'Magnet', color: '#ff4f6d' },
  shield: { name: 'Skjold', color: '#2bb3ff' },
  double: { name: '2× point', color: '#8b5cf6' },
};
