// The kit every figure is built from: paper materials with an ink line, a
// paper Microduck with the robot's fourteen joints in the robot's own order,
// boards, Duck Cards, charts, bars, arrows and the little helpers for timing.
//
// UNITS. One unit is one CSS pixel on the page: a page is 600 by 780. A figure
// is built around its page's centre, y is up off the paper, x runs left to right
// across the page and z runs from the top of the page (negative) toward the
// reader (positive).
//
// THE DUCK IS AN ORIGINAL DRAWING. It is a paper toy with the robot's joint
// layout, not a model of Pollen Robotics' design: their meshes are theirs, and
// none of them is used here.

import * as THREE from '../vendor/three.module.min.js';
import { CSS3DObject, CSS3DSprite } from '../vendor/CSS3DRenderer.js';

export { THREE, CSS3DObject, CSS3DSprite };

export const PAGE = { w: 600, h: 780 };

export const COL = {
  ink: 0x2b2620,
  paper: 0xfbf6ea,
  cream: 0xf6eedb,
  shell: 0xf3ead6,
  orange: 0xff9500,
  beak: 0xf0892a,
  blue: 0x2a64c9,
  teal: 0x0b777a,
  purple: 0x7044c2,
  green: 0x1b6e3e,
  graphite: 0x3c3c44,
  yellow: 0xf2c230,
  red: 0xd8432e,
  pond: 0x63aedb,
  grass: 0x9cc98a,
  wood: 0xc99a64,
  sky: 0xc9e6f5,
  pink: 0xf1a3b5,
  gray: 0xa9a49a,
  slate: 0x6d7b8c,
};

// Duck Cards' category colours, from the deck's own stylesheet.
export const CARD_COLORS = {
  walk: '#2a64c9', speed: '#0b777a', look: '#7044c2', trick: '#ff9500',
  sound: '#1b6e3e', control: '#3c3c44', when: '#f2c230', yours: '#ffffff',
};

// ---------------------------------------------------------------- timing

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, u) => a + (b - a) * u;
// The part of u that falls between a and b, as 0..1.
export const seg = (u, a, b) => clamp((u - a) / (b - a));
export const ease = {
  linear: (u) => u,
  in: (u) => u * u,
  out: (u) => 1 - (1 - u) * (1 - u),
  inOut: (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2),
  back: (u) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
  },
  // a soft settle, for things that land
  land: (u) => 1 - Math.pow(1 - u, 3),
};

// A small seeded generator, so a figure plays the same way every time.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- materials

let toonRamp = null;
function ramp() {
  if (toonRamp) return toonRamp;
  const data = new Uint8Array([120, 200, 255]);
  toonRamp = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  toonRamp.minFilter = THREE.NearestFilter;
  toonRamp.magFilter = THREE.NearestFilter;
  toonRamp.generateMipmaps = false;
  toonRamp.needsUpdate = true;
  return toonRamp;
}

const matCache = new Map();
// A matte paper colour with three tones of shade, like a printed cut-out.
export function paper(color = COL.paper, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!opts.unique && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: ramp(), ...opts.params });
  if (opts.transparent) { m.transparent = true; m.opacity = opts.opacity ?? 1; }
  if (opts.side) m.side = opts.side;
  if (!opts.unique) matCache.set(key, m);
  return m;
}

// A flat, unlit colour, for glows, marks and lines.
export function flat(color, opts = {}) {
  return new THREE.MeshBasicMaterial({ color, transparent: !!opts.transparent, opacity: opts.opacity ?? 1, side: opts.side ?? THREE.FrontSide, depthWrite: opts.depthWrite ?? true });
}

// The ink line. Every solid gets a slightly larger copy of itself drawn from
// the inside, so its silhouette carries a pen line wherever it is seen from.
const OUTLINE_VS = `
attribute vec3 outlineNormal;
uniform float width;
void main() {
  vec3 p = position + outlineNormal * width;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const OUTLINE_FS = `
