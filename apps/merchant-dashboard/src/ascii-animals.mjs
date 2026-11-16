/*
 * ascii animals — animals drawn as ASCII on a canvas (https://github.com/DesignerStephen1/ascii-animals, built on
 * https://github.com/stackedlol/ascii-sharks). Bundled from its src/ on 2026-11-15 for YAPI's welcome screen (butterflies)
 * and the login panel (koi), owner's request. One change: AnimalEngine takes `background` (an [r, g, b] the animals fade
 * into) so the koi swim in the login's deep blue. Regenerate with esbuild src/index.ts --bundle --format=esm.
 *
 * MIT License
 *
 * Copyright (c) 2026 drewdi
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/math.ts
var TAU = Math.PI * 2;
var clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
var rand = (lo, hi) => lo + Math.random() * (hi - lo);
var frac = (x) => x - Math.floor(x);
var lerp = (a, b, t) => a + (b - a) * t;
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// src/flock.ts
var SHARED_TUNING = {
  // Movement
  /** Individuals per screen, relative to the area-based default. */
  density: 1,
  /** Cross corner to corner (bottom-left → top-right) whatever the screen shape. */
  corner: false,
  /** Course in degrees when not corner to corner: 0 → right, 90 → up. */
  direction: 49,
  speed: 1,
  /** How far the whole stream sways off course, radians. */
  sway: 0.04,
  /** How far each individual's own course can differ from the stream's, radians. */
  spread: 0.06,
  /** Size multiplier. */
  size: 1,
  /** Depth of the farthest individuals (1 = everyone equally near). */
  farthest: 0.45,
  /** >1 puts more of the population far away; <1 brings it close. */
  farBias: 1.6,
  /** How tightly individuals hold their course. */
  grip: 2,
  /** Push between neighbours at the same depth. */
  separation: 300,
  // Look
  /**
   * Turns the animal's colours around the colour wheel, degrees. For trying colours out: each
   * animal's own colour is fixed in its file. (Named hueShift so shifts saved by the old Hue knob
   * don't come back.)
   */
  hueShift: 0,
  /** Strength of the iridescent brightness roll. */
  shimmer: 0.3,
  /** Chance a shimmering cell flashes white; plain ones get a third of it. */
  sparkle: 0.12,
  /** How much the farthest individuals fade into the background. */
  fog: 0.75,
  /** How much they leave in the trail. */
  trail: 1,
  /** How fast the trail fades, per second. */
  trailFade: 1.3,
  /** Grid line strength. */
  grid: 1.05,
  /** ASCII resolution: higher means smaller cells. */
  detail: 1.3
};
var SHARED_CONTROLS = {
  movement: [
    { key: "density", label: "Density", min: 0.1, max: 4, step: 0.05, hint: "How many are on screen." },
    { key: "corner", label: "Corner to corner", toggle: true, hint: "Cross from the bottom-left corner to the top-right, whatever the window's shape. Turn off to set Direction yourself." },
    { key: "direction", label: "Direction (\xB0)", min: 0, max: 360, step: 1, disabledWhen: "corner", hint: "Which way they travel, in degrees: 0 is right, 90 is up. Only used when Corner to corner is off." },
    { key: "speed", label: "Speed", min: 0.1, max: 3, step: 0.05, hint: "How fast they travel." },
    { key: "sway", label: "Sway", min: 0, max: 0.6, step: 0.01, hint: "How much the whole group slowly drifts left and right off course. 0 is a dead-straight line." },
    { key: "spread", label: "Spread", min: 0, max: 0.8, step: 0.01, hint: "How far each one's own path can stray from the group's. 0 means everyone keeps exactly the same line." },
    { key: "size", label: "Size", min: 0.3, max: 2.5, step: 0.05, hint: "How big they are." },
    { key: "farthest", label: "Farthest depth", min: 0.1, max: 1, step: 0.01, hint: "How small and faint the farthest ones get. 1 makes them all equally close." },
    { key: "farBias", label: "Far bias", min: 0.3, max: 3, step: 0.05, hint: "How many sit far away versus close. Higher puts more of them in the distance." },
    { key: "grip", label: "Hold course", min: 0.2, max: 5, step: 0.05, hint: "How hard they steer back onto course after drifting. Higher is stricter." },
    { key: "separation", label: "Separation", min: 0, max: 1e3, step: 10, hint: "How strongly neighbours keep their distance from each other." }
  ],
  look: [
    { key: "hueShift", label: "Hue shift (\xB0)", min: -180, max: 180, step: 1, hint: "Turns the animal's colour around the colour wheel, in degrees. Find one you like and tell me the number to make it permanent." },
    { key: "shimmer", label: "Shimmer", min: 0, max: 1, step: 0.01, hint: "How much iridescent surfaces roll brighter and darker as the animal turns." },
    { key: "sparkle", label: "Sparkle", min: 0, max: 0.5, step: 0.01, hint: "How often cells flash white, like light catching scales or wings." },
    { key: "fog", label: "Distance fade", min: 0, max: 1, step: 0.01, hint: "How much far-away ones fade into the background." },
    { key: "trail", label: "Trail", min: 0, max: 4, step: 0.05, hint: "How much they leave behind: scales, ripples, footprints or glow." },
    { key: "trailFade", label: "Trail fade", min: 0.05, max: 6, step: 0.05, hint: "How quickly that trail fades. Lower lingers longer." },
    { key: "grid", label: "Grid", min: 0, max: 4, step: 0.05, hint: "How visible the background grid lines are." },
    { key: "detail", label: "ASCII detail", min: 0.5, max: 2, step: 0.05, hint: "ASCII resolution. Higher means smaller characters and finer animals." }
  ]
};
var STARTLE_RADIUS = 240;
var REFERENCE_SIZE = 160;
var Flock = class {
  /** count pins the population, overriding tuning.density. */
  constructor(animal, tuning, count) {
    this.animal = animal;
    this.tuning = tuning;
    this.count = count;
    __publicField(this, "width", 0);
    __publicField(this, "height", 0);
    __publicField(this, "time", 0);
    __publicField(this, "creatures", []);
    __publicField(this, "events", []);
    /** Size of the nearest individuals at size 1, px. */
    __publicField(this, "base", 120);
    /** Scratch acceleration the steering helpers add into. */
    __publicField(this, "acc", { x: 0, y: 0 });
    __publicField(this, "nextId", 1);
  }
  resize(width, height) {
    const first = this.width === 0;
    this.width = width;
    this.height = height;
    this.base = clamp(Math.min(width, height) * 0.2, 80, 190) * this.animal.scale;
    if (first) this.populate(true);
  }
  /** Course in radians (screen space, y down). */
  get course() {
    const k = this.tuning;
    return k.corner ? Math.atan2(-this.height, this.width) : -k.direction * Math.PI / 180;
  }
  /** The course with the whole stream's slow sway applied. */
  get heading() {
    const t = this.time;
    return this.course + this.tuning.sway * (Math.sin(t * 0.13) + 0.5 * Math.sin(t * 0.31 + 1.7));
  }
  /**
   * How many to keep on screen. By how much of the screen they cover, not by raw area: on a small
   * screen each one draws smaller (see base), so more of them spawn to make up for it, and a phone
   * looks as lively as a laptop. `area` is screen area per individual at the reference size.
   */
  get target() {
    const { width: W, height: H, animal } = this;
    const shrink = (this.base / animal.scale / REFERENCE_SIZE) ** 2;
    return this.count ?? clamp(Math.round(W * H / (animal.area * shrink) * this.tuning.density), 1, animal.max ?? 200);
  }
  depthOf(roll) {
    const k = this.tuning;
    return k.farthest + (1 - k.farthest) * Math.pow(roll, k.farBias);
  }
  /** Parallax: far individuals cover less screen per second. */
  cruise(c) {
    return this.animal.speed * (0.55 + 0.45 * c.depth) * this.tuning.speed;
  }
  /** Click: everything nearby reacts, then rejoins the stream (or the animal takes the tap itself). */
  startle(x, y) {
    if (this.animal.tap) {
      this.animal.tap(x, y, this);
      return;
    }
    this.events.push({ x, y, radius: 6, amount: 1.4 });
    for (const c of this.creatures) {
      const dx = c.x - x;
      const dy = c.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > STARTLE_RADIUS) continue;
      const strength = 1 - d / STARTLE_RADIUS;
      if (this.animal.startle) {
        this.animal.startle(c, dx / d, dy / d, strength, this);
      } else {
        const k = strength * 420 * c.depth;
        c.vx += dx / d * k;
        c.vy += dy / d * k;
        c.startledUntil = this.time + rand(0.6, 1.2);
      }
    }
  }
  step(dt) {
    this.time += dt;
    this.populate(false);
    for (const c of this.creatures) {
      c.depth = this.depthOf(c.roll);
      c.span = this.base * c.depth * this.tuning.size;
    }
    this.animal.prepare?.(this, dt);
    for (const c of this.creatures) this.animal.update(c, this, dt);
  }
  /** Add or remove individuals until the population matches the tuning. */
  populate(scatter) {
    const target = this.target;
    while (this.creatures.length > target) {
      const [c] = this.creatures.splice(Math.floor(Math.random() * this.creatures.length), 1);
      c.gone = true;
    }
    while (this.creatures.length < target) {
      const c = this.spawn();
      if (scatter || Math.random() < 0.5) {
        c.x = rand(0, this.width);
        c.y = rand(0, this.height);
        this.animal.enter?.(c, this);
      }
      this.insert(c);
    }
  }
  /** Keep farther individuals first so the near ones draw over them. */
  insert(c) {
    const at5 = this.creatures.findIndex((o) => o.roll > c.roll);
    this.creatures.splice(at5 < 0 ? this.creatures.length : at5, 0, c);
  }
  spawn() {
    const base = {
      id: this.nextId++,
      roll: Math.random(),
      depth: 1,
      span: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      heading: 0,
      bias: 0,
      startledUntil: 0,
      gone: false
    };
    base.depth = this.depthOf(base.roll);
    base.span = this.base * base.depth * this.tuning.size;
    const c = this.animal.create(base, this);
    this.reenter(c);
    return c;
  }
  /** Bring a creature back in from the upstream edges, spread evenly across the flow. */
  reenter(c) {
    const { width: W, height: H, course } = this;
    const m = c.span * 0.6;
    const cos = Math.cos(course);
    const sin = Math.sin(course);
    const sideways = H * Math.abs(cos);
    const vertical = W * Math.abs(sin);
    if (Math.random() * (sideways + vertical) < sideways) {
      c.x = cos >= 0 ? -m : W + m;
      c.y = rand(0, H);
    } else {
      c.x = rand(0, W);
      c.y = sin <= 0 ? H + m : -m;
    }
    const cruise = this.cruise(c);
    c.heading = course;
    c.vx = cos * cruise;
    c.vy = sin * cruise;
    c.bias = rand(-1, 1);
    this.animal.enter?.(c, this);
  }
  /** Past the downstream edges (done crossing), or lost far off any edge. */
  passed(c, margin = c.span) {
    const { width: W, height: H, course } = this;
    const cos = Math.cos(course);
    const sin = Math.sin(course);
    const out = cos > 0.05 && c.x > W + margin || cos < -0.05 && c.x < -margin || sin < -0.05 && c.y < -margin || sin > 0.05 && c.y > H + margin;
    const lost = c.x < -3 * margin || c.x > W + 3 * margin || c.y < -3 * margin || c.y > H + 3 * margin;
    return out || lost;
  }
  // ── steering helpers: each adds into this.acc ─────────────────────
  /** Clear the scratch acceleration. */
  begin() {
    this.acc.x = 0;
    this.acc.y = 0;
    return this.acc;
  }
  /** Pull the velocity toward `speed` along `dir`, as hard as `grip`. */
  steer(c, dir, speed, grip) {
    this.acc.x += (Math.cos(dir) * speed - c.vx) * grip;
    this.acc.y += (Math.sin(dir) * speed - c.vy) * grip;
  }
  /** Push away from neighbours at about the same depth, within `range` × their combined size. */
  separate(c, strength = this.tuning.separation, range = 0.42) {
    if (strength <= 0) return;
    for (const o of this.creatures) {
      if (o === c || Math.abs(o.depth - c.depth) > 0.18) continue;
      const ox = c.x - o.x;
      const oy = c.y - o.y;
      const d = Math.hypot(ox, oy);
      const r = (c.span + o.span) * range;
      if (d < r && d > 1e-3) {
        const w = (1 - d / r) * strength;
        this.acc.x += ox / d * w;
        this.acc.y += oy / d * w;
      }
    }
  }
  /** Apply this.acc, cap the speed (startled creatures may go faster), move. Returns the speed. */
  move(c, dt, max) {
    c.vx += this.acc.x * dt;
    c.vy += this.acc.y * dt;
    let speed = Math.hypot(c.vx, c.vy);
    const cap = max + (this.time < c.startledUntil ? 300 : 0);
    if (speed > cap) {
      c.vx *= cap / speed;
      c.vy *= cap / speed;
      speed = cap;
    }
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    return speed;
  }
  /** Turn to face the direction of travel, at most `rate` rad/s. */
  face(c, dt, rate = 7, angle = Math.atan2(c.vy, c.vx)) {
    const turn = rate * dt;
    c.heading += clamp(angleDiff(c.heading, angle), -turn, turn);
  }
};

// src/ink.ts
var INK_SCALE = 0;
var INK_DARK = 1;
var INK_SPOT = 2;
var INK_SHIMMER = 3;
var INK_GLASS = 4;
var INK_GLOW = 5;
var INK_BODY = 6;
var INK_LIT = 7;
function ink(out, r, g, b, kind = INK_SCALE, glyphs = null) {
  out.r = r;
  out.g = g;
  out.b = b;
  out.kind = kind;
  out.glyphs = glyphs;
  return true;
}

