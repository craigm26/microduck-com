// The book: a hardcover on a desk that opens, turns its pages, and carries a
// pop-up figure on every right-hand page. The left page is the lesson itself,
// the same HTML a reader without JavaScript gets, moved onto the paper.
//
// THE PAGE IS ALWAYS THE SOURCE. Every word a reader sees comes out of the
// document: the steps, the captions, the big idea, the prediction. A figure
// module only moves things. Narrow screens get the same lesson flat, one at a
// time, with the same figure in a card.

import * as K from './kit.js';
import { CSS3DRenderer } from '../vendor/CSS3DRenderer.js';

const { THREE, CSS3DObject, CSS3DSprite } = K;

const PW = K.PAGE.w, PH = K.PAGE.h;
const GUT = 8;                 // spine to page edge
const BOARD = 6;               // cover board thickness
const TILT = 0.032;            // pages slope down toward their outer edges
const BLOCK = 24;              // pages in the whole book, as a thickness
// Where a figure stands on its page: right of the steps, above the caption.
const STAGE = { x: 82, z: -62, w: 420, d: 470 };
const COVER = { beginner: 0xf08c12, intermediate: 0x2c64c0, advanced: 0x3b3e47 };
const COVER_INK = { beginner: '#5a2f00', intermediate: '#0d244a', advanced: '#15161a' };

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const testing = new URLSearchParams(location.search).has('test');

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function webgl() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  } catch { return null; }
  return null;
}

// ---------------------------------------------------------------- sound

class Sound {
  constructor() { this.on = store('bk-sound') === 'on'; this.ctx = null; }
  ensure() {
    if (!this.ctx) { try { this.ctx = new AudioContext(); } catch { this.on = false; } }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  noise(dur) {
    const c = this.ctx, n = Math.floor(c.sampleRate * dur);
    const b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = b; return s;
  }
  play(name) {
    if (!this.on || !this.ensure()) return;
    const c = this.ctx, t = c.currentTime, out = c.createGain();
    out.connect(c.destination);
    const tone = (type, f0, f1, dur, vol) => {
      const o = c.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
    };
    const hiss = (dur, f, q, vol) => {
      const s = this.noise(dur), bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(f, t); bp.frequency.exponentialRampToValueAtTime(f * 0.5, t + dur); bp.Q.value = q;
      const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      s.connect(bp); bp.connect(g); g.connect(out); s.start(t);
    };
    switch (name) {
      case 'turn': hiss(0.42, 1600, 0.8, 0.22); break;
      case 'pop': tone('sine', 480, 920, 0.09, 0.22); break;
      case 'tick': tone('square', 1500, 1400, 0.03, 0.05); break;
      case 'thud': tone('sine', 140, 50, 0.26, 0.35); hiss(0.12, 400, 1, 0.12); break;
      case 'quack': { tone('sawtooth', 520, 820, 0.08, 0.08); setTimeout(() => this.play('quack2'), 70); break; }
      case 'quack2': tone('sawtooth', 820, 430, 0.12, 0.07); break;
      case 'whirr': tone('sawtooth', 170, 240, 0.5, 0.05); break;
      case 'ding': tone('sine', 1320, 1300, 0.6, 0.12); tone('sine', 1760, 1750, 0.5, 0.06); break;
      case 'swish': hiss(0.22, 3000, 0.7, 0.12); break;
      case 'bloop': tone('sine', 300, 120, 0.2, 0.18); break;
      default: tone('sine', 660, 660, 0.08, 0.08);
    }
  }
}

// ---------------------------------------------------------------- textures

function paperTexture(dark) {
  return K.canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = dark ? '#2a2621' : '#fbf7ee';
    ctx.fillRect(0, 0, w, h);
    const r = K.rng(7);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = dark ? `rgba(255,240,220,${r() * 0.035})` : `rgba(120,96,60,${r() * 0.04})`;
      const x = r() * w, y = r() * h, l = 2 + r() * 9;
      ctx.fillRect(x, y, l, 1);
    }
  }).tex;
}

function edgeTexture(dark) {
  const t = K.canvasTexture(64, 256, (ctx, w, h) => {
    ctx.fillStyle = dark ? '#3a342c' : '#f1e8d6';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) {
      ctx.fillStyle = dark ? 'rgba(0,0,0,.35)' : 'rgba(120,100,70,.22)';
      ctx.fillRect(0, y, w, 1);
    }
  }).tex;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function woodTexture(dark) {
  const t = K.canvasTexture(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = dark ? '#1a1612' : '#e4d5bb';
    ctx.fillRect(0, 0, w, h);
    const r = K.rng(3);
    for (let i = 0; i < 90; i++) {
      const y = r() * h, a = dark ? 0.05 + r() * 0.05 : 0.04 + r() * 0.05;
      ctx.strokeStyle = dark ? `rgba(255,230,200,${a * 0.5})` : `rgba(110,80,40,${a})`;
      ctx.lineWidth = 1 + r() * 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.01 + i) * 6 + (r() - 0.5) * 2);
      ctx.stroke();
    }
  }).tex;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  return t;
}

function coverTexture(book, title, label) {
  const color = '#' + COVER[book].toString(16).padStart(6, '0');
  return K.canvasTexture(1240, 1600, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.07;
    for (let x = 0; x < w; x += 4) { ctx.fillStyle = x % 8 ? '#000' : '#fff'; ctx.fillRect(x, 0, 1, h); }
    for (let y = 0; y < h; y += 4) { ctx.fillStyle = y % 8 ? '#000' : '#fff'; ctx.fillRect(0, y, w, 1); }
    ctx.globalAlpha = 1;
    // the label
    ctx.fillStyle = '#fbf6ea';
    K.roundRectPath(ctx, 150, 250, w - 300, 560, 36); ctx.fill();
    ctx.strokeStyle = COVER_INK[book]; ctx.lineWidth = 8; ctx.stroke();
    ctx.fillStyle = COVER_INK[book];
    ctx.textAlign = 'center';
    ctx.font = `600 46px ${K.ROUND}`;
    ctx.fillText(label.toUpperCase(), w / 2, 350);
    ctx.font = `700 104px ${K.ROUND}`;
    const words = title.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width > w - 400 && line) { lines.push(line); line = word; } else line = t;
    }
    lines.push(line);
    lines.forEach((l, i) => ctx.fillText(l, w / 2, 500 + i * 118));
    ctx.font = `500 40px ${K.FONT}`;
    ctx.fillText('Microduck Studio books', w / 2, 760);
    // a paper duck on the cover, drawn here
    ctx.save();
    ctx.translate(w / 2, 1180);
    ctx.fillStyle = '#fbf6ea'; ctx.strokeStyle = COVER_INK[book]; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.ellipse(-30, 40, 190, 120, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(150, -150, 105, 92, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(110, -70); ctx.lineTo(70, 0); ctx.lineTo(150, -20); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff9a2e';
    ctx.beginPath(); ctx.moveTo(240, -170); ctx.lineTo(345, -140); ctx.lineTo(240, -110); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COVER_INK[book];
    ctx.beginPath(); ctx.arc(185, -175, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ff9a2e'; ctx.lineWidth = 22; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-70, 150); ctx.lineTo(-40, 240); ctx.lineTo(-110, 300); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(40, 150); ctx.lineTo(70, 240); ctx.lineTo(0, 300); ctx.stroke();
    ctx.restore();
  }).tex;
}