uniform vec3 color;
uniform float opacity;
void main() {
  gl_FragColor = vec4(color, opacity);
  #include <colorspace_fragment>
}`;
const outlineCache = new Map();
function outlineMaterial(width, color) {
  const key = width + ':' + color;
  if (outlineCache.has(key)) return outlineCache.get(key);
  const m = new THREE.ShaderMaterial({
    vertexShader: OUTLINE_VS,
    fragmentShader: OUTLINE_FS,
    uniforms: { width: { value: width }, color: { value: new THREE.Color(color) }, opacity: { value: 1 } },
    side: THREE.BackSide,
  });
  outlineCache.set(key, m);
  return m;
}

export function addOutlineNormals(geo) {
  if (geo.getAttribute('outlineNormal')) return geo;
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const n = pos.count;
  const sums = new Map();
  const keyOf = (i) => Math.round(pos.getX(i) * 50) + ',' + Math.round(pos.getY(i) * 50) + ',' + Math.round(pos.getZ(i) * 50);
  for (let i = 0; i < n; i++) {
    const k = keyOf(i);
    let s = sums.get(k);
    if (!s) { s = [0, 0, 0]; sums.set(k, s); }
    s[0] += nor.getX(i); s[1] += nor.getY(i); s[2] += nor.getZ(i);
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = sums.get(keyOf(i));
    const l = Math.hypot(s[0], s[1], s[2]) || 1;
    out[i * 3] = s[0] / l; out[i * 3 + 1] = s[1] / l; out[i * 3 + 2] = s[2] / l;
  }
  geo.setAttribute('outlineNormal', new THREE.BufferAttribute(out, 3));
  return geo;
}

// A solid with a pen line round it. Returns the mesh; the line is its child.
export function solid(geo, color = COL.paper, opts = {}) {
  const mat = opts.material || paper(color, opts);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = opts.shadow !== false;
  mesh.receiveShadow = opts.receive !== false;
  if (opts.line !== false) {
    addOutlineNormals(geo);
    const line = new THREE.Mesh(geo, outlineMaterial(opts.lineWidth ?? 1.6, opts.lineColor ?? COL.ink));
    line.castShadow = false;
    line.receiveShadow = false;
    line.userData.isOutline = true;
    line.raycast = () => {};
    mesh.add(line);
  }
  return mesh;
}

// ---------------------------------------------------------------- shapes

export function roundBox(w, h, d, r = 6, s = 3) {
  const geo = new THREE.BoxGeometry(w, h, d, s * 2, s * 2, s * 2);
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    c.set(clamp(v.x, -hw, hw), clamp(v.y, -hh, hh), clamp(v.z, -hd, hd));
    n.subVectors(v, c);
    if (n.lengthSq() < 1e-9) n.fromBufferAttribute(nor, i);
    n.normalize();
    v.copy(c).addScaledVector(n, r);
    pos.setXYZ(i, v.x, v.y, v.z);
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  return geo;
}

export const box = (w, h, d, color, opts) => solid(roundBox(w, h, d, opts?.r ?? Math.min(4, w / 4, h / 4, d / 4), 2), color, opts);
export const ball = (r, color, opts) => solid(new THREE.SphereGeometry(r, 24, 16), color, opts);
export const capsule = (r, len, color, opts) => solid(new THREE.CapsuleGeometry(r, len, 6, 14), color, opts);
export const cylinder = (rt, rb, h, color, opts) => solid(new THREE.CylinderGeometry(rt, rb, h, opts?.seg ?? 28), color, opts);
export const cone = (r, h, color, opts) => solid(new THREE.ConeGeometry(r, h, opts?.seg ?? 24), color, opts);
export const torus = (r, t, color, opts) => solid(new THREE.TorusGeometry(r, t, 10, 36), color, opts);

// A flat disc lying on the page, for spots, ponds and shadows.
export function disc(r, color, opts = {}) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), opts.material || flat(color, opts));
  m.rotation.x = -Math.PI / 2;
  m.position.y = opts.y ?? 0.6;
  m.receiveShadow = !!opts.receive;
  return m;
}

// A ring lying on the page.
export function ringFlat(r1, r2, color, opts = {}) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r1, r2, 48), flat(color, opts));
  m.rotation.x = -Math.PI / 2;
  m.position.y = opts.y ?? 0.8;
  return m;
}

// Move a mesh's geometry so its origin is where it touches the page.
export function sitOnPage(obj, h) {
  obj.position.y = h / 2;
  return obj;
}

// ---------------------------------------------------------------- canvas faces

export function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const api = {
    canvas, ctx, tex,
    redraw(fn = draw) { ctx.clearRect(0, 0, w, h); fn(ctx, w, h); tex.needsUpdate = true; },
  };
  if (draw) api.redraw(draw);
  return api;
}

export const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif';
export const ROUND = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const CARD_FACE = '"Fredoka", ' + ROUND;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export { rr as roundRectPath };

// A paper sign: a standing card with words on it.
export function sign(text, opts = {}) {
  const w = opts.w ?? 180, h = opts.h ?? 64, px = 2;
  const draw = (ctx, cw, ch) => {
    ctx.fillStyle = opts.bg ?? '#fffaf0';
    rr(ctx, 3, 3, cw - 6, ch - 6, 14 * px);
    ctx.fill();
    ctx.lineWidth = 3 * px;
    ctx.strokeStyle = '#2b2620';
    ctx.stroke();
    ctx.fillStyle = opts.color ?? '#2b2620';
    ctx.font = `${opts.weight ?? 650} ${(opts.size ?? 26) * px}px ${opts.font ?? ROUND}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = String(text).split('\n');
    const lh = (opts.size ?? 26) * px * 1.15;
    lines.forEach((ln, i) => ctx.fillText(ln, cw / 2, ch / 2 + (i - (lines.length - 1) / 2) * lh));
  };
  const face = canvasTexture(w * px, h * px, draw);
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), [
    paper(COL.paper), paper(COL.paper), paper(COL.paper), paper(COL.paper),
    new THREE.MeshToonMaterial({ map: face.tex, gradientMap: ramp() }), paper(COL.paper),
  ]);
  m.position.y = h / 2;
  m.castShadow = true;
  g.add(m);
  g.userData.face = face;
  g.userData.setText = (t, o = {}) => { Object.assign(opts, o); text = t; face.redraw(draw); };
  return g;
}

// ---------------------------------------------------------------- Duck Cards

// The pictures are simple marks drawn here, not the deck's own art.
function glyph(ctx, id, cx, cy, s, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s / 100, s / 100);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const arrowHead = (x, y, ang) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-22, -16); ctx.lineTo(-22, 16); ctx.closePath(); ctx.fill();
    ctx.restore();
  };
  switch (id) {
    case 'walk_forward':
      ctx.beginPath(); ctx.moveTo(0, 36); ctx.lineTo(0, -18); ctx.stroke(); arrowHead(0, -40, -Math.PI / 2); break;
    case 'walk_backward':
      ctx.beginPath(); ctx.moveTo(0, -36); ctx.lineTo(0, 18); ctx.stroke(); arrowHead(0, 40, Math.PI / 2); break;
    case 'turn_left':
      ctx.beginPath(); ctx.arc(0, 8, 30, 0.1 * Math.PI, -1.0 * Math.PI, true); ctx.stroke(); arrowHead(-30, 6, Math.PI / 2 + 0.2); break;
    case 'turn_right':
      ctx.beginPath(); ctx.arc(0, 8, 30, 0.9 * Math.PI, 2.0 * Math.PI, false); ctx.stroke(); arrowHead(30, 6, Math.PI / 2 - 0.2); break;
    case 'stop':
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; ctx.lineTo(Math.cos(a) * 36, Math.sin(a) * 36); }
      ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.stroke(); break;
    case 'repeat':
      ctx.beginPath(); ctx.arc(0, 0, 30, -0.3, 1.6 * Math.PI); ctx.stroke(); arrowHead(29, -9, Math.PI / 2 + 0.3); break;
    case 'end_repeat':
      ctx.beginPath(); ctx.arc(0, 0, 30, -0.3, 1.6 * Math.PI); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.stroke(); break;
    case 'start':
      ctx.beginPath(); ctx.moveTo(-18, -30); ctx.lineTo(28, 0); ctx.lineTo(-18, 30); ctx.closePath(); ctx.fill(); break;
    case 'end':
      ctx.fillRect(-26, -26, 52, 52); break;
    case 'when_falls':
      ctx.beginPath(); ctx.moveTo(-34, -22); ctx.lineTo(-8, -2); ctx.lineTo(-20, 8); ctx.lineTo(18, 34); ctx.stroke(); arrowHead(26, 40, 0.75); break;
    case 'sit_or_stand':
      ctx.beginPath(); ctx.moveTo(-24, -30); ctx.lineTo(-24, 30); ctx.lineTo(24, 30); ctx.stroke(); arrowHead(24, -6, -Math.PI / 2); ctx.beginPath(); ctx.moveTo(24, 26); ctx.lineTo(24, 4); ctx.stroke(); break;
    case 'chirp': case 'greet': case 'coo': case 'alarm': case 'wheee':
      for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(-26, 0, i * 16, -0.7, 0.7); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(-30, 0, 8, 0, Math.PI * 2); ctx.fill(); break;
    case 'kick_right': case 'kick_left':
      ctx.beginPath(); ctx.arc(14, 8, 18, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-36, -30); ctx.lineTo(-10, 4); ctx.stroke(); break;
    case 'peck_ground':
      ctx.beginPath(); ctx.moveTo(-30, -30); ctx.lineTo(10, 24); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-36, 34); ctx.lineTo(36, 34); ctx.stroke(); break;
    case 'slow':
      ctx.beginPath(); ctx.arc(0, 4, 32, Math.PI, 2 * Math.PI); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(-20, -14); ctx.stroke(); break;
    case 'fast':
      ctx.beginPath(); ctx.arc(0, 4, 32, Math.PI, 2 * Math.PI); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(22, -14); ctx.stroke(); break;
    default:
      ctx.setLineDash([10, 10]); ctx.strokeRect(-30, -30, 60, 60); ctx.setLineDash([]);
  }
  ctx.restore();
}