// src/animals/butterflies.ts
var FORE = { from: -0.3, to: 1, reach: 0.56, peak: 0.55, round: 0.5, scallop: 0 };
var HIND = { from: -1.45, to: 0.15, reach: 0.44, peak: 0.48, round: 0.42, scallop: 0.04 };
var FORE_ROOT = 0.06;
var HIND_ROOT = -0.02;
var BODY = [30, 30, 42];
var FLAP_HZ = 2.6;
var GLIDE = 0.35;
var FLUTTER = 1.3;
function lobeReach(l, phi, t = (phi - l.from) / (l.to - l.from)) {
  if (t <= 0 || t >= 1) return 0;
  const s = t < l.peak ? t / l.peak * 0.5 : 0.5 + (t - l.peak) / (1 - l.peak) * 0.5;
  const R = l.reach * Math.pow(Math.sin(Math.PI * s), l.round);
  return l.scallop ? R * (1 - l.scallop * (0.5 + 0.5 * Math.cos(t * Math.PI * 14))) : R;
}
function bodyHalfWidth(u) {
  if (u > 0.17 || u < -0.32) return 0;
  if (u > 0.11) return Math.sqrt(Math.max(0, 0.03 * 0.03 - (u - 0.14) ** 2));
  if (u > -0.04) return 0.034;
  return 0.03 * (1 - 0.6 * ((-0.04 - u) / 0.28));
}
var lobe = { t: 0, r: 0 };
function inLobe(l, du, vw) {
  const phi = Math.atan2(du, vw);
  const t = (phi - l.from) / (l.to - l.from);
  const R = lobeReach(l, phi, t);
  const r = Math.hypot(du, vw);
  if (r > R) return false;
  lobe.t = t;
  lobe.r = r / R;
  return true;
}
var DEFAULTS = {
  ...SHARED_TUNING,
  density: 1.05,
  speed: 1.05,
  sway: 0,
  spread: 0,
  size: 1.25,
  farthest: 0.18,
  farBias: 1.7,
  grip: 5,
  separation: 700,
  trail: 1.55,
  trailFade: 0.15,
  flutter: 0,
  glide: 2.75,
  flapRate: 1
};
var butterflies = {
  key: "butterflies",
  label: "Butterfly",
  swatch: [50, 135, 255],
  defaults: DEFAULTS,
  controls: [
    ["Flight", [
      { key: "flutter", label: "Flutter", min: 0, max: 3, step: 0.05, hint: "How much their path zigzags." },
      { key: "glide", label: "Glide", min: 0, max: 4, step: 0.05, hint: "How often they stop flapping and glide with wings held flat." },
      { key: "flapRate", label: "Flap rate", min: 0.2, max: 3, step: 0.05, hint: "How fast their wings beat." }
    ]]
  ],
  area: 48e3,
  scale: 1,
  speed: 90,
  trail: { light: [70, 118, 226], dark: [96, 156, 255] },
  create: (c) => ({ ...c, phase: rand(0, TAU), open: 1, glide: 0, glideUntil: 0, flutterX: 0, flutterY: 0 }),
  enter(b) {
    b.flutterX = 0;
    b.flutterY = 0;
  },
  update(b, flock, dt) {
    const k = flock.tuning;
    const t = flock.time;
    const cruise = flock.cruise(b);
    const acc = flock.begin();
    flock.steer(b, flock.heading + b.bias * k.spread, cruise, k.grip);
    const kick = Math.sqrt(dt) * 520 * FLUTTER * k.flutter * (1 - 0.8 * b.glide) * (0.5 + 0.5 * b.depth);
    b.flutterX += -b.flutterX * 3 * dt + (Math.random() * 2 - 1) * kick;
    b.flutterY += -b.flutterY * 3 * dt + (Math.random() * 2 - 1) * kick;
    acc.x += b.flutterX;
    acc.y += b.flutterY;
    const down = Math.max(0, -Math.sin(b.phase)) * (1 - b.glide);
    acc.x += Math.cos(b.heading) * down * cruise * 1.4;
    acc.y += Math.sin(b.heading) * down * cruise * 1.4;
    flock.separate(b);
    const speed = flock.move(b, dt, cruise * 2.2);
    if (flock.passed(b)) flock.reenter(b);
    if (speed > 12) flock.face(b, dt);
    if (b.glide < 0.5 && t > b.glideUntil && speed > cruise * 0.5 && Math.random() < GLIDE * k.glide * dt) {
      b.glideUntil = t + rand(0.5, 1.4);
    }
    b.glide += ((t < b.glideUntil ? 1 : 0) - b.glide) * Math.min(1, dt * 6);
    const urgency = clamp(speed / (cruise * 2), 0, 1);
    b.phase += dt * TAU * FLAP_HZ * k.flapRate * (0.8 + 0.6 * urgency) * (1 - 0.9 * b.glide);
    const beat = Math.pow(0.5 + 0.5 * Math.cos(b.phase), 0.8);
    b.open = 0.1 + 0.9 * (beat * (1 - b.glide) + 0.96 * b.glide);
  },
  startle(b, dx, dy, strength, flock) {
    const k = strength * 420 * b.depth;
    b.vx += dx * k;
    b.vy += dy * k;
    b.startledUntil = flock.time + rand(0.6, 1.2);
    b.glideUntil = 0;
  },
  draw(b, pen) {
    const S = b.span;
    const open = Math.max(0.08, b.open);
    const ink$ = pen.ink;
    const pose = { x: b.x, y: b.y, heading: b.heading + 0.06 * Math.sin(b.phase), span: S, depth: b.depth, id: b.id };
    const minBody = pen.cw * 0.4;
    pen.shape(pose, 0.75, (u, v) => {
      const av = Math.abs(v);
      const bw = bodyHalfWidth(u);
      if (bw > 0 && av * S <= Math.max(bw * S, minBody)) {
        ink(ink$, ...BODY, INK_BODY);
        return true;
      }
      const vw = av / open;
      let part;
      if (inLobe(FORE, u - FORE_ROOT, vw)) part = 0;
      else if (inLobe(HIND, u - HIND_ROOT, vw)) part = 1;
      else return false;
      const { t, r } = lobe;
      if (r > 0.86) {
        if (part === 0 && r < 0.95 && Math.abs(frac(t * 5) - 0.5) < 0.14) ink(ink$, 236, 240, 255, INK_SPOT);
        else ink(ink$, 22, 28, 62, INK_DARK);
      } else if (r < 0.08) ink(ink$, 26, 44, 110, INK_DARK);
      else if (part === 0 && t > 0.9) ink(ink$, 30, 50, 120, INK_DARK);
      else ink(ink$, 50 + 70 * r, 135 + 60 * r, 255, INK_SHIMMER);
      return true;
    }, { light: 0.6 + 0.4 * b.open, tilt: b.open * 3 });
    const sway = 0.012 * Math.sin(pen.t * 3 + b.id);
    for (const side of [-1, 1]) {
      pen.lineBody(pose, 0.16, 0.012 * side, 0.37 + sway, (0.12 + sway) * side, pen.contrast, S > 120 ? "o" : void 0);
    }
    const stroke2 = Math.max(0, -Math.sin(b.phase)) * (1 - b.glide);
    const phi = FORE.from + (FORE.to - FORE.from) * FORE.peak;
    const tipU = FORE_ROOT + Math.sin(phi) * FORE.reach * 0.95;
    const tipV = Math.cos(phi) * FORE.reach * 0.95 * b.open;
    const at5 = { x: 0, y: 0 };
    for (const side of [-1, 1]) {
      pen.toWorld(pose, tipU, tipV * side, at5);
      pen.shed(at5.x, at5.y, (0.02 + 0.1 * stroke2) * b.depth);
    }
  }
};

// src/animals/shapes.ts
var seg = { t: 0 };
function toSegment(px, py, ax, ay, bx, by) {
  const sx = bx - ax;
  const sy = by - ay;
  const t = clamp(((px - ax) * sx + (py - ay) * sy) / (sx * sx + sy * sy || 1), 0, 1);
  seg.t = t;
  return Math.hypot(px - ax - sx * t, py - ay - sy * t);
}
function inEllipse(u, v, cu, cv, a, b) {
  const x = (u - cu) / a;
  const y = (v - cv) / b;
  return x * x + y * y <= 1;
}
function spotted(u, v, cell, radius, seed) {
  const gu = u / cell;
  const gv = v / cell;
  const cu = Math.floor(gu);
  const cv = Math.floor(gv);
  const jx = 0.25 + 0.5 * hash3(cu, cv, seed);
  const jy = 0.25 + 0.5 * hash3(cu, cv, seed + 11);
  const r = radius / cell * (0.6 + 0.6 * hash3(cu, cv, seed + 23));
  return (gu - cu - jx) ** 2 + (gv - cv - jy) ** 2 < r * r;
}

// src/animals/crabs.ts
var EYE = [14, 10, 10];
var GLINT = [255, 252, 246];
var DEFAULTS2 = {
  ...SHARED_TUNING,
  detail: 1.7,
  fog: 0.12,
  density: 1.8,
  sway: 0,
  spread: 0,
  farthest: 0.25,
  farBias: 0.7,
  grip: 3,
  separation: 400,
  trail: 1.2,
  trailFade: 0.35,
  shimmer: 0.1,
  sparkle: 0.03,
  burst: 1,
  rest: 1,
  legSpeed: 1,
  scare: 0.55
};
var SHELL = [204, 82, 52];
var PALE = [232, 132, 92];
var FLECK = [140, 46, 32];
var CLAW = [214, 92, 56];
var TIP = [60, 30, 30];
var LEG = [186, 72, 44];
var HIPS = [0.07, -0.01, -0.08, -0.14];
var crabs = {
  key: "crabs",
  label: "Crab",
  swatch: [204, 82, 52],
  defaults: DEFAULTS2,
  controls: [
    ["Scuttling", [
      { key: "burst", label: "Burst length", min: 0.2, max: 4, step: 0.05, hint: "How long each scuttle lasts." },
      { key: "rest", label: "Pause length", min: 0, max: 4, step: 0.05, hint: "How long they pause between scuttles. 0 means they never stop." },
      { key: "legSpeed", label: "Leg speed", min: 0.2, max: 3, step: 0.05, hint: "How fast the legs step." },
      { key: "scare", label: "Scare", min: 0, max: 3, step: 0.05, hint: "How fast and far crabs bolt away when you tap near them." }
    ]]
  ],
  area: 7e4,
  scale: 0.8,
  speed: 95,
  trail: { light: [176, 146, 104], dark: [206, 178, 136] },
  create: (c) => ({ ...c, running: true, until: 0, facing: Math.random() < 0.5 ? 1 : -1, gait: rand(0, TAU), alarm: 0, fleeDir: 0, fleeSpeed: 0, fleeFrom: 0 }),
  enter(c, flock) {
    c.running = true;
    c.until = flock.time + rand(0.3, 1.2);
    c.heading = flock.course - c.facing * Math.PI / 2;
  },
  update(c, flock, dt) {
    const k = flock.tuning;
    const t = flock.time;
    if (t >= c.until) {
      c.running = !c.running || k.rest <= 0;
      c.until = t + (c.running ? rand(0.5, 1.6) * k.burst : rand(0.3, 1.4) * k.rest);
    }
    const cruise = flock.cruise(c);
    const course = flock.heading + c.bias * k.spread;
    const fleeing = t < c.startledUntil;
    const calm = fleeing ? (t - c.fleeFrom) / (c.startledUntil - c.fleeFrom) : 1;
    const walk = fleeing ? c.fleeDir : course;
    flock.begin();
    if (fleeing) flock.steer(c, c.fleeDir, Math.max(cruise, c.fleeSpeed * (1 - calm * calm)), 8);
    else flock.steer(c, course, c.running ? cruise : 0, k.grip * 2);
    flock.separate(c);
    const speed = flock.move(c, dt, fleeing ? Math.max(cruise * 2, c.fleeSpeed) : cruise * 2);
    if (flock.passed(c)) flock.reenter(c);
    const side = fleeing && Math.abs(angleDiff(c.heading + c.facing * Math.PI / 2, walk)) > Math.PI / 2 ? -c.facing : c.facing;
    const want = walk - side * Math.PI / 2;
    const turn = (fleeing ? 10 : 3) * dt;
    c.heading += Math.max(-turn, Math.min(turn, angleDiff(c.heading, want)));
    c.gait += dt * speed * k.legSpeed / Math.max(4, c.span * 0.09);
    c.alarm = Math.max(0, c.alarm - dt * 0.7);
  },
  startle(c, dx, dy, strength, flock) {
    const k = flock.tuning;
    if (k.scare <= 0) return;
    c.fleeDir = Math.atan2(dy, dx) + rand(-0.35, 0.35);
    c.fleeSpeed = flock.cruise(c) * (2.5 + 3 * strength) * k.scare;
    c.fleeFrom = flock.time;
    c.startledUntil = flock.time + (1 + 1.5 * strength) * Math.sqrt(k.scare);
    c.vx = Math.cos(c.fleeDir) * c.fleeSpeed;
    c.vy = Math.sin(c.fleeDir) * c.fleeSpeed;
    c.running = true;
    c.until = c.startledUntil + rand(0.3, 1);
    c.alarm = 1;
  },
  draw(c, pen) {
    const S = c.span;
    const out = pen.ink;
    const pose = { x: c.x, y: c.y, heading: c.heading, span: S, depth: c.depth, id: c.id };
    const at5 = { x: 0, y: 0 };
    for (const side of [-1, 1]) {
      HIPS.forEach((hu, i) => {
        const ph = c.gait + i * Math.PI * 0.5 + (side > 0 ? Math.PI : 0);
        const lift = Math.max(0, Math.sin(ph));
        const reach = 0.04 * Math.cos(ph);
        const splay = (i - 1.5) * 0.06;
        const kneeU = hu + splay * 0.6;
        const kneeV = (0.36 - 0.03 * lift) * side;
        const tipU = hu + splay * 1.4 + reach;
        const tipV = (0.52 + 0.03 * Math.cos(ph) - 0.06 * lift) * side;
        pen.lineBody(pose, hu, 0.22 * side, kneeU, kneeV, LEG);
        pen.lineBody(pose, kneeU, kneeV, tipU, tipV, LEG);
        if (lift < 0.05 && Math.cos(ph) > 0.9) {
          pen.toWorld(pose, tipU, tipV, at5);
          pen.shed(at5.x, at5.y, 0.12 * c.depth);
        }
      });
    }
    const raise = c.alarm;
    pen.shape(pose, 0.62, (u, v) => {
      const av = Math.abs(v);
      const su = Math.abs(u / 0.17);
      const sv = av / 0.27;
      const teeth = u > 0.06 ? 0.06 * (0.5 + 0.5 * Math.cos(sv * Math.PI * 7)) : 0;
      if (Math.pow(su, 2.2) + Math.pow(sv, 2.4) <= 1 - teeth) {
        if (spotted(u, v, 0.05, 0.012, c.id)) return ink(out, ...FLECK, INK_DARK);
        if (Math.abs(av - 0.08) < 0.01 && u > -0.08 && u < 0.05) return ink(out, ...FLECK, INK_DARK, "|");
        return inEllipse(u, av, 0.01, 0, 0.1, 0.13) ? ink(out, ...PALE) : ink(out, ...SHELL);
      }
      const armU = 0.26 + 0.07 * raise;
      const armV = 0.25 + 0.05 * raise;
      if (toSegment(u, av, 0.12, 0.17, armU, armV) < 0.034) return ink(out, ...CLAW, INK_SCALE);
      const cu = 0.34 + 0.08 * raise;
      const cv = 0.19 + 0.04 * raise;
      const size = 1 + 0.15 * raise;
      const ang = 0.55;
      const lx = ((u - cu) * Math.cos(ang) - (av - cv) * Math.sin(ang)) / size;
      const ly = ((u - cu) * Math.sin(ang) + (av - cv) * Math.cos(ang)) / size;
      if ((lx / 0.09) ** 2 + (ly / 0.055) ** 2 <= 1) {
        const gap = 0.15 + 0.55 * raise;
        if (lx > 0.02 && Math.abs(ly) < gap * (lx - 0.02)) return false;
        return lx > 0.06 ? ink(out, ...TIP, INK_DARK) : ink(out, ...CLAW, INK_SCALE);
      }
      return false;
    });
    const eyeV = Math.min(0.14, Math.max(0.06, pen.cw * 0.55 / S));
    for (const side of [-1, 1]) {
      pen.toWorld(pose, 0.2, eyeV * side, at5);
      pen.spot(at5.x, at5.y, "\u25CF", GLINT, EYE, c.depth);
    }
  }
};