function coverFaceTexture(book, title, label) {
  const t = coverTexture(book, title, label);
  // the front cover is the left board's underside, seen after the book folds shut
  t.center.set(0.5, 0.5);
  t.rotation = Math.PI;
  return t;
}

function printedLines(dark) {
  return K.canvasTexture(300, 390, (ctx, w, h) => {
    ctx.fillStyle = dark ? '#2a2621' : '#fbf7ee';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = dark ? 'rgba(240,230,215,.22)' : 'rgba(60,50,40,.16)';
    ctx.fillRect(28, 30, 120, 12);
    for (let y = 64; y < h - 30; y += 13) {
      const l = 200 + ((y * 37) % 50);
      ctx.fillRect(28, y, Math.min(w - 56, l), 5);
    }
  }).tex;
}

// ---------------------------------------------------------------- the lessons

function readLessons() {
  const out = [];
  const intro = document.querySelector('.book-intro');
  out.push({
    kind: 'intro', el: intro, page: intro.querySelector('.book-intro-page'),
    figureName: intro.dataset.figure || 'cover', steps: [], title: 'Title page', num: '',
    figureEl: null, notes: null, predict: null, badge: '',
  });
  for (const a of document.querySelectorAll('article.lesson')) {
    const fig = a.querySelector('figure.lesson-figure');
    const steps = [...fig.querySelectorAll('ol.figure-steps > li')].map((li) => {
      const strong = li.querySelector('strong');
      const label = (strong ? strong.textContent : li.textContent).trim().replace(/[.:]$/, '');
      const text = li.textContent.trim();
      return { label, text };
    });
    out.push({
      kind: 'lesson', el: a, page: a.querySelector('.lesson-page'),
      figureName: a.dataset.figure, steps,
      title: a.querySelector('h2').textContent.trim(),
      short: a.dataset.short || a.querySelector('h2').textContent.trim(),
      num: a.id.replace('lesson-', ''),
      figureEl: fig,
      caption: fig.querySelector('figcaption')?.innerHTML ?? '',
      bigIdea: fig.querySelector('.big-idea')?.innerHTML ?? '',
      badge: fig.dataset.badge || '',
      notes: a.querySelector('.lesson-notes'),
      predict: a.querySelector('fieldset.predict'),
    });
  }
  return out;
}

// ---------------------------------------------------------------- main