// card = { id: 'walk_forward', name: 'Walk forward', code: 0, cat: 'walk' }
export function duckCard(card, opts = {}) {
  const w = opts.w ?? 72, h = opts.h ?? 100, px = 4;
  const color = CARD_COLORS[card.cat] || '#ffffff';
  const light = card.cat === 'trick' || card.cat === 'when' || card.cat === 'yours';
  const face = canvasTexture(w * px, h * px, (ctx, cw, ch) => {
    ctx.fillStyle = '#ffffff';
    rr(ctx, 0, 0, cw, ch, 9 * px); ctx.fill();
    ctx.save(); rr(ctx, 0, 0, cw, ch, 9 * px); ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, cw, 16 * px);
    ctx.restore();
    ctx.fillStyle = light ? '#1d1d1f' : '#ffffff';
    ctx.font = `600 ${8 * px}px ${CARD_FACE}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(card.band ?? cap(card.cat), 6 * px, 8.5 * px);
    const tint = { walk: '#e6eefc', speed: '#ddf2f1', look: '#efe8fb', trick: '#fff1dc', sound: '#e2f3e8', control: '#ebebf0', when: '#fcf3d2', yours: '#ffffff' }[card.cat] || '#eeeeee';
    ctx.fillStyle = tint;
    ctx.beginPath(); ctx.arc(cw / 2, 42 * px, 20 * px, 0, Math.PI * 2); ctx.fill();
    const ink = { trick: '#a65a00', when: '#8a6400', yours: '#5c5c64' }[card.cat] || color;
    glyph(ctx, card.id, cw / 2, 42 * px, 28 * px, ink);
    ctx.fillStyle = '#1d1d1f';
    ctx.font = `600 ${10.5 * px}px ${CARD_FACE}`;
    ctx.textAlign = 'center';
    const words = String(card.name).split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width > cw - 10 * px && line) { lines.push(line); line = word; } else line = t;
    }
    if (line) lines.push(line);
    lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, cw / 2, (73 + i * 11) * px));
    if (card.code !== undefined) {
      ctx.fillStyle = '#5c5c64';
      ctx.font = `500 ${7 * px}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(String(card.code), cw - 6 * px, ch - 7 * px);
    }
    ctx.strokeStyle = '#c7c7cf';
    ctx.lineWidth = 1.5 * px;
    rr(ctx, 1, 1, cw - 2, ch - 2, 9 * px); ctx.stroke();
  });
  const g = new THREE.Group();
  const body = new THREE.Mesh(roundBox(w, 2.4, h, 1.1, 1), paper(0xffffff));
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.6, h - 0.6), new THREE.MeshToonMaterial({ map: face.tex, gradientMap: ramp(), transparent: true }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = 1.31;
  top.receiveShadow = true;
  g.add(top);
  g.userData.card = card;
  g.userData.w = w;
  g.userData.h = h;
  g.userData.body = body;
  return g;
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

export const CARDS = {
  walk_forward: { id: 'walk_forward', name: 'Walk forward', code: 0, cat: 'walk' },
  walk_backward: { id: 'walk_backward', name: 'Walk back', code: 1, cat: 'walk' },
  turn_left: { id: 'turn_left', name: 'Turn left', code: 2, cat: 'walk' },
  turn_right: { id: 'turn_right', name: 'Turn right', code: 3, cat: 'walk' },
  stop: { id: 'stop', name: 'Stop', code: 4, cat: 'walk' },
  slow: { id: 'slow', name: 'Slow', code: 20, cat: 'speed' },
  fast: { id: 'fast', name: 'Fast', code: 21, cat: 'speed' },
  kick_right: { id: 'kick_right', name: 'Kick, right', code: 61, cat: 'trick' },
  sit_or_stand: { id: 'sit_or_stand', name: 'Sit or stand', code: 62, cat: 'trick' },
  peck_ground: { id: 'peck_ground', name: 'Peck the ground', code: 64, cat: 'trick' },
  greet: { id: 'greet', name: 'Hello', code: 80, cat: 'sound' },
  chirp: { id: 'chirp', name: 'Chirp', code: 81, cat: 'sound' },
  alarm: { id: 'alarm', name: 'Alarm', code: 83, cat: 'sound' },
  start: { id: 'start', name: 'Start', code: 100, cat: 'control' },
  end: { id: 'end', name: 'End', code: 101, cat: 'control' },
  repeat: { id: 'repeat', name: 'Repeat times', code: 102, cat: 'control' },
  end_repeat: { id: 'end_repeat', name: 'End repeat', code: 103, cat: 'control' },
  when_falls: { id: 'when_falls', name: 'When it falls', code: 120, cat: 'when' },
  yours: { id: 'card_1', name: 'Your card', code: 200, cat: 'yours' },
};

// ---------------------------------------------------------------- the board

// cols x rows squares. Row 0 is the far edge of the page (north).
export class Board {
  constructor({ cols = 3, rows = 3, cell = 110, base = COL.cream, alt = 0xefe3c8, line = COL.ink, thick = 10 } = {}) {
    this.cols = cols; this.rows = rows; this.cell = cell;
    this.group = new THREE.Group();
    const W = cols * cell, H = rows * cell;
    const slab = solid(roundBox(W + 18, thick, H + 18, 4, 2), base);
    slab.position.y = thick / 2;
    this.group.add(slab);
    this.top = thick;
    this.tiles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = new THREE.Mesh(new THREE.PlaneGeometry(cell - 4, cell - 4), paper((r + c) % 2 ? alt : base, { unique: true }));
        t.rotation.x = -Math.PI / 2;
        const p = this.at(c, r);
        t.position.set(p.x, thick + 0.3, p.z);
        t.receiveShadow = true;
        t.userData.base = t.material.color.getHex();
        this.group.add(t);
        this.tiles.push(t);
      }
    }
    const lineMat = flat(line);
    for (let i = 0; i <= cols; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, H), lineMat);
      b.position.set(-W / 2 + i * cell, thick + 0.5, 0);
      this.group.add(b);
    }
    for (let j = 0; j <= rows; j++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(W, 0.6, 2), lineMat);
      b.position.set(0, thick + 0.5, -H / 2 + j * cell);
      this.group.add(b);
    }
  }
  at(c, r, y = 0) {
    return new THREE.Vector3((c - (this.cols - 1) / 2) * this.cell, (this.top ?? 10) + y, (r - (this.rows - 1) / 2) * this.cell);
  }
  tile(c, r) { return this.tiles[r * this.cols + c]; }
  paint(c, r, color) { const t = this.tile(c, r); if (t) t.material.color.setHex(color ?? t.userData.base); }
  clearPaint() { for (const t of this.tiles) t.material.color.setHex(t.userData.base); }
}