// src/animals/cranes.ts
var DEFAULTS3 = {
  ...SHARED_TUNING,
  detail: 1.7,
  density: 0.8,
  speed: 1.5,
  sway: 0,
  spread: 0,
  farthest: 0.35,
  farBias: 1.3,
  grip: 3,
  separation: 150,
  trail: 0,
  shimmer: 0.1,
  sparkle: 0.04,
  wingbeat: 1,
  glide: 1,
  foldFlap: false
};
var ROOT = 0.045;
var WRIST = 0.25;
var TIP2 = 0.5;
var WHITE = [236, 238, 242];
var BLACK = [32, 32, 38];
var NECK = [78, 78, 92];
var CROWN = [226, 36, 36];
var EYE2 = [14, 12, 16];
var GLINT2 = [255, 252, 246];
var BILL = [196, 196, 150];
var LEGS = [60, 60, 66];
var at = { x: 0, y: 0 };
var wing = { s: 0, q: 0 };
function onWing(u, vw) {
  if (vw < ROOT || vw > TIP2) return false;
  const s = (vw - ROOT) / (TIP2 - ROOT);
  const le = 0.12 + 0.03 * s - 0.09 * s * s;
  let te0 = (-0.075 + 0.03 * s) * 1.2;
  if (s < 0.78) te0 += 0.012 * (0.5 + 0.5 * Math.cos(s * TAU * 9));
  const te = s > 0.72 ? lerp(te0, le - 0.015, Math.pow((s - 0.72) / 0.28, 1.4)) : te0;
  if (u > le || u < te) return false;
  const q = (u - te) / (le - te);
  if (s > 0.78 && q < 0.92 && frac(q * 6) < 0.24) return false;
  wing.s = s;
  wing.q = q;
  return true;
}
var stroke = {
  /** Arm and hand foreshortening across the body (1 flat, smaller raised or lowered). */
  arm: 1,
  hand: 1,
  /** How far the hand sweeps back at the wrist, radians (negative reaches forward). */
  sweep: 0,
  /** Body lift (draws a touch bigger), 0–1. */
  lift: 0
};
var DOWN = 0.6;
var UP_ANGLE = 0.85;
var DOWN_ANGLE = -0.6;
function evenStroke(c) {
  const beat = Math.pow(0.5 + 0.5 * Math.cos(c.phase), 0.8);
  const open = Math.max(0.12, 0.25 + 0.75 * (beat * (1 - c.glide) + c.glide));
  stroke.arm = open;
  stroke.hand = open;
  stroke.sweep = 0;
  stroke.lift = 0;
}
function foldingStroke(c) {
  const p = frac(c.phase / TAU);
  const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);
  let elev;
  let sweep;
  let handRaise;
  if (p < DOWN) {
    const x = p / DOWN;
    elev = lerp(UP_ANGLE, DOWN_ANGLE, ease(x));
    sweep = -0.12 * Math.sin(Math.PI * x);
    handRaise = 0;
    stroke.lift = Math.sin(Math.PI * x);
  } else {
    const x = (p - DOWN) / (1 - DOWN);
    elev = lerp(DOWN_ANGLE, UP_ANGLE, ease(x));
    sweep = 1.05 * Math.sin(Math.PI * x);
    handRaise = 0.45 * Math.sin(Math.PI * x);
    stroke.lift = 0;
  }
  const g = c.glide;
  elev = lerp(elev, 0.1, g);
  stroke.sweep = lerp(sweep, 0, g);
  stroke.arm = Math.cos(elev);
  stroke.hand = Math.max(0.2, Math.cos(elev + Math.sign(elev || 1) * handRaise * (1 - g)));
  stroke.lift *= 1 - g;
}
var flat = { u: 0, v: 0 };
function unfold(u, av) {
  const wristV = ROOT + (WRIST - ROOT) * stroke.arm;
  const pu = 0.03;
  const du = u - pu;
  const dv = av - wristV;
  const cs = Math.cos(stroke.sweep);
  const sn = Math.sin(stroke.sweep);
  const dv0 = -du * sn + dv * cs;
  if (av <= wristV || dv0 < 0) {
    flat.u = u;
    flat.v = ROOT + (av - ROOT) / stroke.arm;
  } else {
    flat.u = pu + du * cs + dv * sn;
    flat.v = WRIST + dv0 / stroke.hand;
  }
  return flat;
}
var cranes = {
  key: "cranes",
  label: "Crane",
  swatch: [214, 220, 238],
  defaults: DEFAULTS3,
  controls: [
    ["Flight", [
      { key: "wingbeat", label: "Wingbeat", min: 0.3, max: 2.5, step: 0.05, hint: "How fast they flap." },
      { key: "glide", label: "Glide", min: 0, max: 4, step: 0.05, hint: "How often they stop flapping and glide." },
      { key: "foldFlap", label: "Folding flap", toggle: true, hint: "Off: the wings open and close evenly from the body. On: a slow downstroke and a quick upstroke that folds the wings back at the wrist." }
    ]]
  ],
  area: 55e3,
  scale: 1.45,
  speed: 85,
  trail: { light: [150, 152, 170], dark: [200, 204, 226] },
  create: (c) => ({ ...c, phase: rand(0, TAU), pace: 0.8 + 0.4 * hash3(c.id, 5, 9), glide: 0, glideUntil: 0 }),
  update(c, flock, dt) {
    const k = flock.tuning;
    const t = flock.time;
    const cruise = flock.cruise(c);
    const course = flock.heading + c.bias * k.spread;
    flock.begin();
    flock.steer(c, course, cruise, k.grip);
    flock.separate(c, k.separation, 0.45);
    flock.move(c, dt, cruise * 1.6);
    if (flock.passed(c)) flock.reenter(c);
    flock.face(c, dt, 2, course);
    if (c.glide < 0.5 && t > c.glideUntil && Math.random() < 0.25 * k.glide * dt) c.glideUntil = t + rand(1, 2.5);
    c.glide += ((t < c.glideUntil ? 1 : 0) - c.glide) * Math.min(1, dt * 3);
    c.phase += dt * TAU * 1.25 * k.wingbeat * c.pace * (1 - 0.92 * c.glide);
  },
  draw(c, pen, flock) {
    if (flock.tuning.foldFlap) foldingStroke(c);
    else evenStroke(c);
    const S = c.span * (1 + 0.025 * stroke.lift);
    const out = pen.ink;
    const pose = { x: c.x, y: c.y, heading: c.heading, span: S, depth: c.depth, id: c.id };
    const neckW = Math.max(0.018, pen.cw * 0.45 / S);
    const headR = Math.max(0.032, pen.cw * 0.6 / S);
    for (const side of [-1, 1]) pen.lineBody(pose, -0.2, 0.014 * side, -0.62, 0.022 * side, LEGS);
    pen.lineBody(pose, 0.47, 0, 0.6, 0, BILL);
    pen.shape(pose, 0.66, (u, v) => {
      const av = Math.abs(v);
      if (Math.hypot(u - 0.44, av) < headR) return ink(out, ...BLACK, INK_DARK);
      if (u > 0.12 && u < 0.43 && av < neckW) return u > 0.28 ? ink(out, ...NECK, INK_DARK) : ink(out, ...WHITE);
      if (inEllipse(u, av, -0.19, 0, 0.08, 0.045 + 0.4 * Math.max(0, -0.12 - u) ** 1.2)) return ink(out, ...WHITE);
      if (inEllipse(u, av, 0, 0, 0.16, 0.055)) return ink(out, ...WHITE);
      if (av <= ROOT) return false;
      const { u: fu, v: fv } = unfold(u, av);
      if (!onWing(fu, fv)) return false;
      if (wing.q < 0.42 && wing.s < 0.7) return ink(out, ...BLACK, INK_DARK);
      const k = 0.9 + 0.1 * wing.q;
      return ink(out, WHITE[0] * k, WHITE[1] * k, WHITE[2] * k, INK_SCALE);
    }, { light: 0.82 + 0.18 * stroke.arm });
    pen.toWorld(pose, 0.445, 0, at);
    pen.spot(at.x, at.y, "@", [255, 214, 200], CROWN, c.depth);
    if (0.064 * S >= pen.cw * 1.2) {
      const eyeV = Math.max(0.032, pen.cw / S);
      for (const side of [-1, 1]) {
        pen.toWorld(pose, 0.44, eyeV * side, at);
        pen.spot(at.x, at.y, "\u25CF", GLINT2, EYE2, c.depth);
      }
    }
  }
};