async function main() {
  const book = document.body.dataset.book;
  if (!book || !webgl()) { document.documentElement.classList.add('bk-static'); return; }
  let mod;
  try { mod = await import(`./figures-${book}.js`); } catch (e) {
    console.error('books: figures failed to load', e);
    document.documentElement.classList.add('bk-static');
    return;
  }
  const figures = mod.figures;
  const lessons = readLessons();
  const total = lessons.length - 1;
  const sound = new Sound();
  const main = document.querySelector('main');
  const bookTitle = document.querySelector('.book-intro h1').textContent.trim();
  const bookLabel = document.body.dataset.label || '';

  // ---------------------------------------------------------- renderer

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'bk-gl';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const css = new CSS3DRenderer();
  css.domElement.className = 'bk-css3d';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 20, 30000);
  const hemi = new THREE.HemisphereLight(0xfff4e2, 0xb9a687, 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.3);
  sun.position.set(-520, 1500, 760);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -760, right: 760, top: 560, bottom: -560, near: 200, far: 3600 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);

  let dark = darkQuery.matches;
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshLambertMaterial({ map: woodTexture(dark) }));
  desk.rotation.x = -Math.PI / 2;
  desk.receiveShadow = true;
  scene.add(desk);

  // ---------------------------------------------------------- the book

  const thick = (i) => ({ l: 2 + (BLOCK - 4) * (i / total), r: 2 + (BLOCK - 4) * (1 - i / total) });
  const coverMat = new THREE.MeshLambertMaterial({ color: COVER[book] });
  const coverFace = new THREE.MeshLambertMaterial({ map: coverFaceTexture(book, bookTitle, bookLabel) });
  const mats = {
    page: new THREE.MeshLambertMaterial({ map: paperTexture(dark) }),
    edge: new THREE.MeshLambertMaterial({ map: edgeTexture(dark) }),
  };
  function half(side) {
    const g = new THREE.Group();
    const cx = side * (GUT + PW / 2);
    const board = new THREE.Mesh(K.roundBox(PW + GUT + 16, BOARD, PH + 26, 2.5, 1), coverMat);
    board.position.set(side * ((PW + GUT + 16) / 2), BOARD / 2, 0);
    board.castShadow = true; board.receiveShadow = true;
    g.add(board);
    const block = new THREE.Mesh(new THREE.BoxGeometry(PW, 1, PH), [mats.edge, mats.edge, mats.page, mats.page, mats.edge, mats.edge]);
    block.position.set(cx, BOARD, 0);
    block.castShadow = true; block.receiveShadow = true;
    g.add(block);
    const top = new THREE.Group();
    top.position.set(cx, BOARD, 0);
    g.add(top);
    return { g, board, block, top, cx };
  }
  const L = half(-1), R = half(1);
  // the left half hangs from a hinge at the spine, so the book can open
  const hinge = new THREE.Group();
  hinge.add(L.g);
  const bookGroup = new THREE.Group();
  bookGroup.add(hinge, R.g);
  // the halves slope down to their outer edges, so the spine sits up a little
  bookGroup.position.y = (PW + GUT + 16) * Math.sin(TILT) + 1;
  scene.add(bookGroup);
  const spine = new THREE.Mesh(K.roundBox(GUT * 2 + 10, BOARD + 4, PH + 26, 3, 1), coverMat);
  spine.position.set(0, BOARD / 2, 0);
  bookGroup.add(spine);
  // the outside of the front cover is the left board's underside
  const front = new THREE.Mesh(new THREE.PlaneGeometry(PW + GUT + 16, PH + 26), coverFace);
  front.rotation.x = Math.PI / 2;
  front.position.set(-(PW + GUT + 16) / 2, -0.2, 0);
  L.g.add(front);
  const shadowBlob = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1020), new THREE.MeshBasicMaterial({
    map: K.canvasTexture(256, 180, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }).tex, transparent: true, depthWrite: false,
  }));
  shadowBlob.rotation.x = -Math.PI / 2;
  shadowBlob.position.y = 0.5;
  scene.add(shadowBlob);

  let blockNow = thick(0);
  function setBlocks(t) {
    blockNow = t;
    L.block.scale.y = t.l; L.block.position.y = BOARD + t.l / 2;
    R.block.scale.y = t.r; R.block.position.y = BOARD + t.r / 2;
    L.top.position.y = BOARD + t.l + 0.3;
    R.top.position.y = BOARD + t.r + 0.3;
    const pivot = (BOARD * 2 + t.l + t.r) / 2;
    hinge.position.y = pivot;
    L.g.position.y = -pivot;
  }
  setBlocks(thick(0));
  hinge.rotation.z = TILT;
  R.g.rotation.z = -TILT;

  // the sheet that turns
  const SEG = 32;
  const sheetGeo = new THREE.BufferGeometry();
  const sheetPos = new Float32Array((SEG + 1) * 2 * 3);
  const sheetUV = new Float32Array((SEG + 1) * 2 * 2);
  const sheetIdx = [];
  for (let i = 0; i <= SEG; i++) {
    sheetUV.set([i / SEG, 1, i / SEG, 0], i * 4);
    if (i < SEG) { const a = i * 2; sheetIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  sheetGeo.setAttribute('position', new THREE.BufferAttribute(sheetPos, 3));
  sheetGeo.setAttribute('uv', new THREE.BufferAttribute(sheetUV, 2));
  sheetGeo.setIndex(sheetIdx);
  const sheetFront = new THREE.Mesh(sheetGeo, new THREE.MeshLambertMaterial({ map: paperTexture(dark), side: THREE.FrontSide }));
  const sheetBack = new THREE.Mesh(sheetGeo, new THREE.MeshLambertMaterial({ map: printedLines(dark), side: THREE.BackSide }));
  for (const m of [sheetFront, sheetBack]) { m.castShadow = true; m.visible = false; bookGroup.add(m); }
  // theta 0: lying on the right page; PI: lying on the left
  function shapeSheet(theta, baseY) {
    const W = PW + GUT, curl = 0.95 * Math.sin(theta);
    let x = 0, y = 0;
    for (let i = 0; i <= SEG; i++) {
      const s = i / SEG;
      if (i > 0) {
        const a = theta + curl * Math.pow(s, 1.6);
        x += Math.cos(a) * (W / SEG); y += Math.sin(a) * (W / SEG);
      }
      const o = i * 6;
      sheetPos[o] = x; sheetPos[o + 1] = baseY + y; sheetPos[o + 2] = -PH / 2;
      sheetPos[o + 3] = x; sheetPos[o + 4] = baseY + y; sheetPos[o + 5] = PH / 2;
    }
    sheetGeo.attributes.position.needsUpdate = true;
    sheetGeo.computeVertexNormals();
    sheetGeo.computeBoundingSphere();
  }

  // ---------------------------------------------------------- the paper's DOM

  const leftEl = el('div', 'bk-page');
  const leftObj = new CSS3DObject(leftEl);
  leftEl.style.userSelect = 'text';
  leftObj.rotation.x = -Math.PI / 2;
  L.top.add(leftObj);
  const rightEl = el('div', 'bk-rpage');
  const rightObj = new CSS3DObject(rightEl);
  rightEl.style.userSelect = 'text';
  rightObj.rotation.x = -Math.PI / 2;
  R.top.add(rightObj);
  const figureMount = new THREE.Group();
  figureMount.position.set(STAGE.x, 0, STAGE.z);
  R.top.add(figureMount);

  // ---------------------------------------------------------- chrome

  const stage = el('div', 'bk-stage');
  stage.setAttribute('aria-label', 'The book');
  const live = el('div', 'bk-announce');
  live.setAttribute('aria-live', 'polite');
  const bar = el('nav', 'bk-bar');
  bar.setAttribute('aria-label', 'Book');
  const btn = (cls, text, label) => {
    const b = el('button', 'bk-btn ' + cls, text);
    b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    return b;
  };
  const bContents = btn('bk-b-contents', 'Contents');
  bContents.setAttribute('aria-expanded', 'false');
  const bPrev = btn('bk-b-prev', '‹', 'Previous lesson');
  const where = el('div', 'bk-where');
  const whereNum = el('span', 'bk-where-num');
  const whereTitle = el('span', 'bk-where-title');
  where.append(whereNum, whereTitle);
  const bNext = btn('bk-b-next', '›', 'Next lesson');
  const bNotes = btn('bk-b-notes', 'Notes');
  bNotes.setAttribute('aria-expanded', 'false');
  const bSound = btn('bk-b-sound', '');
  const bView = btn('bk-b-view', '');
  bar.append(bContents, bPrev, where, bNext, bNotes, bSound, bView);

  const menu = el('div', 'bk-menu');
  menu.hidden = true;
  const menuList = el('ol', 'bk-menu-list');
  lessons.forEach((Ls, i) => {
    const li = el('li');
    const b = btn('bk-menu-item', '');
    b.append(el('span', 'bk-menu-num', i ? String(i) : ''), el('span', 'bk-menu-title', i ? Ls.title : 'Title page'));
    b.addEventListener('click', () => { closeMenu(); go(i); });
    li.append(b);
    menuList.append(li);
  });
  const menuFoot = el('div', 'bk-menu-foot');
  const mSound = btn('bk-m-sound', '');
  const mView = btn('bk-m-view', '');
  menuFoot.append(mSound, mView);
  menu.append(menuList, menuFoot);

  const notes = el('aside', 'bk-notes');
  notes.hidden = true;
  notes.setAttribute('aria-label', 'Notes for this lesson');
  const notesHead = el('div', 'bk-notes-head');
  const notesTitle = el('p', 'bk-notes-title');
  const notesClose = btn('bk-notes-close', 'Close');
  notesHead.append(notesTitle, notesClose);
  const notesBody = el('div', 'bk-notes-body');
  notes.append(notesHead, notesBody);

  const stageHint = el('p', 'bk-hint');
  stageHint.textContent = 'Use ← and → to turn pages, and Space for the next step.';

  const barWrap = el('div', 'bk-barwrap');
  barWrap.append(menu, bar);
  stage.append(renderer.domElement, css.domElement, barWrap, notes);
  main.prepend(stage);
  document.body.append(live);

  // ---------------------------------------------------------- figure host

  let index = 0, mode = null, fig = null, notesFor = null;
  const anims = [];        // little timed things: sound words, fades
  let clock = 0, manual = false;

  function makeCtx(group) {
    return {
      THREE, K, group, page: { w: PW, h: PH }, stage: STAGE, reduced, dark,
      label(text, pos, opts = {}) {
        const e = el('div', 'bk-label' + (opts.cls ? ' ' + opts.cls : ''), text);
        const o = opts.flat ? new CSS3DObject(e) : new CSS3DSprite(e);
        if (opts.flat) o.rotation.x = -Math.PI / 2;
        o.position.copy(pos);
        (opts.parent || group).add(o);
        o.userData.el = e;
        return o;
      },
      say(text, pos, opts = {}) {
        const e = el('div', 'bk-say' + (opts.cls ? ' ' + opts.cls : ''), text);
        const o = new CSS3DSprite(e);
        o.position.copy(pos);
        group.add(o);
        if (opts.sound) sound.play(opts.sound);
        const life = opts.life ?? 1.1;
        anims.push({ t: 0, life, o, tick(u) {
          const s = u < 0.2 ? K.ease.back(u / 0.2) : 1;
          e.style.opacity = String(u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3);
          o.scale.setScalar(Math.max(0.01, s) * (opts.scale ?? 1));
          o.position.y = pos.y + u * 24;
        }, done() { e.remove(); o.removeFromParent(); } });
        return o;
      },
      sound(name) { sound.play(name); },
    };
  }

  function clearSays() {
    for (const a of anims.splice(0)) a.done?.();
  }

  function unmountFigure() {
    if (!fig) return;
    clearSays();
    fig.obj.group.traverse((o) => { if (o.isCSS3DObject) o.element.remove(); });
    fig.obj.group.removeFromParent();
    fig.obj.dispose?.();
    K.dispose(fig.obj.group);
    fig.ui.root.remove();
    fig = null;
  }

  function mountFigure(i) {
    const Ls = lessons[i];
    const make = figures[Ls.figureName];
    const group = new THREE.Group();
    let obj;
    if (!make) {
      console.error(`books: no figure called ${Ls.figureName}`);
      obj = { group, steps: [], reset() {} };
    } else {
      obj = make(makeCtx(group));
      if (obj.group !== group) group.add(obj.group);
      obj.group = group;
    }
    if (Ls.kind === 'lesson' && obj.steps.length !== Ls.steps.length) {
      console.error(`books: ${Ls.figureName} has ${obj.steps.length} steps and the page lists ${Ls.steps.length}`);
    }
    obj.reset?.();
    figureMount.add(group);
    const ui = buildUI(Ls, obj);
    fig = { i, obj, ui, done: 0, run: null, queue: false, wait: null, pop: 0, popping: null };
    group.traverse((o) => { if (o.isMesh && !o.userData.isOutline) o.castShadow = o.castShadow !== false; });
    ui.update();
    return fig;
  }

  // A figure rises off the page like a pop-up when its page opens.
  function popTo(target, dur = 0.55) {
    if (!fig) return;
    fig.popping = { from: fig.pop, to: target, t: 0, dur: reduced ? 0.001 : dur };
  }
  function applyPop() {
    if (!fig) return;
    const kids = fig.obj.group.children;
    const n = kids.length;
    kids.forEach((k, j) => {
      if (k.isCSS3DObject) { k.element.style.opacity = String(K.clamp(fig.pop * 1.4 - 0.4)); return; }
      const lag = n > 1 ? (j / (n - 1)) * 0.35 : 0;
      const u = K.clamp((fig.pop - lag) / (1 - lag + 1e-6));
      const s = fig.popping && fig.popping.to > fig.popping.from ? K.ease.back(u) : u;
      if (k.userData.popBase === undefined) k.userData.popBase = k.scale.y;
      // folded flat, like a pop-up in a closed book, and never quite gone
      k.scale.y = Math.max(0.02, s) * k.userData.popBase;
    });
  }

  function buildUI(Ls, obj) {
    const root = el('div', 'bk-ui');
    const top = el('div', 'bk-ui-top');
    const badge = el('span', 'bk-badge');
    if (Ls.badge === 'toy') badge.textContent = 'Toy model';
    else if (Ls.badge === 'real') badge.textContent = 'Real numbers';
    else badge.hidden = true;
    const chips = el('div', 'bk-chips');
    top.append(badge, chips);
    const list = el('ol', 'bk-steps');
    const buttons = Ls.steps.map((s, j) => {
      const li = el('li');
      const b = btn('bk-step', '');
      b.append(el('span', 'bk-step-n', String(j + 1)), el('span', 'bk-step-label', s.label));
      b.addEventListener('click', () => runStep(j));
      li.append(b);
      list.append(li);
      return b;
    });
    const bottom = el('div', 'bk-ui-bottom');
    let slider = null;
    if (obj.slider) {
      const s = obj.slider;
      const wrap = el('label', 'bk-slider');
      const name = el('span', 'bk-slider-name', s.label);
      const input = el('input');
      input.type = 'range';
      Object.assign(input, { min: s.min, max: s.max, step: s.step ?? 'any', value: s.value });
      const out = el('output', 'bk-slider-out', s.format ? s.format(Number(s.value)) : String(s.value));
      input.addEventListener('input', () => {
        const v = Number(input.value);
        out.textContent = s.format ? s.format(v) : String(v);
        s.input(v);
      });
      wrap.append(name, input, out);
      bottom.append(wrap);
      slider = { input, out };
    }
    const caption = el('p', 'bk-caption');
    const actions = el('div', 'bk-actions');
    const play = btn('bk-play', 'Play all steps');
    const again = btn('bk-again', 'Start over');
    actions.append(play, again);
    const big = el('p', 'bk-bigidea');
    big.innerHTML = Ls.bigIdea;
    big.hidden = true;
    const verdict = el('p', 'bk-verdict');
    verdict.hidden = true;
    bottom.append(caption, verdict, big, actions);
    if (Ls.kind === 'intro') {
      list.hidden = true;
      play.textContent = 'Open lesson 1';
      again.hidden = true;
      caption.innerHTML = 'Every lesson is a spread: read the left page, make a prediction, then press the steps on the right page one at a time.';
      play.addEventListener('click', () => go(1));
    } else {
      play.addEventListener('click', () => { if (!fig) return; fig.queue = true; if (!fig.run) runStep(fig.done); });
      again.addEventListener('click', () => restart());
    }
    root.append(top, list, bottom);
    const api = {
      root, chips, caption, buttons, big, verdict, slider,
      update() {
        if (!fig || Ls.kind === 'intro') return;
        buttons.forEach((b, j) => {
          const state = j < fig.done ? 'done' : (fig.run && fig.run.i === j) ? 'running' : j === fig.done ? 'next' : 'later';
          b.dataset.state = state;
          b.disabled = state !== 'next';
          b.setAttribute('aria-current', state === 'running' ? 'step' : 'false');
        });
        const doneAll = fig.done >= Ls.steps.length;
        play.disabled = doneAll || !!fig.queue;
        again.disabled = fig.done === 0 && !fig.run;
        const shown = fig.run ? fig.run.i : fig.done - 1;
        caption.innerHTML = shown >= 0 ? Ls.steps[shown].text : (Ls.caption || 'Press step 1.');
        big.hidden = !doneAll;
      },
    };
    return api;
  }

  function runStep(j) {
    if (!fig || fig.run || j !== fig.done) return;
    const st = fig.obj.steps[j];
    if (!st) return;
    st.start?.();
    fig.run = { i: j, t: 0, dur: reduced ? 0.0001 : st.dur ?? 1.6 };
    fig.ui.update();
    const s = lessons[fig.i].steps[j];
    if (s) live.textContent = s.text;
  }

  function finishStep() {
    const r = fig.run;
    const st = fig.obj.steps[r.i];
    st.run(1, 0);
    st.end?.();
    fig.run = null;
    fig.done = r.i + 1;
    if (fig.done >= fig.obj.steps.length) { fig.queue = false; reveal(); }
    fig.ui.update();
    // the breath between queued steps runs on the book's clock, so it pauses
    // with the book (a hidden tab, a manual test clock) rather than on a timer
    if (fig.queue) fig.wait = reduced ? 0 : 0.38;
  }

  function restart() {
    if (!fig) return;
    clearSays();
    fig.run = null; fig.queue = false; fig.wait = null; fig.done = 0;
    fig.obj.reset?.();
    unreveal();
    fig.ui.update();
  }

  // The prediction is settled by the figure, not before it.
  function reveal() {
    const Ls = lessons[fig.i];
    const fs = Ls.predict;
    if (!fs) return;
    const answer = fs.dataset.answer;
    const picked = fs.querySelector('input:checked');
    fs.classList.add('is-revealed');
    for (const lab of fs.querySelectorAll('label')) {
      const input = lab.querySelector('input');
      lab.classList.toggle('is-answer', input.value === answer);
      lab.classList.toggle('is-wrong', input.checked && input.value !== answer);
    }
    const d = fs.querySelector('details');
    if (d) d.open = true;
    const v = fig.ui.verdict;
    if (picked) {
      v.textContent = picked.value === answer ? 'Your prediction was right.' : 'Not what you predicted. Read why on the left page.';
      v.dataset.right = String(picked.value === answer);
    } else v.textContent = 'The answer is on the left page.';
    v.hidden = false;
    sound.play(picked && picked.value === answer ? 'ding' : 'pop');
  }
  function unreveal() {
    const fs = lessons[fig.i].predict;
    fig.ui.verdict.hidden = true;
    if (!fs) return;
    fs.classList.remove('is-revealed');
    for (const lab of fs.querySelectorAll('label')) lab.classList.remove('is-answer', 'is-wrong');
    const d = fs.querySelector('details');
    if (d) d.open = false;
  }

  // ---------------------------------------------------------- placing the DOM

  const homes = new Map();     // node -> [parent, nextSibling]
  function borrow(node, into) {
    if (!node) return;
    if (!homes.has(node)) homes.set(node, [node.parentNode, node.nextSibling]);
    into.append(node);
  }
  function giveBack(node) {
    const h = node && homes.get(node);
    if (!h) return;
    h[0].insertBefore(node, h[1] && h[1].parentNode === h[0] ? h[1] : null);
    homes.delete(node);
  }

  function placeDOM() {
    const Ls = lessons[index];
    for (const n of [...homes.keys()]) if (n !== Ls.page) giveBack(n);
    document.querySelectorAll('.is-current').forEach((n) => n.classList.remove('is-current'));
    Ls.el.classList.add('is-current');
    if (mode === '3d') {
      borrow(Ls.page, leftEl);
      leftEl.scrollTop = 0;
      if (fig) rightEl.append(fig.ui.root);
    } else {
      giveBack(Ls.page);
      const holder = flatHolder(Ls);
      holder.slot.append(renderer.domElement, css.domElement);
      if (fig) holder.ui.append(fig.ui.root);
    }
    leftEl.classList.toggle('is-intro', Ls.kind === 'intro');
    updateBar();
    if (mode === 'flat') layout();
  }

  const flatHolders = new Map();
  function flatHolder(Ls) {
    if (flatHolders.has(Ls)) return flatHolders.get(Ls);
    const card = el('div', 'bk-flatcard');
    const slot = el('div', 'bk-flatstage');
    const ui = el('div', 'bk-flatui');
    card.append(slot, ui);
    if (Ls.kind === 'intro') Ls.el.append(card);
    else Ls.figureEl.prepend(card);
    const h = { card, slot, ui };
    flatHolders.set(Ls, h);
    return h;
  }

  function updateBar() {
    const Ls = lessons[index];
    whereNum.textContent = index ? `Lesson ${index} of ${total}` : bookLabel;
    whereTitle.textContent = index ? Ls.title : bookTitle;
    bPrev.disabled = index === 0;
    bNext.disabled = index === total;
    bNotes.disabled = index === 0;
    bSound.textContent = sound.on ? 'Sound on' : 'Sound off';
    bSound.setAttribute('aria-pressed', String(sound.on));
    bView.textContent = mode === '3d' ? 'Flat pages' : '3D book';
    mSound.textContent = bSound.textContent;
    mSound.setAttribute('aria-pressed', String(sound.on));
    mView.textContent = mode === '3d' ? 'Show flat pages' : 'Show the 3D book';
    if (notesFor !== null && notesFor !== index) closeNotes();
  }

  // ---------------------------------------------------------- notes, menu

  function openNotes() {
    const Ls = lessons[index];
    if (!Ls.notes) return;
    if (mode !== '3d') { Ls.notes.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); return; }
    notesTitle.textContent = `Lesson ${index}: notes`;
    borrow(Ls.notes, notesBody);
    notes.hidden = false;
    notesFor = index;
    bNotes.setAttribute('aria-expanded', 'true');
    notesClose.focus();
  }
  function closeNotes() {
    if (notesFor === null) return;
    giveBack(lessons[notesFor].notes);
    notes.hidden = true;
    notesFor = null;
    bNotes.setAttribute('aria-expanded', 'false');
  }
  function openMenu() {
    menu.hidden = false;
    bContents.setAttribute('aria-expanded', 'true');
    menu.querySelectorAll('.bk-menu-item').forEach((b, i) => b.setAttribute('aria-current', i === index ? 'page' : 'false'));
    menu.querySelectorAll('.bk-menu-item')[index].focus();
  }
  function closeMenu() { menu.hidden = true; bContents.setAttribute('aria-expanded', 'false'); }

  bContents.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
  bPrev.addEventListener('click', () => go(index - 1));
  bNext.addEventListener('click', () => go(index + 1));
  bNotes.addEventListener('click', () => (notesFor === null ? openNotes() : closeNotes()));
  notesClose.addEventListener('click', () => { closeNotes(); bNotes.focus(); });
  const toggleSound = () => {
    sound.on = !sound.on;
    store('bk-sound', sound.on ? 'on' : null);
    if (sound.on) sound.play('pop');
    updateBar();
  };
  const toggleView = () => {
    const want = mode === '3d' ? 'flat' : '3d';
    store('bk-view', want);
    closeMenu();
    setMode(want);
  };
  bView.addEventListener('click', toggleView);
  mView.addEventListener('click', toggleView);
  mSound.addEventListener('click', toggleSound);
  bSound.addEventListener('click', toggleSound);

  // ---------------------------------------------------------- turning

  let turn = null;   // { dir, t, dur, to }
  function go(to, { instant = false } = {}) {
    to = Math.max(0, Math.min(total, to));
    if (to === index && fig) return;
    if (turn) return;
    closeMenu();
    const from = index;
    if (mode === 'flat' || instant || reduced || !fig) {
      index = to;
      unmountFigure();
      setBlocks(thick(index));
      mountFigure(index);
      placeDOM();
      fig.pop = 0;
      popTo(1, instant ? 0.001 : 0.45);
      if (mode === 'flat' && !instant) lessons[index].el.scrollIntoView({ block: 'start' });
      afterGo();
      return;
    }
    turn = { dir: to > from ? 1 : -1, t: 0, dur: 1.15, from, to, swapped: false, mounted: false };
    popTo(0, 0.22);
    rightEl.classList.add('is-fading');
    sound.play('turn');
  }
  function afterGo() {
    const h = index ? '#lesson-' + index : location.pathname + location.search;
    history.replaceState(null, '', index ? location.pathname + location.search + h : h);
    live.textContent = index ? `Lesson ${index}: ${lessons[index].title}` : bookTitle;
  }

  function stepTurn(dt) {
    turn.t += dt / turn.dur;
    const t = Math.min(1, turn.t);
    const tb = thick(turn.from), ta = thick(turn.to);
    if (t > 0.18 && !turn.mounted) {
      // the old figure is down; the new page's figure waits under the sheet
      turn.mounted = true;
      unmountFigure();
      index = turn.to;
      mountFigure(index);
      fig.pop = 0;
      applyPop();
      if (mode === '3d') rightEl.append(fig.ui.root);
      updateBar();
    }
    const u = K.ease.inOut(K.seg(t, 0.15, 0.88));
    const theta = turn.dir > 0 ? u * Math.PI : (1 - u) * Math.PI;
    const base = BOARD + K.lerp(turn.dir > 0 ? tb.r : tb.l, turn.dir > 0 ? ta.l : ta.r, u) + 0.6;
    shapeSheet(theta, base);
    sheetFront.visible = sheetBack.visible = t > 0.15 && t < 0.9;
    setBlocks({ l: K.lerp(tb.l, ta.l, u), r: K.lerp(tb.r, ta.r, u) });
    leftEl.style.opacity = String(t < 0.42 ? 1 : t < 0.58 ? 1 - (t - 0.42) / 0.16 : t < 0.82 ? 0 : (t - 0.82) / 0.18);
    if (t >= 0.58 && !turn.swapped) { turn.swapped = true; placeDOM(); }
    if (t > 0.62 && fig.popping === null && fig.pop === 0) popTo(1, 0.6);
    if (t >= 1) {
      leftEl.style.opacity = '1';
      rightEl.classList.remove('is-fading');
      turn = null;
      afterGo();
    }
  }

  // the cover opens once, on a first visit to the title page
  let opening = null;
  function openCover() {
    if (reduced) { hinge.rotation.z = TILT; return; }
    opening = { t: 0, dur: 1.6 };
    hinge.rotation.z = TILT - Math.PI + 0.001;
    leftEl.style.opacity = '0';
    rightEl.classList.add('is-fading');
    camState.intro = 1;
  }
  function stepOpen(dt) {
    opening.t += dt / opening.dur;
    const t = Math.min(1, opening.t);
    const u = K.ease.inOut(K.seg(t, 0.12, 0.85));
    hinge.rotation.z = TILT - Math.PI * (1 - u);
    leftEl.style.opacity = String(K.seg(t, 0.8, 1));
    camState.intro = 1 - K.ease.inOut(K.seg(t, 0, 0.95));
    if (t > 0.55 && fig && fig.pop === 0 && !fig.popping) popTo(1, 0.6);
    if (t > 0.3 && !opening.sounded) { opening.sounded = true; sound.play('turn'); }
    if (t >= 1) { opening = null; rightEl.classList.remove('is-fading'); camState.intro = 0; }
  }

  // ---------------------------------------------------------- camera

  const camState = { intro: 0, px: 0, py: 0, tx: 0, ty: 0, view: 'spread' };
  let W = 1, H = 1, barH = 64;

  const boxes = {
    spread: new THREE.Box3(new THREE.Vector3(-PW - GUT - 14, 0, -PH / 2 - 16), new THREE.Vector3(PW + GUT + 14, 150, PH / 2 + 16)),
    flat: new THREE.Box3(new THREE.Vector3(STAGE.x - STAGE.w / 2 + GUT + PW / 2, 0, STAGE.z - STAGE.d / 2), new THREE.Vector3(STAGE.x + STAGE.w / 2 + GUT + PW / 2, 260, STAGE.z + STAGE.d / 2)),
  };

  function fit(box, elevation, azimuth, aspect, area) {
    const center = box.getCenter(new THREE.Vector3());
    const dir = new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation));
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    camera.aspect = aspect;
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    let lo = 200, hi = 20000;
    const proj = new THREE.Vector3();
    const test = (d) => {
      camera.position.copy(center).addScaledVector(dir, d);
      camera.lookAt(center);
      camera.updateMatrixWorld();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const c of corners) { proj.copy(c).project(camera); x0 = Math.min(x0, proj.x); x1 = Math.max(x1, proj.x); y0 = Math.min(y0, proj.y); y1 = Math.max(y1, proj.y); }
      return { x0, x1, y0, y1 };
    };
    for (let k = 0; k < 28; k++) {
      const mid = (lo + hi) / 2, r = test(mid);
      const fits = (r.x1 - r.x0) / 2 <= area.w && (r.y1 - r.y0) / 2 <= area.h;
      if (fits) hi = mid; else lo = mid;
    }
    const r = test(hi);
    return { d: hi, center, dir, ndc: r };
  }

  let camBase = null;
  function layout() {
    const host = mode === '3d' ? stage : renderer.domElement.parentNode;
    if (!host) return;
    W = Math.max(1, host.clientWidth);
    H = Math.max(1, host.clientHeight);
    barH = mode === '3d' ? bar.offsetHeight + 18 : 0;
    renderer.setSize(W, H, false);
    renderer.domElement.style.width = W + 'px';
    renderer.domElement.style.height = H + 'px';
    css.setSize(W, H);
    const usableH = H - barH;
    const margin = mode === '3d' ? 0.94 : 0.98;
    const area = { w: margin, h: (usableH / H) * margin };
    const box = mode === '3d' ? boxes.spread : boxes.flat;
    const elev = mode === '3d' ? 0.86 : 0.7;
    camBase = { ...fit(box, elev, 0, W / H, area), elev, box };
    // shift the picture so the book sits in the space above the bar
    const r = camBase.ndc;
    const cxPx = ((r.x0 + r.x1) / 2 + 1) / 2 * W;
    const cyPx = (1 - (r.y0 + r.y1) / 2) / 2 * H;
    camBase.offset = { x: cxPx - W / 2, y: cyPx - usableH / 2 };
    applyCamera();
  }

  function applyCamera() {
    if (!camBase) return;
    const { center, d, elev } = camBase;
    camState.px += (camState.tx - camState.px) * 0.06;
    camState.py += (camState.ty - camState.py) * 0.06;
    const az = camState.px * 0.045;
    const el2 = elev + camState.py * 0.03 - camState.intro * 0.18;
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el2), Math.sin(el2), Math.cos(az) * Math.cos(el2));
    const target = center.clone();
    if (camState.intro) target.x = K.lerp(center.x, center.x + (PW + GUT) / 2, camState.intro);
    camera.position.copy(target).addScaledVector(dir, d * (1 + camState.intro * 0.12));
    camera.lookAt(target);
    camera.setViewOffset(W, H, camBase.offset.x, camBase.offset.y, W, H);
    camera.updateProjectionMatrix();
  }

  addEventListener('pointermove', (e) => {
    if (mode !== '3d' || reduced) return;
    camState.tx = (e.clientX / innerWidth - 0.5) * 2;
    camState.ty = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });

  // ---------------------------------------------------------- modes

  function preferred() {
    const saved = store('bk-view');
    if (saved === 'flat' || saved === '3d') return saved;
    return innerWidth < 760 || innerHeight < 540 ? 'flat' : '3d';
  }

  function setMode(m) {
    if (m === mode) return;
    closeNotes();
    closeMenu();
    mode = m;
    document.documentElement.classList.toggle('bk-3d', m === '3d');
    document.documentElement.classList.toggle('bk-flat', m === 'flat');
    if (m === '3d') stage.prepend(renderer.domElement, css.domElement);
    stage.hidden = m !== '3d';
    if (m === 'flat') document.body.append(barWrap); else stage.append(barWrap);
    leftObj.visible = rightObj.visible = m === '3d';
    placeDOM();
    layout();
    // one lesson at a time: start the reader at the top of the one showing
    if (m === 'flat' && index > 0) lessons[index].el.scrollIntoView({ block: 'start' });
    else if (m === '3d') scrollTo(0, 0);
  }

  // ---------------------------------------------------------- keys

  addEventListener('keydown', (e) => {
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (e.key === 'Escape') { if (!menu.hidden) { closeMenu(); bContents.focus(); } else if (notesFor !== null) { closeNotes(); bNotes.focus(); } return; }
    if (typing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
    else if ((e.key === ' ' || e.key === 'Enter') && (t === document.body || t === stage || t.closest?.('.bk-page'))) {
      if (t.closest?.('a, button, summary, label')) return;
      if (fig && lessons[fig.i].kind === 'lesson') { e.preventDefault(); runStep(fig.done); }
    }
  });

  // ---------------------------------------------------------- frame

  let last = performance.now();
  function tick(dt) {
    clock += dt;
    if (opening) stepOpen(dt);
    if (turn) stepTurn(dt);
    if (fig) {
      if (fig.popping) {
        const p = fig.popping;
        p.t += dt / p.dur;
        fig.pop = K.lerp(p.from, p.to, Math.min(1, p.t));
        if (p.t >= 1) fig.popping = null;
        applyPop();
      }
      if (fig.run) {
        fig.run.t += dt;
        const u = Math.min(1, fig.run.t / fig.run.dur);
        if (u >= 1) finishStep(); else fig.obj.steps[fig.run.i].run(u, dt);
      } else if (fig.queue && fig.wait != null) {
        fig.wait -= dt;
        if (fig.wait <= 0) { fig.wait = null; runStep(fig.done); }
      }
      if (!reduced) fig.obj.idle?.(clock, dt);
      if (fig.obj.chips) {
        const list = fig.obj.chips();
        const key = JSON.stringify(list);
        if (key !== fig.chipKey) {
          fig.chipKey = key;
          fig.ui.chips.replaceChildren(...list.map(([k, v]) => { const c = el('span', 'bk-chip'); c.append(el('span', 'bk-chip-k', k), el('span', 'bk-chip-v', v)); return c; }));
        }
      }
    }
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      a.t += dt / a.life;
      if (a.t >= 1) { a.done(); anims.splice(i, 1); } else a.tick(a.t);
    }
  }
  function render() {
    applyCamera();
    renderer.render(scene, camera);
    css.render(scene, camera);
  }
  // A slow device gets a lighter picture rather than a slideshow: first fewer
  // pixels, then no shadows. Animations keep time whatever the frame rate.
  const quality = { level: 0, ema: 16, frames: 0 };
  function adapt(ms) {
    quality.frames++;
    quality.ema += (ms - quality.ema) * 0.05;
    if (quality.frames < 90 || quality.level >= 2 || quality.ema < 40) return;
    quality.level++;
    quality.frames = 0;
    quality.ema = 16;
    if (quality.level === 1) renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
    if (quality.level === 2) { renderer.setPixelRatio(1); sun.castShadow = false; }
    layout();
  }
  let visible = true;
  function loop(now) {
    const ms = now - last;
    const dt = Math.min(0.1, ms / 1000);
    last = now;
    if (!manual && visible) { tick(dt); render(); if (!testing) adapt(ms); }
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------- colours

  function recolor() {
    dark = darkQuery.matches;
    desk.material.map = woodTexture(dark);
    desk.material.needsUpdate = true;
    mats.page.map = paperTexture(dark); mats.page.needsUpdate = true;
    mats.edge.map = edgeTexture(dark); mats.edge.needsUpdate = true;
    sheetFront.material.map = paperTexture(dark); sheetFront.material.needsUpdate = true;
    sheetBack.material.map = printedLines(dark); sheetBack.material.needsUpdate = true;
    hemi.intensity = dark ? 0.9 : 1.5;
    sun.intensity = dark ? 1.5 : 2.3;
    scene.background = new THREE.Color(dark ? 0x15120f : 0xe4d5bb);
  }
  darkQuery.addEventListener?.('change', recolor);
  recolor();

  // ---------------------------------------------------------- start

  const fromHash = /^#lesson-(\d+)$/.exec(location.hash);
  index = fromHash ? Math.max(1, Math.min(total, Number(fromHash[1]))) : 0;
  document.documentElement.classList.add('bk-live');
  setBlocks(thick(index));
  mountFigure(index);
  setMode(preferred());
  fig.pop = 0;
  if (!fromHash && mode === '3d' && !testing) openCover(); else hinge.rotation.z = TILT;
  if (!opening) popTo(1, fromHash ? 0.5 : 0.6);
  updateBar();
  addEventListener('resize', () => {
    if (store('bk-view') === null) setMode(preferred());
    layout();
  });
  new ResizeObserver(() => layout()).observe(stage);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; last = performance.now(); });
  layout();
  requestAnimationFrame(loop);
  addEventListener('hashchange', () => {
    const m = /^#lesson-(\d+)$/.exec(location.hash);
    if (m) go(Number(m[1]));
  });
  // Paper has no buttons. Print the whole document: every page back in its
  // lesson and every prediction's answer open. Then put the book back.
  let opened = null;
  addEventListener('beforeprint', () => {
    if (opened) return;
    closeNotes();
    for (const n of [...homes.keys()]) giveBack(n);
    opened = [...document.querySelectorAll('.predict details:not([open])')];
    opened.forEach((d) => (d.open = true));
  });
  addEventListener('afterprint', () => {
    if (!opened) return;
    opened.forEach((d) => (d.open = false));
    opened = null;
    placeDOM();
  });

  if (testing) {
    window.__book = {
      get index() { return index; },
      get mode() { return mode; },
      lessons: lessons.map((l) => ({ figure: l.figureName, steps: l.steps.length, title: l.title })),
      manual(on = true) { manual = on; last = performance.now(); },
      advance(ms, step = 1000 / 60, draw = true) {
        for (let t = 0; t < ms; t += step) tick(step / 1000);
        if (draw) render();
      },
      go(i) { go(i); },
      jump(i) { go(i, { instant: true }); },
      step() { if (fig) runStep(fig.done); },
      restart() { restart(); },
      playAll() { if (fig) { fig.queue = true; runStep(fig.done); } },
      setMode(m) { setMode(m); },
      state() {
        return {
          index, mode, turning: !!turn, opening: !!opening,
          done: fig?.done ?? 0, steps: fig?.obj.steps.length ?? 0, pageSteps: lessons[index].steps.length,
          running: fig?.run ? fig.run.i : -1, pop: fig?.pop ?? 0,
          leftOverflow: leftEl.scrollHeight - leftEl.clientHeight,
        };
      },
      // world positions of every mesh in the figure, for the frame-jump scan
      positions() {
        const out = [];
        if (!fig) return out;
        fig.obj.group.updateMatrixWorld(true);
        const v = new THREE.Vector3();
        const sc = new THREE.Vector3();
        fig.obj.group.traverse((o) => {
          if ((o.isMesh || o.isInstancedMesh) && !o.userData.isOutline) {
            let shown = true;
            for (let a = o; a; a = a.parent) if (!a.visible) { shown = false; break; }
            o.getWorldPosition(v); o.getWorldScale(sc);
            out.push([v.x, v.y, v.z, shown ? Math.max(sc.x, sc.y, sc.z) : 0]);
          }
        });
        return out;
      },
      figure() { return fig?.obj; },
      THREE, scene, camera, renderer,
    };
  }
}

main().catch((e) => {
  console.error('books:', e);
  document.documentElement.classList.remove('bk-3d', 'bk-flat', 'bk-live');
  document.documentElement.classList.add('bk-static');
});