// Headings on a board: 0 north (toward the top of the page), 1 east, 2 south, 3 west.
export const HEADING = [
  { dc: 0, dr: -1, yaw: Math.PI / 2 },
  { dc: 1, dr: 0, yaw: 0 },
  { dc: 0, dr: 1, yaw: -Math.PI / 2 },
  { dc: -1, dr: 0, yaw: Math.PI },
];

// Play a row of cards on a board with the paper rule: one Walk card is one
// square, one Turn card is a quarter turn. Returns every state along the way.
export function playRow(row, start) {
  const states = [{ ...start, card: null }];
  let s = { ...start };
  const exec = (cards) => {
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      if (c.id === 'repeat') {
        const times = c.times ?? 2;
        let depth = 1, j = i + 1;
        while (j < cards.length && depth) { if (cards[j].id === 'repeat') depth++; if (cards[j].id === 'end_repeat') depth--; j++; }
        const body = cards.slice(i + 1, j - 1);
        for (let k = 0; k < times; k++) exec(body);
        i = j - 1;
        continue;
      }
      if (c.id === 'walk_forward' || c.id === 'walk_backward') {
        const d = HEADING[s.h], sign = c.id === 'walk_forward' ? 1 : -1;
        s = { ...s, c: s.c + d.dc * sign, r: s.r + d.dr * sign };
      } else if (c.id === 'turn_left') s = { ...s, h: (s.h + 3) % 4 };
      else if (c.id === 'turn_right') s = { ...s, h: (s.h + 1) % 4 };
      else if (c.id === 'start' || c.id === 'end' || c.id === 'end_repeat') continue;
      states.push({ ...s, card: c });
    }
  };
  exec(row);
  return states;
}

// ---------------------------------------------------------------- the duck

export const JOINTS = [
  'left_hip_yaw', 'left_hip_roll', 'left_hip_pitch', 'left_knee', 'left_ankle',
  'neck_pitch', 'head_pitch', 'head_yaw', 'head_roll',
  'right_hip_yaw', 'right_hip_roll', 'right_hip_pitch', 'right_knee', 'right_ankle',
];

// In this rig every joint's zero is the standing pose. hip_pitch positive
// swings the foot forward, knee positive folds the shin back like a bird's,
// ankle positive lifts the toes, neck and head pitch positive tip down.
const LEG = { thigh: 52, shin: 54, hipY: 116, footH: 9 };