// src/renderer.ts
var ALPHA_LEVELS = 6;
var PALETTES = {
  light: { background: [246, 243, 236], grid: [30, 34, 60, 0.07], trailAlpha: 0.7, ink: [42, 42, 59] },
  dark: { background: [6, 7, 12], grid: [255, 255, 255, 0.055], trailAlpha: 0.85, ink: [150, 160, 200] }
};
var SCALE_RAMP = ".:;+=*%#";
var DARK_GLYPHS = "#%@";
var SPOT_GLYPHS = "o*";
var BODY_GLYPHS = "8#@";
var GLOW_RAMP = ".:+*";
var EDGE_HEAVY = ":;";
var EDGE_LIGHT = ".',`";
var SPARKLES = [[255, 255, 255], [228, 246, 255], [200, 244, 255]];
var CELL_NONE = 0;
var CELL_SOLID = 1;
var CELL_SOFT = 2;
var SUBSAMPLES = [0.25, 0.3, 0.75, 0.3, 0.25, 0.72, 0.75, 0.72];
function hueMatrix(degrees) {
  const a = Math.cos(degrees * Math.PI / 180);
  const s = Math.sin(degrees * Math.PI / 180);
  return [
    0.213 + a * 0.787 - s * 0.213,
    0.715 - a * 0.715 - s * 0.715,
    0.072 - a * 0.072 + s * 0.928,
    0.213 - a * 0.213 + s * 0.143,
    0.715 + a * 0.285 + s * 0.14,
    0.072 - a * 0.072 - s * 0.283,
    0.213 - a * 0.213 - s * 0.787,
    0.715 - a * 0.715 + s * 0.715,
    0.072 + a * 0.928 + s * 0.072
  ];
}
function paintGrid(g, W, H, cw, ch, dpr, stroke2 = "rgba(30,34,60,0.07)") {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.strokeStyle = stroke2;
  g.lineWidth = 1;
  g.beginPath();
  for (let c = 0; c <= Math.ceil(W / cw); c++) {
    const x = Math.round(c * cw * dpr) + 0.5;
    g.moveTo(x, 0);
    g.lineTo(x, H * dpr);
  }
  for (let r = 0; r <= Math.ceil(H / ch); r++) {
    const y = Math.round(r * ch * dpr) + 0.5;
    g.moveTo(0, y);
    g.lineTo(W * dpr, y);
  }
  g.stroke();
}
var rgb = (r, g, b) => `rgb(${clamp(Math.round(r), 0, 255)},${clamp(Math.round(g), 0, 255)},${clamp(Math.round(b), 0, 255)})`;
var pack = (r, g, b) => clamp(Math.round(r), 0, 255) << 16 | clamp(Math.round(g), 0, 255) << 8 | clamp(Math.round(b), 0, 255);
function lineGlyph(angle) {
  let a = angle % Math.PI;
  if (a < 0) a += Math.PI;
  return a < Math.PI / 8 || a >= 7 * Math.PI / 8 ? "-" : a < 3 * Math.PI / 8 ? "\\" : a < 5 * Math.PI / 8 ? "|" : "/";
}
var Pen = class {
  constructor(r) {
    this.r = r;
    /** The sampler's output; preset to defaults before every sample. */
    __publicField(this, "ink", { r: 0, g: 0, b: 0, kind: 0, glyphs: null, au: 0, av: 0 });
    __publicField(this, "t", 0);
    __publicField(this, "theme", "light");
    __publicField(this, "a", { x: 0, y: 0 });
    __publicField(this, "b", { x: 0, y: 0 });
  }
  get cw() {
    return this.r.cw;
  }
  get ch() {
    return this.r.ch;
  }
  get cols() {
    return this.r.cols;
  }
  get rows() {
    return this.r.rows;
  }
  /** A colour that reads against the background: dark on paper, pale on ink. */
  get contrast() {
    return this.r.palette.ink;
  }
  /** Body coordinates → screen px. */
  toWorld(p, u, v, out) {
    const c = Math.cos(p.heading);
    const s = Math.sin(p.heading);
    out.x = p.x + (u * c - v * s) * p.span;
    out.y = p.y + (u * s + v * c) * p.span;
    return out;
  }
  /** Default fade for something at this depth. */
  fogFor(depth) {
    return (1 - depth) * this.r.tuning.fog;
  }
  /** Rasterise a silhouette within `reach` (fraction of span) of the pose. */
  shape(p, reach, sample, opts = {}) {
    this.r.shape(p, reach, sample, opts);
  }
  /** A line of glyphs from (x0, y0) to (x1, y1) in px, faded by depth (or by `fog`), optionally ending in `tip`. */
  line(x0, y0, x1, y1, color, depth, tip, fog = this.fogFor(depth)) {
    this.r.line(x0, y0, x1, y1, color, fog, tip);
  }
  /** A line in body coordinates. */
  lineBody(p, u0, v0, u1, v1, color, tip) {
    const a = this.toWorld(p, u0, v0, this.a);
    const b = this.toWorld(p, u1, v1, this.b);
    this.r.line(a.x, a.y, b.x, b.y, color, this.fogFor(p.depth), tip);
  }
  /** A single glyph at (x, y) px, faded by depth (or by `fog` if given). Soft dots never cover solid cells. */
  dot(x, y, glyph, color, depth, fog = this.fogFor(depth)) {
    this.r.dot(x, y, glyph, color, fog);
  }
  /**
   * Exactly one solid cell at (x, y) px: a block of `fill` with `glyph` in `color`, over whatever is
   * there. For small features that must look the same however the animal turns, like a pair of eyes.
   */
  spot(x, y, glyph, color, fill, depth) {
    this.r.spot(x, y, glyph, color, fill, this.fogFor(depth));
  }
  /** Leave something in the trail at (x, y), scaled by the trail knob. */
  shed(x, y, amount) {
    this.r.shed(x, y, amount);
  }
  /** Cell index under (x, y), or -1 off screen. */
  cellIndex(x, y) {
    return this.r.cellIndex(x, y);
  }
};
var AsciiRenderer = class {
  constructor(canvas, tuning) {
    this.canvas = canvas;
    this.tuning = tuning;
    __publicField(this, "cw", 12);
    __publicField(this, "ch", 18);
    __publicField(this, "cols", 0);
    __publicField(this, "rows", 0);
    __publicField(this, "palette", PALETTES.light);
    __publicField(this, "pen", new Pen(this));
    __publicField(this, "ctx");
    __publicField(this, "bg");
    __publicField(this, "dpr", 1);
    __publicField(this, "width", 0);
    __publicField(this, "height", 0);
    __publicField(this, "fontFamily", "ui-monospace, Menlo, monospace");
    __publicField(this, "theme", "light");
    /** pagosYa: a background other than the theme's (the login's deep-blue pond); animals still fade into it. */
    __publicField(this, "background", null);
    __publicField(this, "animal", null);
    __publicField(this, "energy", new Float32Array(0));
    __publicField(this, "energyTmp", new Float32Array(0));
    __publicField(this, "trailStyles", []);
    __publicField(this, "hue", hueMatrix(0));
    __publicField(this, "hueOn", false);
    __publicField(this, "cellFlag", new Uint8Array(0));
    /** Block colour, packed 0xRRGGBB. */
    __publicField(this, "cellFill", new Uint32Array(0));
    /** Glyph colour, packed 0xRRGGBB. */
    __publicField(this, "cellColor", new Uint32Array(0));
    __publicField(this, "cellGlyph", new Uint16Array(0));
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.bg = document.createElement("canvas");
    this.setTheme("light");
  }
  setFontFamily(family) {
    if (family) this.fontFamily = family;
  }
  setTheme(theme) {
    this.theme = theme;
    this.pen.theme = theme;
    this.palette = this.background ? { ...PALETTES[theme], background: this.background } : PALETTES[theme];
    this.restyle();
  }
  setBackground(background) {
    this.background = background;
    this.setTheme(this.theme);
  }
  /** Switch to another animal and its tuning; the old trail washes away. */
  setAnimal(animal, tuning) {
    this.animal = animal;
    this.tuning = tuning;
    this.energy.fill(0);
    this.restyle();
  }
  /** Rebuild cached colours and the background after a theme, animal, hue or grid change. */
  restyle() {
    const palette = this.palette;
    const base = this.animal?.trail[this.theme] ?? palette.ink;
    this.hue = hueMatrix(this.tuning.hueShift);
    this.hueOn = this.tuning.hueShift % 360 !== 0;
    const [r, g, b] = this.turn(base[0], base[1], base[2]);
    this.trailStyles = [];
    for (let l = 0; l < ALPHA_LEVELS; l++) {
      this.trailStyles.push(`rgba(${r},${g},${b},${(palette.trailAlpha * (l + 1) / ALPHA_LEVELS).toFixed(3)})`);
    }
    this.paintBackground();
  }
  /** Apply the Hue shift knob to a colour. */
  turn(r, g, b) {
    if (!this.hueOn) return [r, g, b];
    const m = this.hue;
    return [m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b];
  }
  /** Blend a colour toward the background by f (0 → colour, 1 → background), packed 0xRRGGBB. */
  fade(r, g, b, f) {
    const [br, bg, bb] = this.palette.background;
    return pack(r + (br - r) * f, g + (bg - g) * f, b + (bb - b) * f);
  }
  resize(width, height, dpr) {
    const prevCols = this.cols;
    const prevRows = this.rows;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.cw = clamp(Math.round(width / 124 / this.tuning.detail), 5, 24);
    this.ch = Math.round(this.cw * 1.45);
    this.cols = Math.ceil(width / this.cw);
    this.rows = Math.ceil(height / this.ch);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.bg.width = this.canvas.width;
    this.bg.height = this.canvas.height;
    const n = this.cols * this.rows;
    if (this.cols !== prevCols || this.rows !== prevRows) {
      this.energy = new Float32Array(n);
      this.energyTmp = new Float32Array(n);
      this.cellFlag = new Uint8Array(n);
      this.cellFill = new Uint32Array(n);
      this.cellColor = new Uint32Array(n);
      this.cellGlyph = new Uint16Array(n);
    }
    this.paintBackground();
  }
  paintBackground() {
    const g = this.bg.getContext("2d");
    if (!g) return;
    const { width: W, height: H, dpr, cw, ch } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = rgb(...this.palette.background);
    g.fillRect(0, 0, W, H);
    const [gr, gg, gb, ga] = this.palette.grid;
    paintGrid(g, W, H, cw, ch, dpr, `rgba(${gr},${gg},${gb},${(ga * this.tuning.grid).toFixed(3)})`);
  }
  render(flock, dt) {
    const { ctx, dpr, cols, ch } = this;
    if (cols === 0) return;
    this.pen.t = flock.time;
    for (const e of flock.events) this.stamp(e.x, e.y, e.radius, e.amount);
    flock.events.length = 0;
    this.diffuse(dt);
    this.cellFlag.fill(CELL_NONE);
    const animal = flock.animal;
    if (animal.drawAll) animal.drawAll(flock, this.pen);
    else if (animal.draw) for (const c of flock.creatures) animal.draw(c, this.pen, flock);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawTrail(flock.time);
    ctx.font = `600 ${Math.round(ch * 0.74)}px ${this.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    this.drawCells();
  }
  // ── trail ───────────────────────────────────────────────────────────
  cellIndex(x, y) {
    const c = Math.floor(x / this.cw);
    const r = Math.floor(y / this.ch);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }
  shed(x, y, amount) {
    const i = this.cellIndex(x, y);
    if (i >= 0) this.energy[i] = Math.min(1.6, this.energy[i] + amount * this.tuning.trail);
  }
  stamp(x, y, radius, amount) {
    const field = this.energy;
    const c0 = Math.floor(x / this.cw);
    const r0 = Math.floor(y / this.ch);
    for (let r = r0 - radius; r <= r0 + radius; r++) {
      for (let c = c0 - radius; c <= c0 + radius; c++) {
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
        const d = Math.hypot(c - c0, (r - r0) * 1.4);
        if (d > radius + 0.5) continue;
        const i = r * this.cols + c;
        field[i] = Math.min(1.6, field[i] + amount * (1 - d / (radius + 1)));
      }
    }
  }
  /** Blur + decay so the trail drifts outward and fades. */
  diffuse(dt) {
    const { cols, rows, energy, energyTmp: tmp } = this;
    const decay = Math.exp(-dt * this.tuning.trailFade);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const l = c > 0 ? energy[i - 1] : energy[i];
        const rt = c < cols - 1 ? energy[i + 1] : energy[i];
        const u = r > 0 ? energy[i - cols] : energy[i];
        const d = r < rows - 1 ? energy[i + cols] : energy[i];
        tmp[i] = (energy[i] * 4 + l + rt + u + d) * 0.125 * decay;
      }
    }
    this.energy = tmp;
    this.energyTmp = energy;
  }
  drawTrail(t) {
    const { ctx, cols, cw, ch, energy, cellFlag } = this;
    const small = Math.max(2, Math.round(cw * 0.19));
    for (let level = 0; level < ALPHA_LEVELS; level++) {
      ctx.fillStyle = this.trailStyles[level];
      for (let i = 0; i < energy.length; i++) {
        const e = energy[i];
        if (e < 0.12 || cellFlag[i] === CELL_SOLID) continue;
        const col = i % cols;
        const row = i / cols | 0;
        const twinkle = 0.75 + 0.25 * Math.sin(t * 5 + hash3(col, row, 3) * 40);
        if (clamp(Math.floor(e * twinkle * 4 * ALPHA_LEVELS) - 1, 0, ALPHA_LEVELS - 1) !== level) continue;
        const size = e > 0.6 ? small + 1 : small;
        ctx.fillRect(Math.round(col * cw + cw * 0.5 - size / 2), Math.round(row * ch + ch * 0.6 - size / 2), size, size);
      }
    }
  }
  // ── drawing into cells ──────────────────────────────────────────────
  /** Run the sampler for one point, with the ink preset to its defaults. */
  probe(sample, p, hc, hs, px, py) {
    const ink2 = this.pen.ink;
    const dx = px - p.x;
    const dy = py - p.y;
    const u = (dx * hc + dy * hs) / p.span;
    const v = (dy * hc - dx * hs) / p.span;
    ink2.glyphs = null;
    ink2.au = u;
    ink2.av = v;
    return sample(u, v, px, py);
  }
  /**
   * Supersample every cell within reach of the pose. Fully covered cells
   * become solid (or glyph-only, for glows); partial cells become soft edge
   * glyphs, which never cover anything solid.
   */
  shape(p, reach, sample, { light = 1, tilt = 0, fog = (1 - p.depth) * this.tuning.fog }) {
    const { cellFlag, cellFill, cellColor, cellGlyph, cw, ch, cols, rows } = this;
    const ink2 = this.pen.ink;
    const t = this.pen.t;
    const { shimmer, sparkle } = this.tuning;
    const S = p.span;
    const hc = Math.cos(p.heading);
    const hs = Math.sin(p.heading);
    const R = reach * S;
    const c0 = Math.max(0, Math.floor((p.x - R) / cw));
    const c1 = Math.min(cols - 1, Math.floor((p.x + R) / cw));
    const r0 = Math.max(0, Math.floor((p.y - R) / ch));
    const r1 = Math.min(rows - 1, Math.floor((p.y + R) / ch));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const x = c * cw;
        const y = r * ch;
        const center = this.probe(sample, p, hc, hs, x + cw / 2, y + ch / 2);
        let hits = center ? 1 : 0;
        let ir = ink2.r;
        let ig = ink2.g;
        let ib = ink2.b;
        const kind = ink2.kind;
        const glyphs = ink2.glyphs;
        const au = ink2.au;
        const av = ink2.av;
        for (let k2 = 0; k2 < SUBSAMPLES.length; k2 += 2) {
          if (this.probe(sample, p, hc, hs, x + SUBSAMPLES[k2] * cw, y + SUBSAMPLES[k2 + 1] * ch)) {
            if (hits === 0) {
              ir = ink2.r;
              ig = ink2.g;
              ib = ink2.b;
            }
            hits++;
          }
        }
        if (hits === 0) continue;
        const coverage = hits / 5;
        const i = r * cols + c;
        const solid = center && coverage >= 0.6;
        if (!solid && cellFlag[i] === CELL_SOLID) continue;
        [ir, ig, ib] = this.turn(ir, ig, ib);
        let k = light * (1 + (hash3(c, r, Math.floor(t * 6)) - 0.5) * 0.06);
        if (solid && kind === INK_SHIMMER) {
          k *= 1 - 0.4 * shimmer + shimmer * Math.sin(t * 2.2 + au * 9 + av * 6 + tilt + p.heading * 2);
        }
        ir *= k;
        ig *= k;
        ib *= k;
        const key = hash3(Math.round(au * S / (cw * 0.9)), Math.round(av * S / (cw * 0.9)), p.id) * 4294967295 >>> 0;
        if (!solid) {
          const set2 = coverage >= 0.5 ? EDGE_HEAVY : EDGE_LIGHT;
          cellFlag[i] = CELL_SOFT;
          cellColor[i] = this.fade(ir, ig, ib, Math.min(1, fog + 0.55 - 0.45 * coverage));
          cellGlyph[i] = set2.charCodeAt((key >>> 8) % set2.length);
          continue;
        }
        if (kind === INK_GLOW) {
          if (cellFlag[i] === CELL_SOLID) continue;
          const lum = (0.3 * ir + 0.59 * ig + 0.11 * ib) / 255;
          const set2 = glyphs ?? GLOW_RAMP;
          cellFlag[i] = CELL_SOFT;
          cellColor[i] = this.fade(ir, ig, ib, fog);
          cellGlyph[i] = set2.charCodeAt(glyphs ? (key >>> 8) % set2.length : clamp(Math.floor(lum * set2.length), 0, set2.length - 1));
          continue;
        }
        cellFlag[i] = CELL_SOLID;
        const roll = hash3(key, Math.floor(t * 2.4 + key % 997 / 97), 7);
        let set;
        let gr;
        let gg;
        let gb;
        if (kind === INK_GLASS) {
          cellFill[i] = this.fade(ir, ig, ib, Math.min(1, 0.62 + fog * 0.38));
          set = glyphs ?? SCALE_RAMP;
          cellColor[i] = this.fade(ir, ig, ib, fog);
          cellGlyph[i] = set.charCodeAt((key >>> 8) % set.length);
          if (roll < sparkle) cellColor[i] = pack(...SPARKLES[key % SPARKLES.length]);
          continue;
        }
        if (kind === INK_LIT) {
          cellFill[i] = this.fade(ir * 0.58, ig * 0.58, ib * 0.58, fog);
          set = glyphs ?? ".:*";
          cellColor[i] = roll < sparkle ? pack(...SPARKLES[key % SPARKLES.length]) : this.fade(Math.min(255, ir * 1.05 + 50), Math.min(255, ig * 1.05 + 50), Math.min(255, ib * 1.05 + 50), fog);
          cellGlyph[i] = set.charCodeAt((key >>> 8) % set.length);
          continue;
        }
        const fill = this.fade(ir, ig, ib, fog);
        cellFill[i] = fill;
        const fr = fill >>> 16;
        const fg = fill >>> 8 & 255;
        const fb = fill & 255;
        if (kind === INK_BODY) {
          set = glyphs ?? BODY_GLYPHS;
          [gr, gg, gb] = [fr * 1.6 + 44, fg * 1.6 + 40, fb * 1.6 + 36];
        } else if (kind === INK_DARK) {
          set = glyphs ?? DARK_GLYPHS;
          [gr, gg, gb] = [fr * 1.7 + 34, fg * 1.7 + 30, fb * 1.7 + 30];
        } else if (kind === INK_SPOT) {
          set = glyphs ?? SPOT_GLYPHS;
          [gr, gg, gb] = [fr * 0.4, fg * 0.4, fb * 0.4];
        } else {
          set = glyphs ?? SCALE_RAMP;
          [gr, gg, gb] = [fr * 0.42, fg * 0.42, fb * 0.42];
        }
        let glyph;
        if (glyphs || kind !== INK_SCALE && kind !== INK_SHIMMER) {
          glyph = set.charCodeAt((key >>> 8) % set.length);
        } else {
          const lum = (0.3 * fr + 0.59 * fg + 0.11 * fb) / 255;
          const jitter = (key >>> 4) % 3 - 1;
          glyph = set.charCodeAt(clamp(Math.floor((1 - lum) * (set.length - 0.01)) + jitter, 0, set.length - 1));
        }
        cellGlyph[i] = glyph;
        const glints = kind === INK_SHIMMER ? sparkle : kind === INK_SCALE ? sparkle / 3 : 0;
        cellColor[i] = roll < glints ? pack(...SPARKLES[key % SPARKLES.length]) : pack(gr, gg, gb);
      }
    }
  }
  line(x0, y0, x1, y1, color, fog, tip) {
    const { cellFlag, cellColor, cellGlyph, cw } = this;
    const [r, g, b] = this.turn(color[0], color[1], color[2]);
    const packed = this.fade(r, g, b, fog);
    const glyph = lineGlyph(Math.atan2(y1 - y0, x1 - x0)).charCodeAt(0);
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (cw * 0.5)));
    let last = -1;
    for (let s = 1; s <= steps; s++) {
      const i = this.cellIndex(x0 + (x1 - x0) * s / steps, y0 + (y1 - y0) * s / steps);
      if (i < 0 || cellFlag[i] === CELL_SOLID) continue;
      cellFlag[i] = CELL_SOFT;
      cellColor[i] = packed;
      cellGlyph[i] = glyph;
      last = i;
    }
    if (tip && last >= 0) cellGlyph[last] = tip.charCodeAt(0);
  }
  dot(x, y, glyph, color, fog) {
    const i = this.cellIndex(x, y);
    if (i < 0 || this.cellFlag[i] === CELL_SOLID) return;
    const [r, g, b] = this.turn(color[0], color[1], color[2]);
    this.cellFlag[i] = CELL_SOFT;
    this.cellColor[i] = this.fade(r, g, b, fog);
    this.cellGlyph[i] = glyph.charCodeAt(0);
  }
  spot(x, y, glyph, color, fill, fog) {
    const i = this.cellIndex(x, y);
    if (i < 0) return;
    const [r, g, b] = this.turn(color[0], color[1], color[2]);
    const [fr, fg, fb] = this.turn(fill[0], fill[1], fill[2]);
    this.cellFlag[i] = CELL_SOLID;
    this.cellFill[i] = this.fade(fr, fg, fb, fog);
    this.cellColor[i] = this.fade(r, g, b, fog);
    this.cellGlyph[i] = glyph.charCodeAt(0);
  }
  drawCells() {
    const { ctx, cols, rows, cw, ch, cellFlag, cellFill, cellColor, cellGlyph } = this;
    const n = cols * rows;
    for (let i = 0; i < n; i++) {
      const flag = cellFlag[i];
      if (!flag) continue;
      const x = i % cols * cw;
      const y = (i / cols | 0) * ch;
      if (flag === CELL_SOLID) {
        const f = cellFill[i];
        ctx.fillStyle = rgb(f >>> 16, f >>> 8 & 255, f & 255);
        ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);
      }
      const g = cellColor[i];
      ctx.fillStyle = rgb(g >>> 16, g >>> 8 & 255, g & 255);
      ctx.fillText(String.fromCharCode(cellGlyph[i]), x + cw / 2, y + ch / 2 + 1);
    }
  }
};

// src/animals/dragonflies.ts
var DEFAULTS4 = {
  ...SHARED_TUNING,
  fog: 0.26,
  density: 2.1,
  sway: 0,
  spread: 0,
  farthest: 0.32,
  farBias: 3,
  grip: 5,
  separation: 720,
  trail: 0.6,
  trailFade: 1.2,
  sparkle: 0.18,
  hover: 1.3,
  cruising: 0.5,
  dart: 1.5,
  wingbeat: 1
};
var FORE2 = { u: 0.11, v: 0.02, angle: 0.08, length: 0.5, width: 0.062, broad: 0 };
var HIND2 = { u: 0.06, v: 0.02, angle: -0.05, length: 0.48, width: 0.07, broad: 0.5 };
var hit = { s: 0, x: 0 };
function onWing2(w, u, vw) {
  const du = u - w.u;
  const dv = vw - w.v;
  const sa = Math.sin(w.angle);
  const ca = Math.cos(w.angle);
  const s = (du * sa + dv * ca) / w.length;
  if (s < 0 || s > 1) return false;
  const across = du * ca - dv * sa;
  const half = w.width * Math.pow(Math.sin(Math.PI * (0.1 + 0.9 * s)), 0.45) * (1 + w.broad * (1 - s) * (1 - s));
  if (Math.abs(across) > half) return false;
  hit.s = s;
  hit.x = across / half;
  return true;
}
var EMERALD = [50, 220, 120];
var EYE_WHITE = [240, 240, 232];
var PUPIL = [10, 10, 12];
var at2 = { x: 0, y: 0 };
var THORAX = [96, 232, 130];
var THORAX_STRIPE = [28, 70, 44];
var LEGS2 = [40, 60, 44];
var ABDOMEN = [24, 72, 46];
var JOINT = [200, 255, 220];
var TIP3 = [18, 40, 28];
var COSTA = [236, 168, 70];
var VEIN = [226, 236, 214];
var ROOT2 = [90, 220, 140];
var STIGMA = [176, 70, 40];
var GLINT3 = [255, 255, 255];
var dragonflies = {
  key: "dragonflies",
  label: "Dragonfly",
  swatch: EMERALD,
  defaults: DEFAULTS4,
  hide: ["shimmer"],
  controls: [
    ["Flight", [
      { key: "hover", label: "Hover time", min: 0.1, max: 4, step: 0.05, hint: "How long they hang in place, on average. Each hover varies a lot: mostly brief, now and then a long one." },
      { key: "cruising", label: "Cruising", min: 0, max: 1, step: 0.01, hint: "How often they fly on along the course for a few seconds instead of stopping to hover. Higher means fewer hovers." },
      { key: "dart", label: "Dart speed", min: 0.2, max: 3, step: 0.05, hint: "How fast each dart is." },
      { key: "wingbeat", label: "Wingbeat", min: 0.2, max: 2, step: 0.05, hint: "How fast the wings flicker." }
    ]]
  ],
  // Big, with few far away, so a wing is several cells across: room for the vein net.
  area: 15e4,
  scale: 2.1,
  speed: 70,
  trail: { light: [40, 160, 100], dark: [140, 255, 190] },
  create: (c) => ({ ...c, phase: rand(0, TAU), mode: "hover", until: 0, aim: 0 }),
  enter(d, flock) {
    d.mode = "hover";
    d.until = flock.time + rand(0, 0.6);
    d.aim = flock.course;
  },
  update(d, flock, dt) {
    const k = flock.tuning;
    const t = flock.time;
    const cruise = flock.cruise(d);
    if (t >= d.until) {
      const from = d.mode;
      const next = from === "hover" ? "dart" : from === "dart" ? Math.random() < k.cruising ? "cruise" : "hover" : Math.random() < 0.35 ? "dart" : "hover";
      d.mode = next;
      if (next === "dart") {
        d.until = t + rand(0.15, 0.45);
        if (from === "cruise") d.aim = d.heading + rand(-0.4, 0.4) * (k.spread + 0.2);
      } else if (next === "cruise") {
        d.until = t + rand(1.2, 4.5);
        d.aim = flock.heading + d.bias * k.spread + rand(-0.5, 0.5) * k.spread;
      } else {
        d.until = t + Math.min(3, Math.max(0.15, -Math.log(1 - Math.random()) * 0.7)) * k.hover;
        d.aim = flock.heading + d.bias * k.spread * 0.5 + rand(-1, 1) * k.spread * 1.6;
      }
    }
    const acc = flock.begin();
    if (d.mode === "dart") {
      flock.steer(d, d.aim, cruise * 4 * k.dart, 10);
    } else if (d.mode === "cruise") {
      d.aim += rand(-1, 1) * dt * 1.2;
      d.aim += (flock.heading + d.bias * k.spread - d.aim) * Math.min(1, dt * 0.8);
      flock.steer(d, d.aim, cruise * 1.8, 3);
    } else {
      flock.steer(d, flock.heading, cruise * 0.25, 4 * k.grip);
      acc.x += Math.cos(t * 3 + d.id) * 40;
      acc.y += Math.sin(t * 4.3 + d.id * 2) * 40;
    }
    flock.separate(d);
    flock.move(d, dt, cruise * 4.5 * k.dart);
    if (flock.passed(d)) flock.reenter(d);
    if (d.mode === "cruise") flock.face(d, dt, 4);
    else flock.face(d, dt, d.mode === "dart" ? 14 : 2.5, d.aim);
    d.phase += dt * TAU * 7 * k.wingbeat;
  },
  startle(d, _dx, _dy, strength, flock) {
    d.mode = "dart";
    d.aim = flock.heading + d.bias * flock.tuning.spread;
    d.until = flock.time + 0.25 + 0.3 * strength;
    d.startledUntil = d.until;
  },
  draw: (d, pen) => drawDragonfly(d, pen)
};
function drawDragonfly(d, pen) {
  const S = d.span;
  const pose = { x: d.x, y: d.y, heading: d.heading, span: S, depth: d.depth, id: d.id };
  const out = pen.ink;
  const openFore = 0.86 + 0.14 * Math.cos(d.phase);
  const openHind = 0.86 + 0.14 * Math.cos(d.phase + 1.7);
  const minBody = pen.cw * 0.38;
  const glintAt = frac(d.phase / TAU);
  const tick = Math.floor(pen.t * 24);
  for (const side of [-1, 1]) {
    pen.lineBody(pose, 0.14, 0.03 * side, 0.2, 0.07 * side, LEGS2);
    pen.lineBody(pose, 0.1, 0.03 * side, 0.12, 0.08 * side, LEGS2);
  }
  pen.shape(pose, 0.74, (u, v) => {
    const av = Math.abs(v);
    const tu = (u - 0.12) / 0.07;
    const tv = av / 0.046;
    if (tu * tu + tv * tv <= 1) return ink(out, ...frac((u + av) * 22) < 0.5 ? THORAX : THORAX_STRIPE, INK_LIT, "#8");
    if (u < 0.06 && u > -0.74) {
      const half = Math.max(0.017 - 6e-3 * ((0.06 - u) / 0.8), minBody / S);
      if (av <= half) {
        if (u < -0.66) return ink(out, ...TIP3, INK_DARK);
        const seg2 = frac(u * 20);
        if (seg2 < 0.1) return ink(out, ...JOINT, INK_LIT, "-");
        return seg2 < 0.45 ? ink(out, ...EMERALD, INK_LIT, "=") : ink(out, ...ABDOMEN, INK_LIT, ":=");
      }
    }
    for (const [w, open] of [[FORE2, openFore], [HIND2, openHind]]) {
      if (!onWing2(w, u, av / open)) continue;
      const side = v >= 0 ? 1 : -1;
      const along = lineGlyph(d.heading + Math.atan2(side * Math.cos(w.angle), Math.sin(w.angle)));
      const across = lineGlyph(d.heading + Math.atan2(-side * Math.sin(w.angle), Math.cos(w.angle)));
      const { s, x } = hit;
      if (s > 0.82 && s < 0.9 && x > 0.35) return ink(out, ...STIGMA, INK_LIT, "#");
      if (x > 0.72) return ink(out, ...COSTA, INK_GLOW, along);
      if (Math.abs(s - glintAt) < 0.05 && hash3(Math.round(u * 60), Math.round(v * 60), tick) > 0.45) {
        return ink(out, ...GLINT3, INK_GLOW, "*+");
      }
      const lengthwise = Math.abs(x + 0.15) < 0.09 || Math.abs(x - 0.35) < 0.07 || x < -0.85 || s > 0.97;
      const cross = frac(s * 9) < 0.09;
      if (lengthwise) return ink(out, ...VEIN, INK_GLOW, cross ? "+" : along);
      if (cross) return ink(out, ...VEIN, INK_GLOW, across);
      if (s < 0.18) return ink(out, ...ROOT2, INK_GLASS, ".");
      return hash3(Math.round(u * 50), Math.round(v * 50), d.id) > 0.6 && ink(out, ...VEIN, INK_GLOW, ".");
    }
    return false;
  }, { light: 0.92 + 0.08 * openFore });
  if (0.068 * S >= pen.cw) {
    for (const side of [-1, 1]) {
      pen.toWorld(pose, 0.2, 0.034 * side, at2);
      pen.spot(at2.x, at2.y, "\u25CF", PUPIL, EYE_WHITE, d.depth);
    }
  }
  if (d.mode === "dart") pen.shed(d.x, d.y, 0.06 * d.depth);
}

// src/animals/frogs.ts
var DEFAULTS5 = {
  ...SHARED_TUNING,
  fog: 0,
  size: 1.2,
  density: 1.3,
  sway: 0,
  spread: 0,
  farthest: 0.35,
  farBias: 1.4,
  separation: 450,
  trail: 3.45,
  trailFade: 0.4,
  shimmer: 0.15,
  sparkle: 0.05,
  hop: 1,
  leap: 0.45,
  height: 1
};
var SKIN = [104, 184, 76];
var LEG2 = [92, 164, 66];
var SPOT = [30, 70, 30];
var HALO = [190, 222, 130];
var RIDGE = [206, 226, 150];
var BAND = [36, 80, 32];
var EYE_WHITE2 = [240, 240, 228];
var PUPIL2 = [16, 16, 12];
var LID = [20, 30, 16];
var WEB = [120, 190, 90];
var HIND_REST = [[-0.16, 0.11], [0, 0.22], [-0.19, 0.25], [-0.04, 0.31]];
var HIND_KICK = [[-0.17, 0.09], [-0.38, 0.15], [-0.56, 0.13], [-0.68, 0.15]];
var HIND_RADII = [0.056, 0.04, 0.026];
var FRONT_REST = [[0.06, 0.1], [0.09, 0.19], [0.18, 0.2]];
var FRONT_AIR = [[0.06, 0.1], [0.02, 0.16], [-0.06, 0.15]];
var FRONT_REACH = [[0.08, 0.11], [0.16, 0.19], [0.27, 0.19]];
var FRONT_RADII = [0.028, 0.022];
var EYE3 = [0.18, 0.1];
var blend = (a, b, t) => a.map(([u, v], i) => [lerp(u, b[i][0], t), lerp(v, b[i][1], t)]);
function halfWidth(u, breathe) {
  const trunk = 0.155 * Math.sqrt(Math.max(0, 1 - ((u + 0.1) / 0.18) ** 2));
  let head = 0.15 * breathe * Math.sqrt(Math.max(0, 1 - ((u - 0.12) / 0.18) ** 2));
  if (u > 0.18) head *= 1 - 0.5 * ((u - 0.18) / 0.12) ** 2;
  return Math.max(trunk, head);
}
function onLimb(joints, radii, u, v) {
  for (let i = 0; i < joints.length - 1; i++) {
    const [au, av] = joints[i];
    const [bu, bv] = joints[i + 1];
    if (toSegment(u, v, au, av, bu, bv) <= radii[i] * (1 - 0.25 * seg.t)) {
      seg.t = (i + seg.t) / (joints.length - 1);
      return true;
    }
  }
  return false;
}
var at3 = { x: 0, y: 0 };
var STRAY = 0.35;
var LENGTHS = [1, 0.8, 1.2, 0.65, 1.35];
var frogs = {
  key: "frogs",
  label: "Frog",
  swatch: [104, 184, 76],
  defaults: DEFAULTS5,
  hide: ["grip"],
  controls: [
    ["Leaping", [
      { key: "hop", label: "How often", min: 0.2, max: 4, step: 0.05, hint: "How often they leap." },
      { key: "leap", label: "Leap length", min: 0.3, max: 2.5, step: 0.05, hint: "How far each leap goes." },
      { key: "height", label: "Leap height", min: 0, max: 2.5, step: 0.05, hint: "How high each leap arcs: they draw bigger at the top and the shadow slides further away." }
    ]]
  ],
  area: 75e3,
  scale: 0.95,
  speed: 80,
  trail: { light: [80, 150, 170], dark: [110, 200, 220] },
  create: (c) => ({ ...c, leaping: false, until: 0, aim: 0, s: 0, dur: 0.5, fromX: 0, fromY: 0, toX: 0, toY: 0 }),
  enter(f, flock) {
    f.leaping = false;
    f.s = 0;
    f.vx = 0;
    f.vy = 0;
    f.aim = flock.heading + f.bias * flock.tuning.spread;
    f.heading = f.aim;
    f.until = flock.time + rand(0, 1.5);
  },
  update(f, flock, dt) {
    const k = flock.tuning;
    const t = flock.time;
    if (!f.leaping) {
      f.vx = 0;
      f.vy = 0;
      flock.face(f, dt, 2.5, f.aim);
      if (t >= f.until) leap(f, flock, f.aim, 1);
      return;
    }
    f.s += dt / f.dur;
    if (f.s >= 1) {
      f.leaping = false;
      f.x = f.toX;
      f.y = f.toY;
      f.vx = 0;
      f.vy = 0;
      f.until = t + rand(0.5, 2.2) / (k.hop * k.speed);
      f.aim = flock.heading + (f.bias + rand(-0.7, 0.7)) * k.spread;
      flock.events.push({ x: f.x, y: f.y, radius: 2, amount: 0.7 * f.depth * k.trail });
      if (flock.passed(f)) flock.reenter(f);
      return;
    }
    f.x = lerp(f.fromX, f.toX, f.s);
    f.y = lerp(f.fromY, f.toY, f.s);
  },
  // A tap scares nearby frogs into leaping away from it, whichever way that is.
  startle(f, dx, dy, strength, flock) {
    if (f.leaping) return;
    leap(f, flock, Math.atan2(dy, dx), 1 + strength, false);
    f.startledUntil = flock.time + f.dur;
  },
  draw: (f, pen, flock) => drawFrog(f, pen, flock)
};
function leap(f, flock, dir, boost, onCourse = true) {
  const k = flock.tuning;
  if (onCourse) dir = flock.heading + clamp(angleDiff(flock.heading, dir), -STRAY, STRAY);
  const cos = Math.cos(dir);
  const sin = Math.sin(dir);
  const reach = f.span * rand(2.4, 3.6) * k.leap * k.speed * boost;
  let dist = reach;
  if (onCourse && k.separation > 0) {
    let best = -1;
    for (const m of LENGTHS) {
      const x = f.x + cos * reach * m;
      const y = f.y + sin * reach * m;
      let clear = Infinity;
      for (const o of flock.creatures) {
        if (o === f || Math.abs(o.depth - f.depth) > 0.2) continue;
        const ox = o.leaping ? o.toX : o.x;
        const oy = o.leaping ? o.toY : o.y;
        clear = Math.min(clear, Math.hypot(x - ox, y - oy) / (f.span + o.span));
      }
      if (clear > best) {
        best = clear;
        dist = reach * m;
      }
      if (clear >= 0.6 * (k.separation / 300)) break;
    }
  }
  f.leaping = true;
  f.s = 0;
  f.dur = rand(0.42, 0.55) * Math.sqrt(k.leap) * (boost > 1 ? 0.8 : 1);
  f.heading = dir;
  f.fromX = f.x;
  f.fromY = f.y;
  f.toX = f.x + cos * dist;
  f.toY = f.y + sin * dist;
  f.vx = (f.toX - f.fromX) / f.dur;
  f.vy = (f.toY - f.fromY) / f.dur;
}
function drawFrog(f, pen, flock) {
  const k = flock.tuning;
  const s = f.leaping ? f.s : 0;
  const h = 4 * s * (1 - s) * k.height;
  const S = f.span * (1 + 0.35 * h);
  const pose = { x: f.x, y: f.y, heading: f.heading, span: S, depth: f.depth, id: f.id };
  const out = pen.ink;
  const kick = f.leaping ? smoothstep(0, 0.16, s) * (1 - smoothstep(0.72, 1, s)) : 0;
  const hind = blend(HIND_REST, HIND_KICK, kick);
  const front = f.leaping ? s < 0.6 ? blend(FRONT_REST, FRONT_AIR, smoothstep(0, 0.2, s)) : blend(FRONT_AIR, FRONT_REACH, smoothstep(0.6, 0.95, s)) : FRONT_REST;
  const breathe = f.leaping ? 1 : 1 + 0.045 * Math.sin(pen.t * 6 + f.id);
  const blinking = !f.leaping && frac(pen.t * 0.21 + f.id * 0.37) < 0.035;
  for (const side of [-1, 1]) {
    const toes = (from, to, n, len, fan) => {
      const dir = Math.atan2(to[1] - from[1], to[0] - from[0]);
      for (let i = 0; i < n; i++) {
        const a = dir + (i / (n - 1) - 0.5) * fan;
        pen.lineBody(pose, to[0], to[1] * side, to[0] + Math.cos(a) * len, (to[1] + Math.sin(a) * len) * side, WEB);
      }
    };
    toes(hind[2], hind[3], 4, 0.075, 1.2);
    toes(front[1], front[2], 3, 0.045, 1.1);
  }
  pen.shape(pose, 0.9, (u, v) => {
    const av = Math.abs(v);
    const hw = halfWidth(u, breathe);
    if (av <= hw && u > -0.29 && u < 0.3) {
      if (Math.abs(av - 0.11) < 0.012 && u > -0.22 && u < 0.14) return ink(out, ...RIDGE, INK_LIT);
      if (u < 0.1) {
        if (spotted(u, v, 0.085, 0.024, f.id)) return ink(out, ...SPOT, INK_DARK);
        if (spotted(u, v, 0.085, 0.036, f.id)) return ink(out, ...HALO, INK_LIT);
      }
      const g = 0.9 + 0.2 * (1 - av / Math.max(hw, 1e-3));
      return ink(out, SKIN[0] * g, SKIN[1] * g, SKIN[2] * g, INK_LIT);
    }
    const [fu, fv] = hind[3];
    const [au, av2] = hind[2];
    const dir = Math.atan2(fv - av2, fu - au);
    const off = Math.atan2(av - fv, u - fu) - dir;
    if (Math.hypot(u - fu, av - fv) < 0.06 && Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) < 0.5) {
      return ink(out, ...WEB, INK_GLASS, ".");
    }
    if (onLimb(hind, HIND_RADII, u, av) || onLimb(front, FRONT_RADII, u, av)) {
      return frac(seg.t * 4.5) < 0.3 ? ink(out, ...BAND, INK_DARK) : ink(out, ...LEG2, INK_LIT);
    }
    return false;
  }, { light: 1 + 0.15 * h });
  for (const side of [-1, 1]) {
    pen.toWorld(pose, EYE3[0], EYE3[1] * side, at3);
    if (blinking) pen.spot(at3.x, at3.y, "-", LID, SKIN, f.depth);
    else pen.spot(at3.x, at3.y, "\u25CF", PUPIL2, EYE_WHITE2, f.depth);
  }
}

// src/animals/jellyfish.ts
var DEFAULTS6 = {
  ...SHARED_TUNING,
  speed: 1.05,
  sway: 0.04,
  spread: 0.08,
  farthest: 0.3,
  farBias: 1.4,
  grip: 1.4,
  trail: 0.8,
  trailFade: 0.6,
  sparkle: 0.1,
  pulseRate: 1,
  pulsePower: 1,
  pulseGlow: 1,
  tentacles: 1
};
var CROWN2 = [255, 168, 230];
var BODY2 = [232, 56, 182];
var RIM = [255, 200, 240];
var LOBES = [255, 214, 244];
var DOTS = [255, 240, 250];
var FRILL = [255, 214, 240];
var CORE = [204, 56, 172];
var TENTACLE = [232, 100, 204];
var SNOW = [255, 170, 226];
var SNOW_AREA = 6e3;
var at4 = { x: 0, y: 0 };
var bt = { x: 0, y: 0 };
var mix = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
var jellyfish = {
  key: "jellyfish",
  label: "Jellyfish",
  swatch: [232, 56, 182],
  defaults: DEFAULTS6,
  hide: ["shimmer"],
  controls: [
    ["Swimming", [
      { key: "pulseRate", label: "Pulse rate", min: 0.2, max: 3, step: 0.05, hint: "How often the bell pulses." },
      { key: "pulsePower", label: "Pulse power", min: 0.2, max: 3, step: 0.05, hint: "How far each pulse pushes it forward." },
      { key: "pulseGlow", label: "Pulse glow", min: 0, max: 3, step: 0.05, hint: "How much the bell lights up on each pulse. 0 turns it off." },
      { key: "tentacles", label: "Arm length", min: 0, max: 2.5, step: 0.05, hint: "Length of the frilly arms and the thin tentacles." }
    ]]
  ],
  area: 95e3,
  scale: 1.6,
  speed: 55,
  trail: { light: [200, 80, 170], dark: [255, 130, 214] },
  create: (c) => ({ ...c, phase: rand(0, TAU), squeeze: 0, turn: 0 }),
  update(j, flock, dt) {
    const k = flock.tuning;
    j.phase += dt * TAU * 0.6 * k.pulseRate * (0.9 + 0.2 * j.roll);
    const p = frac(j.phase / TAU);
    j.squeeze = p < 0.22 ? smoothstep(0, 0.22, p) : 1 - smoothstep(0.22, 1, p);
    const want = flock.heading + j.bias * k.spread;
    const before = j.heading;
    j.heading += clamp(angleDiff(j.heading, want), -0.6 * k.grip * dt, 0.6 * k.grip * dt);
    j.turn += (angleDiff(before, j.heading) / dt - j.turn) * Math.min(1, dt * 3);
    const cruise = flock.cruise(j);
    const acc = flock.begin();
    const thrust = p < 0.22 ? 6.2 * cruise * k.pulsePower : 0;
    acc.x += Math.cos(j.heading) * thrust - j.vx * 1.4;
    acc.y += Math.sin(j.heading) * thrust - j.vy * 1.4;
    flock.separate(j, k.separation, 0.5);
    flock.move(j, dt, cruise * 3);
    if (flock.passed(j, j.span * 1.4)) flock.reenter(j);
  },
  startle(j, _dx, _dy, strength, flock) {
    j.phase = Math.floor(j.phase / TAU) * TAU + TAU;
    const boost = 260 * strength * j.depth;
    j.vx += Math.cos(j.heading) * boost;
    j.vy += Math.sin(j.heading) * boost;
    j.startledUntil = flock.time + 0.8;
  },
  drawAll(flock, pen) {
    drawSnow(flock, pen);
    for (const j of flock.creatures) drawJelly(j, pen, flock);
  }
};
function pulseGlow(j) {
  const p = frac(j.phase / TAU);
  return p < 0.16 ? smoothstep(0, 0.16, p) : Math.exp(-(p - 0.16) * 4.5);
}
function drawJelly(j, pen, flock) {
  const k = flock.tuning;
  const S = j.span;
  const sq = j.squeeze;
  const t = pen.t;
  const pose = { x: j.x, y: j.y, heading: j.heading, span: S, depth: j.depth, id: j.id };
  const len = k.tentacles;
  const base = pen.fogFor(j.depth);
  const a = 0.32 * (1 + 0.14 * sq);
  const b = 0.3 * (1 - 0.2 * sq);
  const u0 = -0.04;
  const sway = clamp(-j.turn * 0.5, -0.5, 0.5);
  const flash = pulseGlow(j) * k.pulseGlow;
  for (let n = 0; n < 8; n++) {
    const v0 = (n / 7 - 0.5) * 2 * b * 0.6;
    let pu = u0 - 0.02;
    let pv = v0;
    const segs = 14;
    const length = 1.5 * len * (0.75 + 0.35 * hash3(j.id, n, 4));
    for (let i = 1; i <= segs; i++) {
      const f = i / segs;
      const u = u0 - 0.02 - f * length * (1 - 0.12 * sq);
      const v = v0 * (1 - 0.3 * f) + 0.04 * Math.sin(j.phase - f * 3.5 + n * 1.3) * f + sway * f * f * 0.4;
      pen.toWorld(pose, pu, pv, at4);
      pen.toWorld(pose, u, v, bt);
      pen.line(at4.x, at4.y, bt.x, bt.y, TENTACLE, j.depth, void 0, Math.min(0.95, base + 0.45 + 0.35 * f));
      pu = u;
      pv = v;
    }
  }
  for (let n = 0; n < 4; n++) {
    const v0 = (n / 3 - 0.5) * 0.11;
    const segs = 26;
    const length = 1.05 * len * (0.8 + 0.3 * hash3(j.id, n, 7));
    for (let i = 1; i <= segs; i++) {
      const f = i / segs;
      const u = u0 - f * length;
      const v = v0 * (1 - 0.4 * f) + 0.05 * Math.sin(j.phase * 0.9 - f * 4.5 + n * 1.7) * f + sway * f * 0.25;
      const w = 0.055 * (1 - 0.5 * f) * Math.cos(f * 9 + n * 1.3 + t * 0.6);
      const fog = Math.min(0.95, base + 0.3 * f);
      pen.toWorld(pose, u, v, at4);
      pen.dot(at4.x, at4.y, i % 3 ? ":" : "|", CORE, j.depth, Math.min(0.95, fog + 0.15));
      for (const side of [-1, 1]) {
        pen.toWorld(pose, u, v + w * side, at4);
        pen.dot(at4.x, at4.y, "{}~\xA7"[(i + n + (side > 0 ? 1 : 0)) % 4], FRILL, j.depth, fog);
      }
    }
    pen.toWorld(pose, u0 - length, v0, at4);
    pen.shed(at4.x, at4.y, 0.015 * j.depth);
  }
  const out = pen.ink;
  const h = 1.3 * (1 + 0.18 * flash);
  pen.shape(pose, 0.32 * h + 0.1, (u, v) => {
    const r = Math.hypot((u - u0) / (a * h), v / (b * h));
    return r < 1 && u > u0 - 0.08 && ink(out, ...RIM, INK_GLOW, ".");
  }, { fog: clamp(base + 0.55 - 0.3 * flash, 0, 0.95) });
  pen.shape(pose, 0.42, (u, v) => {
    const du = (u - u0) / a;
    const dv = v / b;
    const r2 = du * du + dv * dv;
    const margin = u0 - 0.04 * dv * dv;
    if (r2 > 1 || u < margin) {
      if (Math.abs(dv) > 1 || u > margin || u < margin - 0.04) return false;
      const lobe2 = 0.04 * Math.sin(frac((dv + 1) * 5.5) * Math.PI);
      return u > margin - lobe2 && ink(out, ...LOBES, INK_LIT, "o");
    }
    const r = Math.sqrt(r2);
    if (r > 0.88) return ink(out, ...RIM, INK_LIT, ":;");
    const th = Math.atan2(dv, du);
    if (du > 0.3) {
      const gu = Math.round(du * 11);
      const gv = Math.round(dv * 13);
      const near = Math.hypot(du * 11 - gu, dv * 13 - gv) < 0.32;
      if (near && hash3(gu, gv, j.id) > 0.45) return ink(out, ...DOTS, INK_LIT, ".'");
    }
    if (r > 0.35 && frac(th / Math.PI * 6) < 0.1) return ink(out, ...RIM, INK_LIT, "|");
    const glow = 0.75 + 0.25 * Math.max(clamp(du, 0, 1), r * r);
    const c = mix(BODY2, CROWN2, clamp(du, 0, 1) * 0.8);
    return ink(out, c[0] * glow, c[1] * glow, c[2] * glow, INK_LIT, " .");
  }, { light: (0.92 + 0.18 * sq) * (1 + 0.6 * flash) });
}
function drawSnow(flock, pen) {
  const { width: W, height: H } = flock;
  const n = Math.round(W * H / SNOW_AREA);
  const t = pen.t;
  for (let i = 0; i < n; i++) {
    const rise = 3 + 9 * hash3(i, 3, 1);
    const x = hash3(i, 1, 1) * W + Math.sin(t * 0.25 + i) * 6;
    const y = ((hash3(i, 2, 1) * H - t * rise) % H + H) % H;
    const twinkle = 0.5 + 0.5 * Math.sin(t * (0.8 + 1.6 * hash3(i, 4, 1)) + i);
    const big = hash3(i, 5, 1) > 0.92;
    pen.dot(x, y, big ? "*" : ".", SNOW, 1, Math.min(0.95, 0.35 + 0.5 * (1 - twinkle) + (big ? 0 : 0.15)));
  }
}

// src/animals/koi.ts
var NODES = 14;
var DEFAULTS7 = {
  ...SHARED_TUNING,
  fog: 0.64,
  density: 1.6,
  speed: 1.6,
  spread: 0,
  sway: 0,
  farthest: 0.33,
  farBias: 1.3,
  grip: 2.65,
  separation: 780,
  trail: 4,
  trailFade: 0.4,
  shimmer: 0.35,
  sparkle: 0.08,
  meander: 0.4,
  foodRange: 200,
  tailBeat: 1
};
var WHITE2 = [244, 240, 230];
var RED = [222, 66, 40];
var BLACK2 = [34, 34, 40];
var GOLD = [238, 182, 64];
var ORANGE = [236, 124, 44];
var FIN = [236, 226, 214];
var VARIETIES = ["kohaku", "sanke", "showa", "ogon", "chagoi"];
function halfWidth2(s) {
  if (s < 0.12) return 0.1 * Math.pow(Math.sin(s / 0.12 * Math.PI / 2), 0.6);
  if (s < 0.35) return 0.1 + 0.016 * Math.sin((s - 0.12) / 0.23 * (Math.PI / 2));
  if (s < 0.82) return 0.116 - 0.088 * smoothstep(0.35, 0.82, s);
  return 0.028 + (s - 0.82) / 0.18 * 0.1;
}
function blotch(s, a, seed) {
  return Math.sin(s * 11 + seed) * Math.cos(a * 22 + seed * 1.3) + 0.6 * Math.sin(s * 23 + a * 15 + seed * 2.1) + 0.35 * Math.sin(s * 5 - seed * 0.7);
}
var PELLET_LIFE = 14;
var FOOD = [232, 178, 104];
var EYE4 = [14, 12, 16];
var GLINT4 = [255, 252, 246];
var pantries = /* @__PURE__ */ new WeakMap();
var pantry = (flock) => {
  let food = pantries.get(flock);
  if (!food) pantries.set(flock, food = []);
  return food;
};
var pull = 0;
function nearestFood(f, flock, range) {
  let best = null;
  let bestD = range;
  for (const p of pantry(flock)) {
    const d = Math.hypot(p.x - f.x, p.y - f.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  pull = best ? 1 - bestD / range : 0;
  return best;
}
var koi = {
  key: "koi",
  label: "Koi",
  // The dot in the top bar: yellow, so it doesn't look like the crab's.
  swatch: [244, 196, 44],
  defaults: DEFAULTS7,
  controls: [
    ["Swimming", [
      { key: "meander", label: "Meander", min: 0, max: 3, step: 0.05, hint: "How much they weave in lazy S-curves." },
      { key: "tailBeat", label: "Tail beat", min: 0.2, max: 3, step: 0.05, hint: "How fast and wide the tail swishes." }
    ]],
    ["Feeding", [
      { key: "foodRange", label: "Food range", min: 0, max: 500, step: 10, hint: "How close a koi has to be to notice food you drop. The closer it is, the harder it turns and the faster it swims over." }
    ]]
  ],
  area: 75e3,
  scale: 1.15,
  speed: 50,
  trail: { light: [90, 140, 190], dark: [110, 170, 220] },
  create: (c) => ({
    ...c,
    nodes: new Float32Array(NODES * 2),
    phase: rand(0, TAU),
    variety: Math.floor(hash3(c.id, 7, 3) * VARIETIES.length)
  }),
  /** Lay the spine out straight behind the head. */
  enter(f) {
    const seg2 = f.span / (NODES - 1);
    for (let k = 0; k < NODES; k++) {
      f.nodes[k * 2] = f.x - Math.cos(f.heading) * seg2 * k;
      f.nodes[k * 2 + 1] = f.y - Math.sin(f.heading) * seg2 * k;
    }
  },
  /** Pellets drift slowly on the surface and fade away if nobody eats them. */
  prepare(flock, dt) {
    const food = pantry(flock);
    for (const p of food) {
      p.vx *= Math.exp(-dt * 0.8);
      p.vy *= Math.exp(-dt * 0.8);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    const t = flock.time;
    for (let i = food.length - 1; i >= 0; i--) if (t - food[i].born > PELLET_LIFE) food.splice(i, 1);
  },
  /** A tap drops a scatter of food pellets, each landing with a ripple. */
  tap(x, y, flock) {
    const food = pantry(flock);
    const n = 7 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const r = 70 * Math.sqrt(Math.random());
      const p = { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: Math.cos(a) * rand(4, 14), vy: Math.sin(a) * rand(4, 14), born: flock.time };
      food.push(p);
      flock.events.push({ x: p.x, y: p.y, radius: 1, amount: 0.5 });
    }
    if (food.length > 60) food.splice(0, food.length - 60);
  },
  update(f, flock, dt) {
    const k = flock.tuning;
    const t = flock.time;
    const meal = nearestFood(f, flock, k.foodRange);
    const hunger = meal ? 0.25 + 0.75 * pull : 0;
    let want = meal ? Math.atan2(meal.y - f.y, meal.x - f.x) : flock.heading + f.bias * k.spread + k.meander * 0.6 * Math.sin(t * 0.35 + f.id * 1.7);
    const acc = flock.begin();
    flock.separate(f, k.separation, 0.5);
    if (acc.x || acc.y) {
      const cruise = flock.cruise(f);
      want = Math.atan2(Math.sin(want) * cruise + acc.y * 0.3, Math.cos(want) * cruise + acc.x * 0.3);
    }
    const turn = lerp(0.9 * k.grip, 2.6, hunger) * dt;
    f.heading += clamp(angleDiff(f.heading, want), -turn, turn);
    const speed = flock.cruise(f) * lerp(0.85 + 0.25 * Math.sin(t * 0.5 + f.id), 1.8, hunger);
    f.vx = Math.cos(f.heading) * speed;
    f.vy = Math.sin(f.heading) * speed;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.phase += dt * (2 + speed / 25) * k.tailBeat;
    const n = f.nodes;
    const seg2 = f.span / (NODES - 1);
    n[0] = f.x;
    n[1] = f.y;
    let prev = f.heading + Math.PI;
    for (let i = 1; i < NODES; i++) {
      let a = Math.atan2(n[i * 2 + 1] - n[i * 2 - 1], n[i * 2] - n[i * 2 - 2]);
      a = prev + clamp(angleDiff(prev, a), -0.22, 0.22);
      n[i * 2] = n[i * 2 - 2] + Math.cos(a) * seg2;
      n[i * 2 + 1] = n[i * 2 - 1] + Math.sin(a) * seg2;
      prev = a;
    }
    if (meal && Math.hypot(meal.x - f.x, meal.y - f.y) < f.span * 0.1 + 6) {
      const food = pantry(flock);
      food.splice(food.indexOf(meal), 1);
      flock.events.push({ x: meal.x, y: meal.y, radius: 1, amount: 0.7 });
    }
    if (flock.passed(f, f.span * 1.3)) flock.reenter(f);
  },
  drawAll(flock, pen) {
    drawFood(flock, pen);
    for (const f of flock.creatures) drawKoi(f, pen, flock);
  }
};
function drawFood(flock, pen) {
  const t = flock.time;
  for (const p of pantry(flock)) {
    const age = (t - p.born) / PELLET_LIFE;
    pen.dot(p.x, p.y, age < 0.7 ? "o" : ".", FOOD, 1, Math.min(0.9, Math.max(0, age - 0.5) * 1.6));
  }
}
function drawKoi(f, pen, flock) {
  const k = flock.tuning;
  const L = f.span;
  const n = f.nodes;
  const out = pen.ink;
  const variety = VARIETIES[f.variety];
  const seed = f.id * 1.37;
  const white = pen.theme === "light" ? [222, 217, 206] : WHITE2;
  const fin = pen.theme === "light" ? [206, 196, 182] : FIN;
  const spine = new Float32Array(NODES * 2);
  const arc = new Float32Array(NODES);
  for (let i = 0; i < NODES; i++) {
    const s = i / (NODES - 1);
    const a = Math.max(0, i - 1);
    const b = Math.min(NODES - 1, i + 1);
    let tx = n[a * 2] - n[b * 2];
    let ty = n[a * 2 + 1] - n[b * 2 + 1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const off = L * 0.06 * Math.pow(s, 1.6) * Math.sin(f.phase - s * 4.5) * Math.min(1.5, k.tailBeat);
    spine[i * 2] = n[i * 2] - ty * off;
    spine[i * 2 + 1] = n[i * 2 + 1] + tx * off;
    if (i > 0) arc[i] = arc[i - 1] + Math.hypot(spine[i * 2] - spine[i * 2 - 2], spine[i * 2 + 1] - spine[i * 2 - 1]);
  }
  const total = arc[NODES - 1] || 1;
  const mid = NODES / 2 | 0;
  const pose = { x: spine[mid * 2], y: spine[mid * 2 + 1], heading: f.heading, span: L, depth: f.depth, id: f.id };
  const finBeat = 0.8 + 0.2 * Math.sin(f.phase * 0.7);
  pen.shape(pose, 0.72, (_u, _v, px, py) => {
    let best = Infinity;
    let s = 0;
    let a = 0;
    let past = 0;
    for (let i = 0; i < NODES - 1; i++) {
      const ax = spine[i * 2];
      const ay = spine[i * 2 + 1];
      const sx = spine[i * 2 + 2] - ax;
      const sy = spine[i * 2 + 3] - ay;
      const len2 = sx * sx + sy * sy || 1;
      const raw = ((px - ax) * sx + (py - ay) * sy) / len2;
      const q = clamp(raw, 0, 1);
      const sl = Math.sqrt(len2);
      if (i === NODES - 2 && raw > 1) {
        const across3 = Math.abs(sx * (py - ay) - sy * (px - ax)) / sl;
        if (across3 * across3 < best) {
          best = across3 * across3;
          s = 1;
          past = (raw - 1) * sl / L;
          a = across3 / L * (sx * (py - ay) - sy * (px - ax) >= 0 ? 1 : -1);
        }
        continue;
      }
      const d2 = (px - ax - sx * q) ** 2 + (py - ay - sy * q) ** 2;
      if (d2 < best) {
        best = d2;
        s = (arc[i] + q * sl) / total;
        a = Math.sqrt(d2) / L * (sx * (py - ay) - sy * (px - ax) >= 0 ? 1 : -1);
        past = 0;
      }
    }
    const aa = Math.abs(a);
    const w = halfWidth2(s);
    out.au = s;
    out.av = a;
    if (past > 0) return false;
    const pect = s > 0.17 && s < 0.34 && aa < w + 0.1 * finBeat * Math.sin((s - 0.17) / 0.17 * Math.PI);
    const pelvic = s > 0.48 && s < 0.6 && aa < w + 0.05 * Math.sin((s - 0.48) / 0.12 * Math.PI);
    if (aa > w) return (pect || pelvic) && ink(out, ...fin, INK_GLASS, "-=");
    if (s > 0.82) {
      if (s > 0.93 && aa < (s - 0.93) / 0.07 * 0.06) return false;
      return ink(out, ...fin, INK_GLASS, s > 0.9 ? "/\\" : "=");
    }
    const patch = blotch(s, a, seed) > 0.25;
    const across2 = aa / w;
    switch (variety) {
      case "kohaku":
        return patch && s < 0.8 ? ink(out, ...RED) : ink(out, ...white);
      case "sanke":
        if (hash3(Math.round(s * 30), Math.round(a * 60), f.id) > 0.9 && s > 0.15) return ink(out, ...BLACK2, INK_DARK);
        return patch && s < 0.8 ? ink(out, ...RED) : ink(out, ...white);
      case "showa":
        if (blotch(s, a, seed + 4) > 0.55) return ink(out, ...white);
        return patch ? ink(out, ...RED) : ink(out, ...BLACK2, INK_DARK, "%#");
      case "ogon":
        return ink(out, ...GOLD, INK_SHIMMER);
      default:
        return ink(out, ORANGE[0] * (1 - 0.15 * across2), ORANGE[1] * (1 - 0.15 * across2), ORANGE[2], INK_SHIMMER);
    }
  });
  const across = halfWidth2(0.09) * 0.55 * L;
  if (2 * across >= pen.cw) {
    const along = 0.09 * total;
    let i = 0;
    while (i < NODES - 2 && arc[i + 1] < along) i++;
    const sl = arc[i + 1] - arc[i] || 1;
    const q = (along - arc[i]) / sl;
    const dx = (spine[i * 2 + 2] - spine[i * 2]) / sl;
    const dy = (spine[i * 2 + 3] - spine[i * 2 + 1]) / sl;
    const hx = spine[i * 2] + dx * q * sl;
    const hy = spine[i * 2 + 1] + dy * q * sl;
    for (const side of [-1, 1]) pen.spot(hx - dy * across * side, hy + dx * across * side, "\u25CF", GLINT4, EYE4, f.depth);
  }
  pen.shed(spine[(NODES - 2) * 2], spine[(NODES - 2) * 2 + 1], 0.02 * f.depth);
}

// src/animals/index.ts
var ANIMALS = {
  butterflies,
  koi,
  jellyfish,
  dragonflies,
  frogs,
  cranes,
  crabs
};
var ANIMAL_KEYS = Object.keys(ANIMALS);

// src/engine.ts
var STEP = 1 / 60;
var resolve = (animal) => typeof animal === "string" ? ANIMALS[animal] : animal;
var MAX_STEPS = 4;
var AnimalEngine = class {
  /** count pins the population; tuning overrides any of the animal's defaults. */
  constructor(canvas, {
    animal = "butterflies",
    count,
    theme = "light",
    tuning,
    background
  } = {}) {
    this.canvas = canvas;
    /** The current animal's live knobs; change them through set() so resizes and repaints happen. */
    __publicField(this, "tuning");
    __publicField(this, "animal");
    __publicField(this, "flock");
    __publicField(this, "renderer");
    __publicField(this, "count");
    __publicField(this, "raf", 0);
    __publicField(this, "last", 0);
    __publicField(this, "acc", 0);
    __publicField(this, "visible", true);
    __publicField(this, "reducedMotion");
    __publicField(this, "resizeObserver");
    __publicField(this, "intersectionObserver");
    __publicField(this, "disposed", false);
    __publicField(this, "frame", (now) => {
      const dt = Math.min(0.1, (now - this.last) / 1e3);
      this.last = now;
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.flock.step(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps === MAX_STEPS) this.acc = 0;
      this.renderer.render(this.flock, dt);
      this.raf = requestAnimationFrame(this.frame);
    });
    __publicField(this, "onMotionPreference", () => {
      if (this.reducedMotion.matches) {
        cancelAnimationFrame(this.raf);
        this.drawStill();
      } else {
        this.schedule();
      }
    });
    __publicField(this, "onPointerDown", (e) => {
      if (this.reducedMotion.matches || e.target !== this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      this.flock.startle(e.clientX - rect.left, e.clientY - rect.top);
    });
    this.count = count;
    this.animal = resolve(animal);
    this.tuning = { ...this.animal.defaults, ...tuning };
    this.flock = new Flock(this.animal, this.tuning, count);
    this.renderer = new AsciiRenderer(canvas, this.tuning);
    this.renderer.setFontFamily(getComputedStyle(canvas).fontFamily);
    this.renderer.setAnimal(this.animal, this.tuning);
    if (background) this.renderer.setBackground(background);
    this.renderer.setTheme(theme);
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.schedule();
    });
    this.intersectionObserver.observe(canvas);
    this.reducedMotion.addEventListener("change", this.onMotionPreference);
    window.addEventListener("pointerdown", this.onPointerDown, { passive: true });
    this.resize();
    document.fonts?.load(`600 16px ${getComputedStyle(canvas).fontFamily}`).then(() => {
      if (!this.disposed && this.reducedMotion.matches) this.drawStill();
    });
    this.schedule();
  }
  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.reducedMotion.removeEventListener("change", this.onMotionPreference);
    window.removeEventListener("pointerdown", this.onPointerDown);
  }
  /** Swap in another animal with its own defaults (plus any overrides); the screen fills with it at once. */
  setAnimal(animal, tuning) {
    this.animal = resolve(animal);
    this.tuning = { ...this.animal.defaults, ...tuning };
    this.flock = new Flock(this.animal, this.tuning, this.count);
    this.renderer.setAnimal(this.animal, this.tuning);
    this.resize();
  }
  set(key, value) {
    this.tuning[key] = value;
    if (key === "detail") this.resize();
    else if (key === "hueShift" || key === "grid") this.renderer.restyle();
    if (this.reducedMotion.matches) this.drawStill();
  }
  setTheme(theme) {
    this.renderer.setTheme(theme);
    if (this.reducedMotion.matches) this.drawStill();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.resize(rect.width, rect.height, dpr);
    this.flock.resize(rect.width, rect.height);
    if (this.reducedMotion.matches) this.drawStill();
  }
  schedule() {
    cancelAnimationFrame(this.raf);
    if (this.disposed || !this.visible || this.reducedMotion.matches) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
  /** Reduced motion: let the animals spread out, then show a single frame. */
  drawStill() {
    if (this.flock.time < 4) {
      for (let i = 0; i < 240; i++) this.flock.step(STEP);
    }
    this.renderer.render(this.flock, STEP);
  }
};
export {
  ANIMALS,
  ANIMAL_KEYS,
  AnimalEngine,
  AsciiRenderer,
  SHARED_CONTROLS,
  SHARED_TUNING,
  paintGrid
};