export class Duck {
  constructor(opts = {}) {
    this.opts = opts;
    const body = opts.body ?? COL.shell;
    const accent = opts.accent ?? COL.orange;
    this.root = new THREE.Group();          // moves on the page
    this.tip = new THREE.Group();            // tips over, about a foot edge
    this.root.add(this.tip);
    this.hips = new THREE.Group();           // everything above the ground
    this.tip.add(this.hips);
    this.joints = [];
    this.rings = [];
    this.angles = new Array(14).fill(0);
    this.home = new Array(14).fill(0);

    // trunk
    this.trunk = new THREE.Group();
    this.trunk.position.y = LEG.hipY;
    this.hips.add(this.trunk);
    const shell = solid(roundBox(118, 74, 98, 30, 4), body);
    shell.position.set(0, 40, 0);
    this.trunk.add(shell);
    this.shell = shell;
    const tail = solid(roundBox(30, 22, 44, 10, 2), body);
    tail.position.set(-62, 58, 0);
    tail.rotation.z = 0.5;
    this.trunk.add(tail);
    const belly = solid(roundBox(70, 10, 74, 5, 2), 0xe6dcc5);
    belly.position.set(4, 4, 0);
    this.trunk.add(belly);

    // the IMU and the computer, shown when a lesson asks for them
    this.imu = solid(roundBox(16, 8, 16, 3, 1), COL.yellow, { lineWidth: 1 });
    this.imu.position.set(-6, 42, 50);
    this.imu.visible = false;
    this.trunk.add(this.imu);
    this.brain = solid(roundBox(30, 20, 4, 3, 1), COL.green, { lineWidth: 1 });
    this.brain.position.set(22, 46, 50.5);
    this.brain.visible = false;
    this.trunk.add(this.brain);

    // legs: left is -z, right is +z (the duck faces +x)
    const leg = (side) => {
      const z = side * 30;
      const yaw = new THREE.Group(); yaw.position.set(4, 0, z);
      const roll = new THREE.Group(); yaw.add(roll);
      const pitch = new THREE.Group(); roll.add(pitch);
      const thigh = capsule(10.5, LEG.thigh - 10, body);
      thigh.position.y = -LEG.thigh / 2;
      pitch.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -LEG.thigh; pitch.add(knee);
      const shin = capsule(8.5, LEG.shin - 8, accent);
      shin.position.y = -LEG.shin / 2;
      knee.add(shin);
      const ankle = new THREE.Group(); ankle.position.y = -LEG.shin; knee.add(ankle);
      const foot = solid(roundBox(62, LEG.footH, 36, 4, 2), accent);
      foot.position.set(10, -1, 0);
      ankle.add(foot);
      this.trunk.add(yaw);
      return { yaw, roll, pitch, knee, ankle, foot };
    };
    this.left = leg(-1);
    this.right = leg(1);

    // neck and head
    const neckPitch = new THREE.Group(); neckPitch.position.set(40, 66, 0); this.trunk.add(neckPitch);
    const neck = capsule(13, 40, body);
    neck.position.y = 26;
    neckPitch.add(neck);
    const headPitch = new THREE.Group(); headPitch.position.y = 54; neckPitch.add(headPitch);
    const headYaw = new THREE.Group(); headPitch.add(headYaw);
    const headRoll = new THREE.Group(); headYaw.add(headRoll);
    const head = solid(new THREE.SphereGeometry(38, 28, 20), body);
    head.scale.set(1.12, 0.92, 0.96);
    head.position.set(10, 22, 0);
    headRoll.add(head);
    this.head = head;
    const eyeMat = paper(COL.ink);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(5.2, 12, 10), eyeMat);
      eye.position.set(30, 30, s * 22);
      headRoll.add(eye);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), flat(0xffffff));
      glint.position.set(34, 32.5, s * 24.5);
      headRoll.add(glint);
    }
    const beakTop = solid(roundBox(40, 11, 34, 5, 2), COL.beak);
    beakTop.position.set(54, 16, 0);
    headRoll.add(beakTop);
    this.jaw = new THREE.Group(); this.jaw.position.set(34, 9, 0); headRoll.add(this.jaw);
    const beakLow = solid(roundBox(36, 7, 30, 3, 2), 0xdc7420);
    beakLow.position.set(18, -2, 0);
    this.jaw.add(beakLow);

    this.parts = { neckPitch, headPitch, headYaw, headRoll };
    this.joints = [
      this.left.yaw, this.left.roll, this.left.pitch, this.left.knee, this.left.ankle,
      neckPitch, headPitch, headYaw, headRoll,
      this.right.yaw, this.right.roll, this.right.pitch, this.right.knee, this.right.ankle,
    ];
    // which axis each joint turns about, in its parent's frame
    this.axes = ['y', 'x', 'z', 'z', 'z', 'z', 'z', 'y', 'x', 'y', 'x', 'z', 'z', 'z'];
    this.signs = [1, 1, 1, -1, 1, -1, -1, 1, 1, 1, 1, 1, -1, 1];
    this.base = this.joints.map((j) => j.rotation.clone());

    // a standing pose with bent knees, so the duck looks alive
    this.stand = [0, 0, 0.32, 0.62, 0.3, 0.12, -0.1, 0, 0, 0, 0, 0.32, 0.62, 0.3];
    this.setJoints(this.stand);
    if (opts.scale) this.root.scale.setScalar(opts.scale);
    // a see-through duck, for a pose the real one is aiming at
    if (opts.ghost) {
      const glass = new THREE.MeshBasicMaterial({ color: opts.ghost === true ? 0x6ea2ff : opts.ghost, transparent: true, opacity: 0.32, depthWrite: false });
      this.root.traverse((o) => {
        if (!o.isMesh) return;
        if (o.userData.isOutline) { o.visible = false; return; }
        o.material = glass;
        o.castShadow = false;
      });
      this.imu.visible = this.brain.visible = false;
    }
  }

  setJoints(a) {
    for (let i = 0; i < 14; i++) {
      const v = a[i] ?? 0;
      this.angles[i] = v;
      const j = this.joints[i];
      const b = this.base[i];
      j.rotation.set(b.x, b.y, b.z);
      j.rotation[this.axes[i]] += v * this.signs[i];
    }
    this.fitToGround();
  }

  // Keep the lower foot on the page whatever the legs are doing.
  fitToGround() {
    this.hips.position.y = 0;
    this.root.updateMatrixWorld(true);
    const lo = Math.min(this._footBottom(this.left), this._footBottom(this.right));
    this.hips.position.y = -lo;
  }

  _footBottom(leg) {
    const v = new THREE.Vector3(0, -LEG.footH / 2 - 1, 0);
    leg.foot.localToWorld(v);
    this.hips.worldToLocal(v);
    return v.y + this.hips.position.y;
  }

  footWorld(side = 1) {
    const leg = side > 0 ? this.right : this.left;
    const v = new THREE.Vector3(0, -LEG.footH / 2, 0);
    leg.foot.localToWorld(v);
    return v;
  }

  // Walking, drawn by solving each leg for where its foot should be. phase
  // runs 0..1 per stride; stride is the step length; lift the swing height.
  walkPose(phase, { stride = 40, lift = 16, bob = 3, sway = 0.05, head = 0 } = {}) {
    const a = this.stand.slice();
    const legAt = (p) => {
      // stance for the first 60 percent, swing for the rest
      const st = 0.6;
      let x, y;
      if (p < st) { const u = p / st; x = stride / 2 - stride * u; y = 0; }
      else { const u = (p - st) / (1 - st); x = -stride / 2 + stride * ease.inOut(u); y = Math.sin(u * Math.PI) * lift; }
      return this.solveLeg(x, y);
    };
    const L = legAt(phase % 1), R = legAt((phase + 0.5) % 1);
    a[2] = L.hip; a[3] = L.knee; a[4] = L.ankle;
    a[11] = R.hip; a[12] = R.knee; a[13] = R.ankle;
    a[1] = Math.sin(phase * Math.PI * 2) * sway;
    a[10] = Math.sin(phase * Math.PI * 2) * sway;
    a[5] = this.stand[5] + Math.sin(phase * Math.PI * 4) * 0.04;
    a[6] = this.stand[6] - Math.sin(phase * Math.PI * 4) * 0.04 + head;
    this.setJoints(a);
  }

  // How far through its stride cycle the duck is after walking dist units, so
  // a planted foot stays planted while the duck moves.
  static phaseFor(dist, stride = 40) { return (dist * 0.6) / stride; }

  // Two-link leg: hip angle, knee fold and ankle that keep the sole flat, for a
  // foot at (x forward, y up) relative to where it stands at rest.
  solveLeg(x, y) {
    const L1 = LEG.thigh, L2 = LEG.shin;
    const rest = this._restFoot || (this._restFoot = (() => {
      const h = this.stand[2], k = this.stand[3];
      const fx = Math.sin(h) * L1 + Math.sin(h - k) * L2;
      const fy = -Math.cos(h) * L1 - Math.cos(h - k) * L2;
      return { fx, fy };
    })());
    const tx = rest.fx + x, ty = rest.fy + y;
    const d = Math.min(L1 + L2 - 0.5, Math.hypot(tx, ty));
    const cosK = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1);
    const knee = Math.PI - Math.acos(cosK);
    const base = Math.atan2(tx, -ty);
    const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const hip = base + Math.acos(cosA);
    const ankle = knee - hip;
    return { hip, knee, ankle };
  }

  // A crouch from 0 (standing) to 1 (sitting low).
  crouchPose(u) {
    const a = this.stand.slice();
    const k = lerp(0.62, 1.9, u), h = lerp(0.32, 1.05, u);
    a[2] = h; a[3] = k; a[4] = k - h;
    a[11] = h; a[12] = k; a[13] = k - h;
    a[5] = lerp(this.stand[5], -0.15, u);
    this.setJoints(a);
  }

  // Tip over: u from 0 to 1, about the toe (forward) or a foot's outer edge.
  fall(u, dir = 'forward') {
    const ang = ease.in(clamp(u)) * Math.PI * 0.47;
    this.tip.rotation.set(0, 0, 0);
    this.tip.position.set(0, 0, 0);
    this.hips.position.x = 0; this.hips.position.z = 0;
    if (dir === 'forward') {
      this.tip.position.x = 44; this.hips.position.x = -44; this.tip.rotation.z = -ang;
    } else if (dir === 'back') {
      this.tip.position.x = -26; this.hips.position.x = 26; this.tip.rotation.z = ang;
    } else {
      const s = dir === 'left' ? -1 : 1;
      this.tip.position.z = s * 52; this.hips.position.z = -s * 52; this.tip.rotation.x = s * ang;
    }
  }

  // Open the beak, 0 shut to 1 open: the mouth servo, the fifteenth.
  beak(u) { this.jaw.rotation.z = -0.55 * clamp(u); }

  // A ring round joint i, for lessons that point at one.
  ring(i, on = true, color = COL.orange) {
    if (!this.rings[i]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(i >= 5 && i <= 8 ? 19 : 15, 2.6, 8, 30), flat(color));
      const ax = this.axes[i];
      if (ax === 'z') r.rotation.set(0, 0, 0);
      if (ax === 'x') r.rotation.set(0, Math.PI / 2, 0);
      if (ax === 'y') r.rotation.set(Math.PI / 2, 0, 0);
      this.joints[i].add(r);
      this.rings[i] = r;
    }
    this.rings[i].visible = on;
    if (on) this.rings[i].material.color.setHex(color);
    return this.rings[i];
  }
  rings_off() { this.rings.forEach((r) => r && (r.visible = false)); }

  // A glowing bead on joint i. The three hip motors sit together, and so do
  // the three in the head, so their beads stack a little apart.
  dot(i, on = true, color = COL.yellow) {
    this.dots = this.dots || [];
    if (!this.dots[i]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(7.5, 14, 10), flat(color));
      const stack = { 0: 14, 1: 0, 2: -14, 9: 14, 10: 0, 11: -14, 6: -14, 7: 0, 8: 14 }[i] ?? 0;
      const side = i <= 4 ? -1 : i >= 9 ? 1 : 0;
      m.position.set(0, i >= 6 && i <= 8 ? stack + 6 : stack, side * 16 + (side === 0 ? 30 : 0));
      if (i >= 6 && i <= 8) m.position.set(-8 + (i - 7) * 14, 4, 34);
      if (i <= 2 || (i >= 9 && i <= 11)) m.position.x = 0;
      this.joints[i].add(m);
      m.renderOrder = 2;
      this.dots[i] = m;
    }
    this.dots[i].visible = on;
    if (on) this.dots[i].material.color.setHex(color);
    return this.dots[i];
  }
  dots_off() { (this.dots || []).forEach((d) => d && (d.visible = false)); }

  // A point on the duck, in world space, for labels and arrows.
  pointOn(name) {
    const v = new THREE.Vector3();
    const of = {
      imu: [this.imu, 0, 0, 0], brain: [this.brain, 0, 0, 0], head: [this.head, 0, 0, 0],
      beak: [this.jaw, 30, 0, 0], trunk: [this.shell, 0, 0, 0],
      leftFoot: [this.left.foot, 0, 0, 0], rightFoot: [this.right.foot, 0, 0, 0],
    }[name];
    if (of) { v.set(of[1], of[2], of[3]); of[0].localToWorld(v); }
    return v;
  }
}

// ---------------------------------------------------------------- many ducks

// A whole crowd of small ducks, one draw call. Each is a body, a head and a
// beak, coloured per instance.
export function duckCrowd(count, { size = 10 } = {}) {
  const parts = [];
  const add = (geo, color, x, y, z) => {
    geo.translate(x, y, z);
    const n = geo.getAttribute('position').count;
    const c = new THREE.Color(color);
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    parts.push(geo.index ? geo.toNonIndexed() : geo);
  };
  const s = size;
  add(new THREE.BoxGeometry(1.2 * s, 0.8 * s, s), 0xffffff, 0, 1.2 * s, 0);
  add(new THREE.SphereGeometry(0.42 * s, 10, 8), 0xffffff, 0.55 * s, 2.0 * s, 0);
  add(new THREE.BoxGeometry(0.42 * s, 0.14 * s, 0.32 * s), 0xff9a2e, 1.0 * s, 1.95 * s, 0);
  add(new THREE.BoxGeometry(0.16 * s, 0.8 * s, 0.16 * s), 0xff9a2e, 0, 0.4 * s, 0.28 * s);
  add(new THREE.BoxGeometry(0.16 * s, 0.8 * s, 0.16 * s), 0xff9a2e, 0, 0.4 * s, -0.28 * s);
  const geo = mergeSimple(parts);
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp() });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    dummy.position.set(0, 0, 0); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, new THREE.Color(0xf6eedb));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.userData.dummy = dummy;
  return mesh;
}

export function mergeSimple(geos) {
  let n = 0;
  for (const g of geos) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    g.computeVertexNormals();
    const p = g.getAttribute('position'), q = g.getAttribute('normal'), c = g.getAttribute('color');
    pos.set(p.array, o * 3); nor.set(q.array, o * 3);
    if (c) col.set(c.array, o * 3); else col.fill(1, o * 3, (o + p.count) * 3);
    o += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

// ---------------------------------------------------------------- arrows

// A paper ribbon arrow along a curve through points, lying just above things.
export function arrow(points, { color = COL.ink, width = 7, head = 20, lift = 0 } = {}) {
  const pts = points.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p[1] + lift, p[2])));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(16, pts.length * 12), width / 2, 8, false), paper(color));
  tube.castShadow = true;
  const g = new THREE.Group();
  g.add(tube);
  const end = curve.getPoint(1), dir = curve.getTangent(1);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(head * 0.55, head, 16), paper(color));
  tip.position.copy(end);
  tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  tip.castShadow = true;
  g.add(tip);
  g.userData.curve = curve;
  g.userData.tube = tube;
  return g;
}

// A dot that travels along a curve, for signals and data.
export function packet(color = COL.orange, r = 7) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), flat(color));
  return m;
}

// ---------------------------------------------------------------- bars

// n bars in a row, each its own colour, growing up from the page.
export class Bars {
  constructor({ n, width = 8, gap = 2, depth = 10, maxH = 120, colors = [] } = {}) {
    this.n = n; this.maxH = maxH; this.width = width; this.gap = gap;
    const geo = new THREE.BoxGeometry(width, 1, depth);
    geo.translate(0, 0.5, 0);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshToonMaterial({ gradientMap: ramp() }), n);
    this.mesh.castShadow = true;
    this.values = new Float32Array(n);
    this.span = n * width + (n - 1) * gap;
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      c.set(colors[i] ?? COL.blue);
      this.mesh.setColorAt(i, c);
    }
    this.mesh.instanceColor.needsUpdate = true;
    this.set(new Array(n).fill(0));
  }
  x(i) { return -this.span / 2 + i * (this.width + this.gap) + this.width / 2; }
  set(values, signed = false) {
    const d = new THREE.Object3D();
    for (let i = 0; i < this.n; i++) {
      const v = values[i] ?? 0;
      this.values[i] = v;
      const h = Math.max(0.5, Math.abs(v) * this.maxH);
      d.position.set(this.x(i), signed && v < 0 ? -h : 0, 0);
      d.scale.set(1, h, 1);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  color(i, hex) { this.mesh.setColorAt(i, new THREE.Color(hex)); this.mesh.instanceColor.needsUpdate = true; }
}

// ---------------------------------------------------------------- charts

// A tick prints the way the pages print numbers: 1,000, not 1000.
// scripts/check_books.py reads tick arrays and expects exactly this.
const tick = (t) => Number(t).toLocaleString('en-US', { maximumFractionDigits: 6 });

// A chart printed on a standing paper card. series: [{ points:[[x,y]], color, upto }]
export class Chart {
  constructor({ w = 300, h = 190, x = [0, 1], y = [0, 1], title = '', xLabel = '', yLabel = '', px = 3, stand = true } = {}) {
    Object.assign(this, { w, h, xr: x, yr: y, title, xLabel, yLabel, px });
    this.series = [];
    this.marks = [];
    this.face = canvasTexture(w * px, h * px, () => {});
    this.group = new THREE.Group();
    const card = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), [
      paper(COL.paper), paper(COL.paper), paper(COL.paper), paper(COL.paper),
      new THREE.MeshToonMaterial({ map: this.face.tex, gradientMap: ramp() }), paper(COL.paper),
    ]);
    card.castShadow = true;
    if (stand) { card.position.y = h / 2; } else { card.rotation.x = -Math.PI / 2; card.position.y = 2; }
    this.card = card;
    this.group.add(card);
    this.draw();
  }
  plot(series) { this.series = series; this.draw(); }
  draw() {
    const { w, h, px } = this;
    const L = 46 * px, R = 24 * px, T = (this.title ? 30 : 14) * px, B = 34 * px;
    const cw = w * px, ch = h * px;
    this.face.redraw((ctx) => {
      ctx.fillStyle = '#fffaf0';
      ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = '#2b2620';
      ctx.lineWidth = 3 * px;
      ctx.strokeRect(1.5 * px, 1.5 * px, cw - 3 * px, ch - 3 * px);
      ctx.fillStyle = '#2b2620';
      ctx.font = `650 ${14 * px}px ${ROUND}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      if (this.title) ctx.fillText(this.title, L, 8 * px);
      ctx.strokeStyle = '#8a8478';
      ctx.lineWidth = 1.5 * px;
      ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, ch - B); ctx.lineTo(cw - R, ch - B); ctx.stroke();
      ctx.fillStyle = '#5c574e';
      ctx.font = `500 ${10.5 * px}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      if (this.xLabel) ctx.fillText(this.xLabel, (L + cw - R) / 2, ch - B + 14 * px);
      for (const t of this.xTicks ?? []) {
        const X = L + ((t - this.xr[0]) / (this.xr[1] - this.xr[0])) * (cw - R - L);
        ctx.fillText(tick(t), X, ch - B + 3 * px);
      }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const t of this.yTicks ?? []) {
        const Y = ch - B - ((t - this.yr[0]) / (this.yr[1] - this.yr[0])) * (ch - B - T);
        ctx.fillText(tick(t), L - 5 * px, Y);
      }
      if (this.yLabel) {
        ctx.save(); ctx.translate(12 * px, (T + ch - B) / 2); ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center'; ctx.fillText(this.yLabel, 0, 0); ctx.restore();
      }
      const X = (x) => L + ((x - this.xr[0]) / (this.xr[1] - this.xr[0])) * (cw - R - L);
      const Y = (y) => ch - B - ((y - this.yr[0]) / (this.yr[1] - this.yr[0])) * (ch - B - T);
      this._X = X; this._Y = Y;
      for (const s of this.series) {
        const pts = s.points;
        const upto = s.upto ?? pts.length;
        if (s.fill) {
          ctx.fillStyle = s.fill;
          ctx.beginPath(); ctx.moveTo(X(pts[0][0]), Y(this.yr[0]));
          for (let i = 0; i < Math.min(upto, pts.length); i++) ctx.lineTo(X(pts[i][0]), Y(pts[i][1]));
          ctx.lineTo(X(pts[Math.min(upto, pts.length) - 1][0]), Y(this.yr[0]));
          ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = s.color ?? '#2a64c9';
        ctx.lineWidth = (s.width ?? 3) * px;
        ctx.setLineDash(s.dash ? s.dash.map((d) => d * px) : []);
        ctx.beginPath();
        for (let i = 0; i < Math.min(upto, pts.length); i++) {
          const fx = X(pts[i][0]), fy = Y(pts[i][1]);
          if (i === 0) ctx.moveTo(fx, fy); else ctx.lineTo(fx, fy);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        if (s.dots) {
          ctx.fillStyle = s.color ?? '#2a64c9';
          for (let i = 0; i < Math.min(upto, pts.length); i++) { ctx.beginPath(); ctx.arc(X(pts[i][0]), Y(pts[i][1]), (s.dots) * px, 0, Math.PI * 2); ctx.fill(); }
        }
      }
      for (const m of this.marks) {
        ctx.strokeStyle = m.color ?? '#d8432e';
        ctx.lineWidth = (m.width ?? 2) * px;
        ctx.setLineDash(m.dash ? m.dash.map((d) => d * px) : [6 * px, 5 * px]);
        ctx.beginPath();
        if (m.y !== undefined) { ctx.moveTo(L, Y(m.y)); ctx.lineTo(cw - R, Y(m.y)); }
        if (m.x !== undefined) { ctx.moveTo(X(m.x), T); ctx.lineTo(X(m.x), ch - B); }
        ctx.stroke();
        ctx.setLineDash([]);
        if (m.text) {
          ctx.fillStyle = m.color ?? '#d8432e';
          ctx.font = `650 ${11 * px}px ${FONT}`;
          ctx.textAlign = m.align ?? 'right';
          ctx.textBaseline = 'bottom';
          const tx = m.x !== undefined ? X(m.x) + (m.align === 'left' ? 4 * px : -4 * px) : cw - R - 2 * px;
          const ty = m.y !== undefined ? Y(m.y) - 3 * px : T + 14 * px;
          ctx.fillText(m.text, tx, ty);
        }
      }
      if (this.extra) this.extra(ctx, X, Y, px);
    });
  }
}

// ---------------------------------------------------------------- scenery

export function tree(h = 120, color = COL.green) {
  const g = new THREE.Group();
  const trunk = cylinder(7, 9, h * 0.35, COL.wood);
  trunk.position.y = h * 0.175;
  g.add(trunk);
  const top = cone(h * 0.32, h * 0.75, color === COL.green ? 0x6fae6a : color);
  top.position.y = h * 0.35 + h * 0.36;
  g.add(top);
  return g;
}

export function pond(r = 46) {
  const g = new THREE.Group();
  const water = new THREE.Mesh(new THREE.CircleGeometry(r, 40), paper(COL.pond));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 1.2;
  water.receiveShadow = true;
  g.add(water);
  const rim = new THREE.Mesh(new THREE.RingGeometry(r, r + 4, 48), flat(COL.ink));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 1.4;
  g.add(rim);
  for (let i = 0; i < 2; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * (0.35 + i * 0.25), r * (0.35 + i * 0.25) + 2, 40), flat(0xffffff, { transparent: true, opacity: 0.7 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 1.5;
    g.add(ring);
  }
  return g;
}

// A paper person, for Kith's traveler and for grown-ups in the pictures.
export function person({ h = 190, coat = 0x5a7d9a, scarf = COL.red } = {}) {
  const g = new THREE.Group();
  const body = cone(h * 0.24, h * 0.62, coat, { seg: 20 });
  body.position.y = h * 0.31;
  g.add(body);
  const head = ball(h * 0.11, 0xf0c9a0);
  head.position.y = h * 0.72;
  g.add(head);
  const hair = solid(new THREE.SphereGeometry(h * 0.115, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), 0x4a3a2c);
  hair.position.y = h * 0.735;
  g.add(hair);
  const sc = torus(h * 0.085, h * 0.03, scarf);
  sc.rotation.x = Math.PI / 2;
  sc.position.y = h * 0.6;
  g.add(sc);
  g.userData.head = head;
  return g;
}

export function stairs(n = 3, { w = 80, rise = 22, run = 40, color = 0xd9cdb4 } = {}) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const s = box(run * (n - i), rise, w, color);
    s.position.set(run * i / 2 + run * (n - i) / 2 - run * n / 2 + run * i / 2, rise * i + rise / 2, 0);
    g.add(s);
  }
  return g;
}

export function chip(color = COL.green, { w = 60, d = 60, h = 10 } = {}) {
  const g = new THREE.Group();
  const b = box(w, h, d, color);
  b.position.y = h / 2 + 3;
  g.add(b);
  const pinMat = paper(0xd8d0c0);
  for (let i = 0; i < 5; i++) {
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 8), pinMat);
      p.position.set(-w / 2 + (i + 0.5) * (w / 5), 2, s * (d / 2 + 3));
      g.add(p);
      const q = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 4), pinMat);
      q.position.set(s * (w / 2 + 3), 2, -d / 2 + (i + 0.5) * (d / 5));
      g.add(q);
    }
  }
  return g;
}

// ---------------------------------------------------------------- disposal

export function dispose(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (matCache.has && [...matCache.values()].includes(m)) continue;
      if ([...outlineCache.values()].includes(m)) continue;
      if (m.map) m.map.dispose();
      m.dispose();
    }
  });
}
