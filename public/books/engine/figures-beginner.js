// Book 1, Meet the Microduck: the pop-up on each right-hand page.
//
// A figure is a function of its step and how far through it is. Every step
// ends exactly where the next one begins, and reset() puts the very first
// picture back, so a reader can play it again and get the same thing.

import * as K from './kit.js';

const { THREE } = K;
const { ease, seg, lerp, clamp } = K;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function show(label, on) { label.userData.el.classList.toggle('is-hidden', !on); }

// Dots that run along curves, for signals moving through the duck.
function stream(group, color, n = 6, r = 6) {
  const dots = [];
  for (let i = 0; i < n; i++) { const d = K.packet(color, r); d.visible = false; group.add(d); dots.push(d); }
  return {
    dots,
    // u: 0..1 progress; each dot rides its own curve, staggered
    at(curves, u, spread = 0.5) {
      dots.forEach((d, i) => {
        const c = curves[i % curves.length];
        const t = clamp((u - (i / dots.length) * spread) / (1 - spread));
        d.visible = u > 0 && t > 0 && t < 1;
        if (d.visible) d.position.copy(c.getPoint(t));
      });
    },
    hide() { dots.forEach((d) => (d.visible = false)); },
  };
}

function curveBetween(a, b, lift = 60) {
  const m = a.clone().lerp(b, 0.5); m.y += lift;
  return new THREE.QuadraticBezierCurve3(a.clone(), m, b.clone());
}

// The duck walks from one board square to the next, or turns on the spot.
function moveDuck(duck, from, to, u, scale) {
  const p = from.pos.clone().lerp(to.pos, ease.inOut(u));
  duck.root.position.copy(p);
  let a0 = from.yaw, a1 = to.yaw;
  while (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
  while (a1 - a0 < -Math.PI) a1 += Math.PI * 2;
  duck.root.rotation.y = lerp(a0, a1, ease.inOut(u));
  const dist = from.pos.distanceTo(to.pos) / scale;
  if (dist > 1) duck.walkPose(K.Duck.phaseFor(dist * ease.inOut(u)), { stride: 40 });
  else if (Math.abs(a1 - a0) > 0.01) duck.walkPose(u * 2, { stride: 0, lift: 12 });
  else duck.setJoints(duck.stand);
}

export const figures = {

  // ------------------------------------------------------------ the title page
  cover(ctx) {
    const { group } = ctx;
    const duck = new K.Duck({ scale: 1.05 });
    duck.root.position.set(-20, 0, 70);
    duck.root.rotation.y = -0.75;
    group.add(duck.root);
    const t1 = K.tree(150); t1.position.set(150, 0, -140); group.add(t1);
    const t2 = K.tree(110); t2.position.set(-170, 0, -170); group.add(t2);
    const p = K.pond(52); p.position.set(140, 0, 120); group.add(p);
    const cards = new THREE.Group();
    [K.CARDS.walk_forward, K.CARDS.turn_left, K.CARDS.chirp].forEach((c, i) => {
      const card = K.duckCard(c);
      card.position.set(-150 + i * 34, 2 + i * 2.6, 150 + i * 6);
      card.rotation.y = 0.35 - i * 0.28;
      cards.add(card);
    });
    group.add(cards);
    return {
      group, steps: [],
      reset() { duck.setJoints(duck.stand); },
      idle(t) {
        const a = duck.stand.slice();
        a[5] = duck.stand[5] + Math.sin(t * 1.3) * 0.1;
        a[7] = Math.sin(t * 0.7) * 0.45;
        a[6] = duck.stand[6] + Math.sin(t * 1.9) * 0.08;
        duck.setJoints(a);
        duck.beak(Math.max(0, Math.sin(t * 2.4) - 0.7) * 3);
      },
    };
  },

  // ------------------------------------------------------------ 1. the robot
  parts(ctx) {
    const { group } = ctx;
    const duck = new K.Duck({ scale: 1.15 });
    const home = V(-50, 0, 80);
    duck.root.position.copy(home);
    duck.root.rotation.y = -0.45;
    group.add(duck.root);
    group.updateMatrixWorld(true);

    const names = [
      ['body', duck.shell, V(0, 46, 30)],
      ['legs', duck.right.knee, V(-34, 0, 18)],
      ['neck', duck.parts.neckPitch, V(-26, 34, 16)],
      ['head', duck.head, V(-8, 44, 0)],
      ['beak', duck.jaw, V(30, -18, 0)],
    ].map(([text, parent, at]) => {
      const l = ctx.label(text, at, { parent });
      show(l, false);
      return l;
    });
    const downArrow = K.arrow([[0, 0, 0], [0, -60, 0]], { color: K.COL.orange, width: 6, head: 18 });
    duck.imu.add(downArrow);
    downArrow.visible = false;
    const feel = ctx.label('feels which way is down', V(0, 30, 6), { parent: duck.imu, cls: 'is-accent' });
    show(feel, false);
    const brainLabel = ctx.label('brain', V(0, 22, 6), { parent: duck.brain, cls: 'is-green' });
    show(brainLabel, false);

    // the loop drawn round the duck, lying on the page
    const loop = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(205, 4, 8, 90, Math.PI * 1.75), K.paper(K.COL.orange));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 4;
    loop.add(ring);
    const head = new THREE.Mesh(new THREE.ConeGeometry(14, 30, 16), K.paper(K.COL.orange));
    head.position.set(Math.cos(Math.PI * 1.75) * 205, 4, -Math.sin(Math.PI * 1.75) * 205);
    head.rotation.set(0, 0, 0);
    head.rotation.x = Math.PI / 2;
    head.rotation.z = -Math.PI * 1.75;
    loop.add(head);
    loop.position.set(home.x + 20, 0, home.z - 10);
    loop.scale.set(1, 1, 0.62);
    group.add(loop);
    const words = ['sense', 'think', 'move'].map((w, i) => {
      const a = Math.PI * 0.75 + i * (Math.PI * 2 / 3);
      const l = ctx.label(w, V(home.x + 20 + Math.cos(a) * 205, 14, home.z - 10 - Math.sin(a) * 128), { cls: 'is-big' });
      show(l, false);
      return l;
    });

    const flow = new THREE.Group();
    group.add(flow);
    const toBrain = stream(flow, K.COL.yellow, 10, 5.5);
    const toMotors = stream(flow, K.COL.green, 10, 5.5);
    const joints = [2, 3, 4, 11, 12, 13, 5, 6];
    const at = (o) => { const v = new THREE.Vector3(); o.getWorldPosition(v); group.worldToLocal(v); return v; };
    let curvesIn = [], curvesOut = [];
    const buildCurves = () => {
      group.updateMatrixWorld(true);
      const b = at(duck.brain);
      curvesIn = [at(duck.imu), ...joints.map((j) => at(duck.joints[j]))].map((p) => curveBetween(p, b, 50));
      curvesOut = joints.map((j) => curveBetween(b, at(duck.joints[j]), 50));
    };

    let loops = 0, counting = false, motorsLit = 0;
    const state = { phase: 0 };
    const api = {
      group,
      reset() {
        duck.root.position.copy(home);
        duck.setJoints(duck.stand);
        duck.imu.visible = false; duck.brain.visible = false;
        duck.dots_off();
        downArrow.visible = false;
        names.forEach((l) => show(l, false));
        show(feel, false); show(brainLabel, false);
        words.forEach((l) => show(l, false));
        loop.visible = false;
        toBrain.hide(); toMotors.hide();
        loops = 0; counting = false; motorsLit = 0; state.phase = 0;
      },
      chips() {
        const out = [];
        if (motorsLit) out.push(['motors', String(motorsLit)]);
        if (counting || loops) out.push(['loops', String(loops)]);
        return out;
      },
      steps: [
        { dur: 1.6, start() { ctx.sound('pop'); },
          run(u) { names.forEach((l, i) => show(l, u >= i * 0.16)); } },
        { dur: 3.2,
          start() { duck.imu.visible = true; downArrow.visible = true; show(feel, true); ctx.sound('tick'); names.forEach((l) => show(l, false)); },
          run(u) {
            const n = Math.min(14, Math.floor(seg(u, 0.25, 0.95) * 14 + (u >= 0.95 ? 1 : 0)));
            for (let i = 0; i < 14; i++) duck.dot(i, i < n, K.COL.yellow);
            if (n !== motorsLit && n > 0) ctx.sound('tick');
            motorsLit = n;
            downArrow.scale.y = 0.6 + 0.4 * Math.abs(Math.sin(u * 9));
          },
          end() { show(feel, false); } },
        { dur: 2.2,
          start() { duck.brain.visible = true; show(brainLabel, true); buildCurves(); ctx.sound('whirr'); },
          run(u) { toBrain.at(curvesIn, u, 0.55); duck.brain.scale.setScalar(1 + 0.25 * Math.sin(u * Math.PI)); },
          end() { toBrain.hide(); } },
        { dur: 2.4,
          start() { buildCurves(); },
          run(u) {
            toMotors.at(curvesOut, seg(u, 0, 0.55), 0.5);
            const w = seg(u, 0.45, 1);
            const e = 26 * ease.inOut(w);
            duck.root.position.set(home.x + e * Math.cos(0.45), 0, home.z + e * Math.sin(0.45));
            duck.walkPose(K.Duck.phaseFor(26 * ease.inOut(w)) + 0.15 * Math.sin(w * Math.PI), { stride: 30 });
            if (w >= 1) duck.setJoints(duck.stand);
          },
          end() { toMotors.hide(); duck.setJoints(duck.stand); } },
        { dur: 3.0,
          start() { loop.visible = true; counting = true; loops = 0; show(brainLabel, false); ctx.sound('pop'); },
          run(u, dt) {
            loops = Math.floor(u * 3.0 * 50);
            ring.rotation.z = -u * Math.PI * 6;
            loop.rotation.y = 0;
            const k = Math.floor(u * 3.0 * 2) % 3;
            words.forEach((l, i) => { show(l, true); l.userData.el.classList.toggle('is-accent', i === k); });
            state.phase = u * 6;
            duck.walkPose(state.phase, { stride: 0, lift: 10 });
          },
          end() { loops = 150; } },
      ],
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 2. a program
  sequence(ctx) {
    const { group } = ctx;
    const S = 0.42;
    const board = new K.Board({ cols: 3, rows: 3, cell: 118 });
    board.group.position.set(0, 0, -60);
    group.add(board.group);
    const pondAt = board.at(2, 1).add(board.group.position);
    const pond = K.pond(44);
    pond.position.set(pondAt.x, board.top, pondAt.z);
    group.add(pond);
    const duck = new K.Duck({ scale: S });
    group.add(duck.root);
    const row = [K.CARDS.walk_forward, K.CARDS.turn_right, K.CARDS.walk_forward, K.CARDS.walk_forward];
    const cards = new THREE.Group();
    group.add(cards);
    const cardObjs = row.map((c, i) => {
      const card = K.duckCard(c, { w: 70, h: 96 });
      card.userData.home = V(-114 + i * 76, 0, 152);
      cards.add(card);
      return card;
    });
    const start = { c: 0, r: 2, h: 0 };
    const states = K.playRow(row, start);
    const pose = (s) => ({ pos: board.at(s.c, s.r).add(board.group.position), yaw: K.HEADING[s.h].yaw });
    const poses = states.map(pose);
    let splash = null;
    const api = {
      group,
      reset() {
        duck.root.position.copy(poses[0].pos);
        duck.root.rotation.y = poses[0].yaw;
        duck.setJoints(duck.stand);
        cardObjs.forEach((c) => { c.position.copy(c.userData.home); c.position.y = 260; c.rotation.set(0.6, 0.4, 0.2); c.visible = false; });
        board.clearPaint();
        if (splash) splash.visible = false;
      },
      steps: [
        { dur: 1.2, start() { ctx.say('3 × 3', V(0, 60, -60), { sound: 'pop', cls: 'is-blue' }); }, run(u) {
          board.paint(0, 2, u > 0.3 ? 0xffe0a8 : undefined);
        } },
        { dur: 2.0, run(u) {
          cardObjs.forEach((c, i) => {
            const v = seg(u, i * 0.18, i * 0.18 + 0.4);
            c.visible = v > 0;
            c.position.y = lerp(260, 0, ease.land(v));
            c.rotation.set(0.6 * (1 - v), 0.4 * (1 - v), 0.2 * (1 - v));
            if (v > 0 && !c.userData.landed && v >= 1) { c.userData.landed = true; ctx.sound('tick'); }
          });
        }, end() { cardObjs.forEach((c) => { c.userData.landed = false; }); } },
        { dur: 5.2, run(u) {
          const n = row.length;
          const k = Math.min(n - 1, Math.floor(u * n));
          const v = clamp(u * n - k);
          cardObjs.forEach((c, i) => {
            c.position.y = i === k && u < 1 ? 10 * Math.sin(v * Math.PI) : 0;
            c.userData.body.material = K.paper(i === k && u < 1 ? 0xffd27a : 0xffffff);
          });
          moveDuck(duck, poses[k], poses[k + 1], v, S);
          const s = states[k + 1];
          if (v > 0.95) board.paint(s.c, s.r, 0xffe0a8);
        }, end() { duck.setJoints(duck.stand); cardObjs.forEach((c) => { c.position.y = 0; c.userData.body.material = K.paper(0xffffff); }); } },
        { dur: 1.6, start() { ctx.say('SPLASH!', pondAt.clone().setY(80), { sound: 'bloop', cls: 'is-blue', scale: 1.2 }); board.paint(2, 1, 0xbfe6c4); },
          run(u) {
            duck.root.position.y = board.top + Math.sin(seg(u, 0, 0.5) * Math.PI) * 30;
            duck.beak(Math.sin(u * Math.PI * 4) > 0 ? 1 : 0);
          }, end() { duck.root.position.y = board.top; duck.beak(0); } },
      ],
      idle(t) {},
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 3. loops
  loops(ctx) {
    const { group } = ctx;
    const S = 0.34;
    const board = new K.Board({ cols: 4, rows: 4, cell: 92 });
    board.group.position.set(0, 0, -78);
    group.add(board.group);
    const duck = new K.Duck({ scale: S });
    group.add(duck.root);
    const side = [K.CARDS.walk_forward, K.CARDS.walk_forward, K.CARDS.turn_left];
    const long = [...side, ...side, ...side, ...side];
    const start = { c: 0, r: 3, h: 1 };
    const states = K.playRow(long, start);
    const pose = (s) => ({ pos: board.at(s.c, s.r).add(board.group.position), yaw: K.HEADING[s.h].yaw });
    const poses = states.map(pose);
    const cards = new THREE.Group();
    group.add(cards);
    const cw = 46, ch = 62;
    const longAt = (i) => V(-135 + (i % 6) * 54, 0, 150 + Math.floor(i / 6) * 70);
    const shortAt = (j) => V(-128 + j * 64, 0, 186);
    const longCards = long.map((c, i) => { const o = K.duckCard(c, { w: cw, h: ch }); cards.add(o); return o; });
    const rep = K.duckCard({ id: 'repeat', name: 'Repeat 4 times', code: 102, cat: 'control' }, { w: cw, h: ch });
    const endRep = K.duckCard(K.CARDS.end_repeat, { w: cw, h: ch });
    cards.add(rep, endRep);
    let laps = 0, lapsOn = false;
    const light = (o, on) => { o.userData.body.material = K.paper(on ? 0xffd27a : 0xffffff); o.position.y = on ? 6 : 0; };
    const walkRow = (u, n, idxOf) => {
      const k = Math.min(n - 1, Math.floor(u * n));
      const v = clamp(u * n - k);
      moveDuck(duck, poses[k], poses[k + 1], v, S);
      return k;
    };
    const api = {
      group,
      reset() {
        duck.root.position.copy(poses[0].pos); duck.root.rotation.y = poses[0].yaw; duck.setJoints(duck.stand);
        longCards.forEach((o, i) => { light(o, false); o.position.copy(longAt(i)); o.position.y = 220; o.visible = false; });
        rep.visible = false; endRep.visible = false;
        rep.position.copy(shortAt(0)); endRep.position.copy(shortAt(4));
        laps = 0; lapsOn = false;
      },
      chips() { return lapsOn ? [['time round', `${laps} of 4`]] : []; },
      steps: [
        { dur: 2.2, run(u) {
          longCards.forEach((o, i) => {
            const v = seg(u, i * 0.06, i * 0.06 + 0.3);
            o.visible = v > 0;
            o.position.y = lerp(220, 0, ease.land(v));
          });
          if (u > 0.5 && !api._said) { api._said = true; ctx.say('12 cards', V(0, 90, 185), { sound: 'pop' }); }
        }, end() { api._said = false; } },
        { dur: 7.2, run(u) {
          const k = walkRow(u, 12);
          longCards.forEach((o, i) => light(o, i === k && u < 1));
        }, end() { longCards.forEach((o) => light(o, false)); duck.setJoints(duck.stand); } },
        { dur: 2.6, start() { ctx.sound('swish'); }, run(u) {
          const a = ease.inOut(seg(u, 0, 0.6));
          longCards.forEach((o, i) => {
            const j = i % 3;
            const from = longAt(i), to = shortAt(j + 1);
            o.position.lerpVectors(from, to, a);
            o.position.y = Math.sin(a * Math.PI) * (i >= 3 ? 30 : 10);
            if (i >= 3) o.visible = a < 0.999;
          });
          const b = ease.back(seg(u, 0.55, 1));
          rep.visible = endRep.visible = u > 0.55;
          rep.scale.setScalar(Math.max(0.01, b)); endRep.scale.setScalar(Math.max(0.01, b));
        }, end() { rep.scale.setScalar(1); endRep.scale.setScalar(1); ctx.say('5 cards', V(0, 90, 185), { sound: 'ding' }); } },
        { dur: 7.2, start() { lapsOn = true; laps = 1; }, run(u) {
          const k = walkRow(u, 12);
          laps = Math.min(4, Math.floor(k / 3) + 1);
          const j = k % 3;
          longCards.slice(0, 3).forEach((o, i) => light(o, i === j && u < 1));
          rep.userData.body.material = K.paper(u < 1 && (k % 3 === 0 && clamp(u * 12 - k) < 0.25) ? 0xffd27a : 0xffffff);
        }, end() { longCards.slice(0, 3).forEach((o) => light(o, false)); rep.userData.body.material = K.paper(0xffffff); duck.setJoints(duck.stand); laps = 4; } },
      ],
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 4. events
  falls(ctx) {
    const { group } = ctx;
    const S = 0.5;
    const path = new THREE.Mesh(new THREE.PlaneGeometry(420, 120), K.paper(0xece4d2));
    path.rotation.x = -Math.PI / 2; path.position.set(0, 0.8, 100); path.receiveShadow = true;
    const floor = new THREE.Group(); floor.add(path); group.add(floor);
    const rows = new THREE.Group(); group.add(rows);
    const row1 = [K.CARDS.start, K.CARDS.walk_forward, K.CARDS.walk_forward, K.CARDS.end];
    const row2 = [K.CARDS.when_falls, K.CARDS.alarm, K.CARDS.walk_backward];
    const cw = 50, chh = 68;
    const r1 = row1.map((c, i) => { const o = K.duckCard(c, { w: cw, h: chh }); o.userData.home = V(-150 + i * 58, 0, -210); rows.add(o); return o; });
    const r2 = row2.map((c, i) => { const o = K.duckCard(c, { w: cw, h: chh }); o.userData.home = V(-150 + i * 58, 0, -128); rows.add(o); return o; });
    const wait = ctx.label('waiting…', V(60, 30, -128), { cls: 'is-small' });
    const duck = new K.Duck({ scale: S });
    group.add(duck.root);
    const ballG = new THREE.Group();
    const ballFace = K.canvasTexture(128, 64, (c, w, h) => { c.fillStyle = '#d8432e'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; for (let i = 0; i < 4; i++) c.fillRect(i * 32 + 8, 0, 14, h); });
    const ball = K.solid(new THREE.SphereGeometry(22, 24, 16), K.COL.red, { material: new THREE.MeshToonMaterial({ map: ballFace.tex }) });
    ballG.add(ball); group.add(ballG);
    const x0 = -150, x1 = -40, x2 = -100;
    const hit = V(x1 + 6, 22, 142);
    const ballStart = V(170, 22, 230);
    const light = (o, on, dim) => { o.userData.body.material = K.paper(on ? 0xffd27a : dim ? 0xd9d4ca : 0xffffff); o.position.y = on ? 6 : 0; };
    const api = {
      group,
      reset() {
        duck.root.position.set(x0, 0, 100); duck.root.rotation.y = 0; duck.fall(0); duck.setJoints(duck.stand);
        [...r1, ...r2].forEach((o) => { light(o, false); o.position.copy(o.userData.home); o.position.y = 200; o.visible = false; });
        show(wait, false);
        ballG.position.copy(ballStart); ballG.visible = false;
      },
      steps: [
        { dur: 2.2, run(u) {
          [...r1, ...r2].forEach((o, i) => { const v = seg(u, i * 0.08, i * 0.08 + 0.35); o.visible = v > 0; o.position.y = lerp(200, 0, ease.land(v)); });
          if (u > 0.75) { r2.forEach((o) => light(o, false, true)); show(wait, true); }
        } },
        { dur: 3.0, run(u) {
          const k = u < 0.5 ? 1 : 2;
          r1.forEach((o, i) => light(o, i === k && u < 1));
          const d = (x1 - x0) * ease.inOut(u);
          duck.root.position.x = x0 + d;
          duck.walkPose(K.Duck.phaseFor(d / S), { stride: 40 });
        }, end() { r1.forEach((o) => light(o, false)); duck.setJoints(duck.stand); } },
        { dur: 2.0, start() { ballG.visible = true; }, run(u) {
          const a = seg(u, 0, 0.45);
          ballG.position.lerpVectors(ballStart, hit, ease.in(a));
          ball.rotation.x -= 0.2; ball.rotation.z += 0.1;
          if (u > 0.45 && !api._thud) { api._thud = true; ctx.say('BUMP!', V(x1, 140, 110), { sound: 'thud', cls: 'is-red' }); }
          const f = seg(u, 0.45, 0.9);
          duck.fall(f, 'back');
          if (u > 0.45) ballG.position.lerpVectors(hit, V(hit.x + 70, 22, hit.z + 60), ease.out(seg(u, 0.45, 1)));
        }, end() { api._thud = false; } },
        { dur: 2.2, run(u) {
          duck.fall(1 - ease.inOut(u), 'back');
          duck.crouchPose(Math.sin(u * Math.PI) * 0.6);
          ballG.position.x = hit.x + 70 + u * 80;
        }, end() { duck.fall(0); duck.setJoints(duck.stand); } },
        { dur: 3.6, start() { show(wait, false); light(r2[0], true); ctx.sound('ding'); }, run(u) {
          if (u > 0.15 && u < 0.5) { light(r2[0], false, false); light(r2[1], true); }
          if (u > 0.2 && !api._alarm) { api._alarm = true; ctx.say('ALARM!', V(x1, 150, 100), { sound: 'quack', cls: 'is-red', scale: 1.1 }); }
          duck.beak(u > 0.2 && u < 0.45 ? (Math.sin(u * 60) > 0 ? 1 : 0.2) : 0);
          if (u >= 0.5) {
            light(r2[1], false, false); light(r2[2], true);
            const w = seg(u, 0.5, 1);
            const d = (x1 - x2) * ease.inOut(w);
            duck.root.position.x = x1 - d;
            duck.walkPose(-K.Duck.phaseFor(d / S), { stride: 40 });
          }
        }, end() { api._alarm = false; r2.forEach((o) => light(o, false)); duck.setJoints(duck.stand); duck.beak(0); } },
      ],
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 5. balance
  balance(ctx) {
    const { group } = ctx;
    const S = 0.95;
    const duck = new K.Duck({ scale: S });
    const home = V(-80, 0, 75);
    duck.root.position.copy(home);
    group.add(duck.root);
    // the middle point rides with the duck; a string hangs straight down from it
    const com = new THREE.Group();
    com.position.set(12, 148, 62);
    duck.hips.add(com);
    const bead = K.ball(10, K.COL.red);
    com.add(bead);
    const comLabel = ctx.label('middle point', V(0, 26, 0), { parent: com, cls: 'is-red' });
    const string = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1, 8), K.flat(K.COL.ink));
    const bob = K.cone(7, 14, K.COL.red);
    const hang = new THREE.Group(); hang.add(string, bob); group.add(hang);
    const toe = 44, heel = -22;
    const support = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), K.flat(0x3fae6a, { transparent: true, opacity: 0.35, depthWrite: false }));
    support.rotation.x = -Math.PI / 2; support.position.y = 1.2;
    const sup = new THREE.Group(); sup.add(support); group.add(sup);
    const feetLabel = ctx.label('under the feet', V(home.x + 10, 8, home.z + 84), { cls: 'is-green' });
    const pivot = new THREE.Vector3();
    let angle = 0, fallen = 0, stepX = 0, mode = 'step', manual = 0, stepActive = false;
    const critical = Math.atan2(toe - 12, 148);
    const lean = (a) => {
      duck.tip.position.set(toe, 0, 0); duck.hips.position.x = -toe;
      duck.tip.rotation.z = -a;
    };
    const setSupport = (from, to, ok) => {
      support.scale.set((to - from) * S, 92 * S, 1);
      support.position.set(home.x + stepX + ((from + to) / 2) * S, 1.2, home.z);
      support.material.color.setHex(ok ? 0x3fae6a : 0xd8432e);
    };
    const update = () => {
      lean(angle);
      duck.root.position.x = home.x + stepX;
      group.updateMatrixWorld(true);
      const p = new THREE.Vector3(); bead.getWorldPosition(p); group.worldToLocal(p);
      string.scale.y = Math.max(1, p.y - 14);
      string.position.set(p.x, (p.y + 14) / 2, p.z);
      bob.position.set(p.x, 10, p.z);
      const toeX = home.x + stepX + toe * S;
      const ok = p.x <= toeX + 0.5;
      string.material.color.setHex(ok ? K.COL.ink : K.COL.red);
      setSupport(heel, toe + (api._ext || 0), ok);
    };
    const api = {
      group,
      slider: { label: 'Lean', min: 0, max: 30, step: 0.5, value: 0, format: (v) => `${v.toFixed(0)}°`,
        input(v) { manual = (v * Math.PI) / 180; mode = 'manual'; } },
      reset() {
        angle = 0; fallen = 0; stepX = 0; mode = 'step'; manual = 0; api._ext = 0;
        duck.setJoints(duck.stand);
        bead.scale.setScalar(0.01); string.visible = false; bob.visible = false;
        support.visible = false; show(comLabel, false); show(feetLabel, false);
        update();
      },
      steps: [
        { dur: 1.6, start() { stepActive = true; mode = 'step'; show(comLabel, true); ctx.sound('pop'); }, run(u) {
          bead.scale.setScalar(Math.max(0.01, ease.back(seg(u, 0, 0.4))));
          string.visible = bob.visible = u > 0.35;
          update();
          string.scale.y *= ease.out(seg(u, 0.35, 1));
        }, end() { stepActive = false; update(); } },
        { dur: 1.4, start() { stepActive = true; support.visible = true; show(feetLabel, true); ctx.sound('tick'); }, run(u) {
          support.material.opacity = 0.35 * ease.out(u) + 0.1 * Math.sin(u * Math.PI * 4);
          update();
        }, end() { stepActive = false; support.material.opacity = 0.35; } },
        { dur: 2.6, start() { stepActive = true; show(feetLabel, false); }, run(u) {
          angle = critical * 0.93 * ease.inOut(u); update();
        }, end() { stepActive = false; } },
        { dur: 1.6, start() { stepActive = true; }, run(u) {
          angle = lerp(critical * 0.93, Math.PI * 0.47, ease.in(u)); update();
          if (u > 0.92 && !api._thud) { api._thud = true; ctx.say('THUD', V(home.x + 120, 50, home.z), { sound: 'thud', cls: 'is-red' }); }
        }, end() { stepActive = false; api._thud = false; } },
        { dur: 3.4, start() { stepActive = true; }, run(u) {
          const up = seg(u, 0, 0.3), go = seg(u, 0.3, 0.65), st = seg(u, 0.6, 1);
          if (u < 0.3) angle = lerp(Math.PI * 0.47, 0, ease.inOut(up));
          else if (u < 0.65) angle = critical * 0.9 * ease.inOut(go);
          else angle = critical * 0.9 * (1 - ease.inOut(st));
          api._ext = u >= 0.6 ? 46 * ease.out(st) : 0;
          if (u >= 0.6) {
            stepX = 46 * S * ease.inOut(st);
            const a = duck.stand.slice();
            const R = duck.solveLeg(lerp(0, 46, ease.inOut(st)) * 0.5, Math.sin(st * Math.PI) * 14);
            a[11] = R.hip; a[12] = R.knee; a[13] = R.ankle;
            duck.setJoints(a);
          } else duck.setJoints(duck.stand);
          update();
        }, end() { stepActive = false; duck.setJoints(duck.stand); api._ext = 0; update(); } },
      ],
      idle(t, dt) {
        if (stepActive || mode !== 'manual') return;
        if (fallen > 0 || manual > critical) {
          // past the toes: over it goes, until the slider comes back
          fallen = manual > critical ? Math.min(1, fallen + dt * 2.2) : Math.max(0, fallen - dt * 1.6);
          angle = lerp(Math.min(manual, critical), Math.PI * 0.47, ease.in(fallen));
          if (fallen >= 1 && !api._fell) { api._fell = true; ctx.say('THUD', V(home.x + 120, 50, home.z), { sound: 'thud', cls: 'is-red' }); }
          if (fallen < 1) api._fell = false;
        } else angle += (manual - angle) * Math.min(1, dt * 8);
        update();
      },
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 6. trying
  trying(ctx) {
    const { group } = ctx;
    const N = 4, cell = 92;
    const board = new K.Board({ cols: N, rows: N, cell });
    board.group.position.set(0, 0, -40);
    group.add(board.group);
    // walls between squares: [c, r, 'h'|'v'] blocks moving down from (c,r) or right from (c,r)
    const walls = [[0, 2, 'h'], [1, 2, 'h'], [2, 2, 'h'], [1, 0, 'v'], [1, 1, 'v']];
    const blocked = (c, r, dc, dr) => {
      if (dr === 1) return walls.some((w) => w[2] === 'h' && w[0] === c && w[1] === r);
      if (dr === -1) return walls.some((w) => w[2] === 'h' && w[0] === c && w[1] === r - 1);
      if (dc === 1) return walls.some((w) => w[2] === 'v' && w[0] === c && w[1] === r);
      if (dc === -1) return walls.some((w) => w[2] === 'v' && w[0] === c - 1 && w[1] === r);
      return false;
    };
    const wallG = new THREE.Group();
    for (const [c, r, k] of walls) {
      const p = board.at(c, r).add(board.group.position);
      const w = K.box(k === 'h' ? cell : 8, 26, k === 'h' ? 8 : cell, 0x8a6a4a);
      w.position.set(p.x + (k === 'v' ? cell / 2 : 0), board.top + 13, p.z + (k === 'h' ? cell / 2 : 0));
      wallG.add(w);
    }
    group.add(wallG);
    const goal = { c: 3, r: 0 }, start = { c: 0, r: 3 };
    const pondAt = board.at(goal.c, goal.r).add(board.group.position);
    const pond = K.pond(34); pond.position.set(pondAt.x, board.top, pondAt.z); group.add(pond);
    const duck = new K.Duck({ scale: 0.26 });
    group.add(duck.root);
    // the toy learner: every square keeps a number for how good it is to stand on
    const moves = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const learn = (seed) => {
      const R = K.rng(seed);
      const Vt = Array.from({ length: N }, () => new Array(N).fill(0));
      const episodes = [];
      for (let k = 0; k < 40; k++) {
        const eps = Math.max(0.06, Math.pow(0.86, k));
        let c = start.c, r = start.r;
        const path = [[c, r]];
        const limit = k === 0 ? 120 : 60;
        while (!(c === goal.c && r === goal.r) && path.length < limit) {
          const opts = moves.filter(([dc, dr]) => c + dc >= 0 && c + dc < N && r + dr >= 0 && r + dr < N && !blocked(c, r, dc, dr));
          let m;
          if (R() < eps) m = opts[Math.floor(R() * opts.length)];
          else {
            const best = Math.max(...opts.map(([dc, dr]) => Vt[r + dr][c + dc]));
            const top = opts.filter(([dc, dr]) => Vt[r + dr][c + dc] >= best - 1e-9);
            m = top[Math.floor(R() * top.length)];
          }
          c += m[0]; r += m[1];
          path.push([c, r]);
        }
        const reached = c === goal.c && r === goal.r;
        if (reached) {
          const T = path.length - 1;
          const seen = new Set();
          for (let t = T; t >= 0; t--) {
            const [pc, pr] = path[t];
            const key = pc + ',' + pr;
            if (seen.has(key)) continue;
            seen.add(key);
            const G = Math.pow(0.82, T - t);
            Vt[pr][pc] += 0.6 * (G - Vt[pr][pc]);
          }
        }
        episodes.push({ path, reached, V: Vt.map((row) => row.slice()) });
      }
      return episodes;
    };
    let seed = 1, episodes = learn(seed);
    while (!episodes[0].reached || episodes[0].path.length < 14 || episodes[0].path.length > 60) { seed++; episodes = learn(seed); }
    const greedy = (Vt) => {
      const out = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (c === goal.c && r === goal.r) continue;
        const opts = moves.filter(([dc, dr]) => c + dc >= 0 && c + dc < N && r + dr >= 0 && r + dr < N && !blocked(c, r, dc, dr));
        let best = null, bv = -1;
        for (const m of opts) { const v = Vt[r + m[1]][c + m[0]]; if (v > bv) { bv = v; best = m; } }
        // a square the learner never valued gets no arrow: it has not learned one
        out.push({ c, r, m: Object.assign([...best], { known: bv > 0.02 }) });
      }
      return out;
    };
    const arrows = new THREE.Group(); group.add(arrows);
    const arrowObjs = greedy(episodes[39].V).map(({ c, r, m }) => {
      const a = new THREE.Mesh(new THREE.ConeGeometry(11, 30, 3), K.paper(K.COL.orange));
      const p = board.at(c, r).add(board.group.position);
      a.position.set(p.x, board.top + 3, p.z);
      a.rotation.order = 'YXZ';
      a.rotation.set(-Math.PI / 2, Math.atan2(-m[0], -m[1]), 0);
      a.visible = m.known;
      arrows.add(a);
      return a;
    });
    const paint = (Vt, k = 1) => {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (c === goal.c && r === goal.r) continue;
        const v = clamp(Vt[r][c] * k);
        const col = new THREE.Color(board.tile(c, r).userData.base).lerp(new THREE.Color(0xffc93d), v);
        board.tile(c, r).material.color.copy(col);
      }
    };
    const zero = Array.from({ length: N }, () => new Array(N).fill(0));
    const place = (c, r, yaw) => { const p = board.at(c, r).add(board.group.position); duck.root.position.copy(p); if (yaw !== undefined) duck.root.rotation.y = yaw; };
    const yawOf = (path, k) => { const [c0, r0] = path[k], [c1, r1] = path[k + 1]; return Math.atan2(-(r1 - r0), c1 - c0); };
    const walkPath = (path, u) => {
      const n = path.length - 1;
      const f = u * n, k = Math.min(n - 1, Math.floor(f)), v = f - k;
      const [c0, r0] = path[k], [c1, r1] = path[k + 1];
      const p0 = board.at(c0, r0).add(board.group.position), p1 = board.at(c1, r1).add(board.group.position);
      duck.root.position.lerpVectors(p0, p1, v);
      // turn into each new square rather than snapping round
      let y0 = k > 0 ? yawOf(path, k - 1) : Math.PI / 2, y1 = yawOf(path, k);
      while (y1 - y0 > Math.PI) y1 -= Math.PI * 2;
      while (y1 - y0 < -Math.PI) y1 += Math.PI * 2;
      duck.root.rotation.y = lerp(y0, y1, ease.inOut(clamp(v / 0.4)));
      duck.walkPose(f * 1.2, { stride: 24, lift: 18 });
    };
    // footprints of one try, drawn as it goes
    const steps = new THREE.Group(); group.add(steps);
    const prints = Array.from({ length: 60 }, () => { const m = new THREE.Mesh(new THREE.CircleGeometry(6, 12), K.flat(0x8a6a4a, { transparent: true, opacity: 0.55 })); m.rotation.x = -Math.PI / 2; m.visible = false; steps.add(m); return m; });
    const trail = (path, v) => {
      prints.forEach((m, i) => {
        if (!path || i >= path.length) { m.visible = false; return; }
        m.visible = i <= v * (path.length - 1);
        const p = board.at(path[i][0], path[i][1]).add(board.group.position);
        m.position.set(p.x + ((i * 7) % 11) - 5, board.top + 0.6, p.z + ((i * 5) % 9) - 4);
      });
    };
    let tries = 0, points = 0;
    const api = {
      group,
      reset() { trail(null); duck.root.scale.setScalar(0.26); tries = 0; points = 0; place(start.c, start.r, Math.PI / 2); duck.setJoints(duck.stand); board.clearPaint(); paint(zero); arrows.visible = false; arrowObjs.forEach((a) => a.scale.setScalar(0.01)); },
      chips() { return [['tries', String(tries)], ['points', String(points)]]; },
      steps: [
        { dur: 5.5, start() { tries = 1; }, run(u) {
          walkPath(episodes[0].path, u);
          if (u >= 1 && !api._p) { api._p = true; points = 1; ctx.say('+1', pondAt.clone().setY(90), { sound: 'ding', cls: 'is-green' }); }
        }, end() { api._p = false; points = 1; duck.setJoints(duck.stand); } },
        { dur: 1.6, run(u) { paint(episodes[0].V, ease.out(u)); } },
        { dur: 5.4, start() { ctx.say('RESET', pondAt.clone().setY(80), { sound: 'pop', cls: 'is-blue' }); }, run(u) {
          // a reset in a practice world is a jump, so the duck goes small, moves, and grows back
          const r = seg(u, 0, 0.16);
          duck.root.scale.setScalar(0.26 * Math.max(0.01, r < 0.5 ? 1 - r * 2 : (r - 0.5) * 2));
          if (r >= 0.5) { place(start.c, start.r, Math.PI / 2); duck.setJoints(duck.stand); }
          const w = seg(u, 0.18, 1);
          const k = 1 + Math.min(38, Math.floor(w * 39));
          if (u > 0.18) {
            tries = k + 1;
            points = episodes.slice(0, k + 1).filter((e) => e.reached).length;
            paint(episodes[k].V);
            trail(episodes[k].path, clamp(w * 39 - (k - 1)));
          }
        }, end() { duck.root.scale.setScalar(0.26); trail(null); tries = 40; points = episodes.filter((e) => e.reached).length; paint(episodes[39].V); place(start.c, start.r, Math.PI / 2); duck.setJoints(duck.stand); } },
        { dur: 3.6, start() { arrows.visible = true; ctx.sound('pop'); }, run(u) {
          arrowObjs.forEach((a, i) => a.scale.setScalar(Math.max(0.01, ease.back(seg(u, i * 0.02, i * 0.02 + 0.25)))));
          const path = [[start.c, start.r]];
          let c = start.c, r = start.r;
          const g = greedy(episodes[39].V);
          for (let s = 0; s < 12 && !(c === goal.c && r === goal.r); s++) { const m = g.find((x) => x.c === c && x.r === r).m; c += m[0]; r += m[1]; path.push([c, r]); }
          if (u > 0.3) walkPath(path, seg(u, 0.3, 1));
        }, end() { duck.setJoints(duck.stand); } },
      ],
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 7. simulation
  practice(ctx) {
    const { group } = ctx;
    const big = new K.Duck({ scale: 0.55 });
    big.root.position.set(-20, 0, 10);
    group.add(big.root);
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(260, 200, 220)), new THREE.LineBasicMaterial({ color: 0x2a64c9 }));
    frame.position.set(-10, 100, 10);
    const world = new THREE.Group(); world.add(frame); group.add(world);
    const worldLabel = ctx.label('pretend world', V(-10, 215, -100), { cls: 'is-blue' });
    const n = 64, count = n * n, gap = 6.4;
    const floorTex = K.canvasTexture(256, 256, (c, w, h) => {
      c.fillStyle = '#cfe0f2'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(42,100,201,.35)'; c.lineWidth = 2;
      for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, h); c.stroke(); c.beginPath(); c.moveTo(0, i * 32); c.lineTo(w, i * 32); c.stroke(); }
    });
    const simFloor = new THREE.Mesh(new THREE.PlaneGeometry(430, 430), new THREE.MeshToonMaterial({ map: floorTex.tex }));
    simFloor.rotation.x = -Math.PI / 2; simFloor.position.y = 0.8; simFloor.receiveShadow = true;
    const floorG = new THREE.Group(); floorG.add(simFloor); group.add(floorG);
    const crowd = K.duckCrowd(count, { size: 3.1 });
    group.add(crowd);
    const R = K.rng(11);
    const info = Array.from({ length: count }, (_, i) => ({
      x: (i % n - (n - 1) / 2) * gap, z: (Math.floor(i / n) - (n - 1) / 2) * gap,
      ph: R() * Math.PI * 2, fall: R() < 0.3 ? R() : -1, d: 0,
    }));
    info.forEach((o) => { o.d = Math.hypot(o.x, o.z); });
    const dummy = new THREE.Object3D();
    const setCrowd = (grow, t, falls, sync) => {
      for (let i = 0; i < count; i++) {
        const o = info[i];
        const s = clamp(grow * 1.95 - o.d / 300);
        const ph = lerp(o.ph, 0, sync);
        dummy.position.set(o.x, Math.abs(Math.sin(t * 6 + ph)) * 1.4 * s, o.z);
        let tilt = 0;
        if (falls > 0 && o.fall >= 0) {
          const cyc = (t * 0.35 + o.fall) % 1;
          tilt = (cyc < 0.25 ? Math.sin((cyc / 0.25) * Math.PI) : 0) * (Math.PI / 2) * falls;
        }
        dummy.rotation.set(0, Math.PI / 2, tilt);
        dummy.scale.setScalar(Math.max(0.0001, s));
        dummy.updateMatrix();
        crowd.setMatrixAt(i, dummy.matrix);
      }
      crowd.instanceMatrix.needsUpdate = true;
    };
    // a close-up of nine ducks from the crowd, big enough to see who falls and who steps
    const lens = new THREE.Group();
    const lensBase = K.cylinder(64, 64, 10, 0xfffaf0, { seg: 40 }); lensBase.position.y = 5; lens.add(lensBase);
    const lensRing = new THREE.Mesh(new THREE.TorusGeometry(64, 3, 8, 48), K.paper(0x2a64c9)); lensRing.rotation.x = Math.PI / 2; lensRing.position.y = 10; lens.add(lensRing);
    const nine = Array.from({ length: 9 }, (_, i) => {
      const d = new K.Duck({ scale: 0.16 });
      d.root.position.set((i % 3 - 1) * 34, 10, (Math.floor(i / 3) - 1) * 34); d.root.rotation.y = -0.4;
      lens.add(d.root);
      return d;
    });
    lens.position.set(140, 0, 150);
    group.add(lens);
    const lensLabel = ctx.label('close up', V(140, 34, 78), { cls: 'is-small is-blue' });
    const brain = K.chip(K.COL.green, { w: 70, d: 50, h: 12 });
    brain.position.set(0, 210, -40);
    const brainG = new THREE.Group(); brainG.add(brain); group.add(brainG);
    const brainLabel = ctx.label('one shared brain', V(0, 250, -40), { cls: 'is-green' });
    const flow = new THREE.Group(); group.add(flow);
    const sends = stream(flow, K.COL.yellow, 18, 4.5);
    const sendCurves = Array.from({ length: 18 }, (_, i) => { const o = info[Math.floor(R() * count)]; return curveBetween(V(o.x, 6, o.z), V(0, 205, -40), 40); });
    let t = 0, phase = 'one', crowdState = { grow: 0, falls: 0, sync: 0 };
    const api = {
      group,
      reset() {
        big.root.scale.setScalar(0.55); big.root.visible = true; big.fall(0); big.setJoints(big.stand); big.root.position.set(-20, 0, 10);
        world.visible = true; show(worldLabel, true);
        crowdState = { grow: 0, falls: 0, sync: 0 }; setCrowd(0, 0, 0, 0); crowd.visible = false; floorG.visible = false;
        lens.visible = false; show(lensLabel, false); nine.forEach((d) => { d.fall(0); d.setJoints(d.stand); });
        brainG.visible = false; brain.position.y = 150; show(brainLabel, false); sends.hide(); phase = 'one';
      },
      chips() { return crowd.visible ? [['pretend ducks', '4,096']] : [['pretend ducks', '1']]; },
      steps: [
        { dur: 3.4, run(u) {
          const w = seg(u, 0, 0.45);
          big.root.position.x = -20 + 50 * ease.inOut(w);
          big.walkPose(K.Duck.phaseFor(50 * ease.inOut(w) / 0.55), { stride: 40 });
          big.fall(seg(u, 0.45, 0.7), 'forward');
          if (u > 0.68 && !api._oops) { api._oops = true; ctx.say('OOPS', V(60, 120, 10), { sound: 'thud', cls: 'is-red' }); }
          const r = seg(u, 0.75, 1);
          big.root.scale.setScalar(0.55 * Math.max(0.01, r < 0.5 ? 1 - r * 2 : (r - 0.5) * 2));
          if (r >= 0.5) { big.fall(0); big.setJoints(big.stand); big.root.position.x = -20; }
          if (r > 0.5 && !api._reset) { api._reset = true; ctx.say('RESET', V(-20, 160, 10), { sound: 'pop', cls: 'is-blue' }); }
        }, end() { api._oops = api._reset = false; big.root.scale.setScalar(0.55); } },
        { dur: 2.6, start() { crowd.visible = true; floorG.visible = true; lens.visible = true; ctx.sound('swish'); }, run(u) {
          simFloor.scale.setScalar(Math.max(0.01, ease.out(seg(u, 0, 0.5))));
          big.root.scale.setScalar(0.55 * Math.max(0.01, 1 - ease.in(seg(u, 0, 0.4))));
          world.visible = u < 0.4; show(worldLabel, u < 0.3);
          crowdState.grow = ease.out(seg(u, 0.2, 1));
          setCrowd(crowdState.grow, t, 0, 0);
          lens.scale.setScalar(Math.max(0.01, ease.out(seg(u, 0.5, 1))));
          show(lensLabel, u > 0.8);
        }, end() { big.root.visible = false; crowdState.grow = 1; lens.scale.setScalar(1); } },
        { dur: 3.0, run(u) { crowdState.falls = ease.out(seg(u, 0, 0.3)); } },
        { dur: 3.0, start() { brainG.visible = true; show(brainLabel, true); ctx.sound('whirr'); }, run(u) {
          brain.position.y = lerp(150, 210, ease.out(seg(u, 0, 0.3)));
          sends.at(sendCurves, u, 0.6);
        }, end() { sends.hide(); } },
        { dur: 3.0, run(u) { crowdState.falls = 1 - ease.inOut(u); crowdState.sync = ease.inOut(u); }, end() { crowdState.falls = 0; crowdState.sync = 1; ctx.say('WALKING', V(0, 120, 0), { sound: 'ding', cls: 'is-green' }); } },
      ],
      idle(time, dt) {
        t += dt;
        if (crowd.visible) setCrowd(crowdState.grow, t, crowdState.falls, crowdState.sync);
        if (lens.visible) {
          nine.forEach((d, i) => {
            const faller = i === 1 || i === 5 || i === 6;
            if (faller && crowdState.falls > 0.05) {
              const cyc = (t * 0.35 + i * 0.13) % 1;
              d.fall((cyc < 0.25 ? Math.sin((cyc / 0.25) * Math.PI) : 0) * crowdState.falls, 'forward');
              d.setJoints(d.stand);
            } else {
              d.fall(0);
              d.walkPose(t * 1.6 + lerp(i * 0.7, 0, crowdState.sync), { stride: 0, lift: 10 });
            }
          });
        }
      },
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 8. sim to real
  pretend(ctx) {
    const { group } = ctx;
    const S = 0.3, cell = 82;
    const laneA = new K.Board({ cols: 5, rows: 1, cell, base: 0xe3edf9, alt: 0xd3e3f6 });
    laneA.group.position.set(0, 0, -120); group.add(laneA.group);
    const laneB = new K.Board({ cols: 5, rows: 1, cell });
    laneB.group.position.set(0, 0, 70); group.add(laneB.group);
    const la = ctx.label('pretend', V(-205, 30, -185), { cls: 'is-blue' });
    const lb = ctx.label('new floor', V(-205, 30, 5), { cls: 'is-accent' });
    const dA = new K.Duck({ scale: S }); group.add(dA.root);
    const dB = new K.Duck({ scale: S }); group.add(dB.root);
    const sA = laneA.at(0, 0).add(laneA.group.position), sB = laneB.at(0, 0).add(laneB.group.position);
    const targetB = laneB.at(4, 0).add(laneB.group.position);
    const ring = K.ringFlat(26, 31, K.COL.green, { y: laneB.top + 1.5 });
    ring.position.x = targetB.x; ring.position.z = targetB.z;
    const marks = new THREE.Group(); marks.add(ring); group.add(marks);
    const miss = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1, 6), K.flat(K.COL.red));
    miss.rotation.z = Math.PI / 2; marks.add(miss);
    const err1 = [[5, 6, 0.04], [-7, 10, 0.07], [9, 15, 0.1], [11, 20, 0.13]];
    const err2 = err1.map(([x, z, y]) => [x * 0.4, z * 0.4, y * 0.4]);
    // where each timed card ends: its miss so far, growing card by card
    const pathOf = (errs) => [{ x: sB.x, z: sB.z, yaw: 0 }, ...errs.map(([ex, ez, ey], i) => ({ x: sB.x + (i + 1) * cell + ex, z: sB.z + ez, yaw: -ey }))];
    const pB1 = pathOf(err1), pB2 = pathOf(err2);
    const walkLane = (duck, pts, u, wobble = 1) => {
      const n = pts.length - 1, f = u * n, k = Math.min(n - 1, Math.floor(f)), v = ease.inOut(f - k);
      const a = pts[k], b = pts[k + 1];
      duck.root.position.set(lerp(a.x, b.x, v), laneB.top, lerp(a.z, b.z, v));
      duck.root.rotation.y = lerp(a.yaw, b.yaw, v) + Math.sin(f * Math.PI * 2) * 0.05 * wobble;
      duck.walkPose(f * 2.1, { stride: 40 });
    };
    const showMiss = (p, on) => {
      miss.visible = on;
      if (!on) return;
      const dx = p.x - targetB.x, dz = p.z - targetB.z, d = Math.hypot(dx, dz);
      miss.scale.y = Math.max(1, d);
      miss.position.set((p.x + targetB.x) / 2, laneB.top + 3, (p.z + targetB.z) / 2);
      miss.rotation.set(0, -Math.atan2(dz, dx), Math.PI / 2);
    };
    const floors = [0xbfe3ff, 0xffc690, 0xd6f0c2, 0xf2d0ff];
    const push = K.arrow([[0, 0, 0], [0, 0, -60]], { color: K.COL.red, width: 8, head: 20 });
    const pushG = new THREE.Group(); pushG.add(push); group.add(pushG);
    const api = {
      group,
      reset() {
        dA.root.position.copy(sA); dA.root.rotation.y = 0; dA.setJoints(dA.stand);
        dB.root.position.copy(sB); dB.root.rotation.y = 0; dB.setJoints(dB.stand); dB.root.scale.setScalar(S);
        laneA.clearPaint(); laneB.clearPaint(); ring.visible = false; showMiss(null, false); pushG.visible = false;
      },
      steps: [
        { dur: 3.4, run(u) {
          const d = 4 * cell * ease.inOut(u);
          dA.root.position.x = sA.x + d;
          dA.walkPose(K.Duck.phaseFor(d / S), { stride: 40 });
          if (u >= 1) laneA.paint(4, 0, 0x9fe0a8);
        }, end() { dA.setJoints(dA.stand); laneA.paint(4, 0, 0x9fe0a8); ctx.say('exactly', laneA.at(4, 0).add(laneA.group.position).setY(70), { sound: 'ding', cls: 'is-blue' }); } },
        { dur: 4.0, start() { ring.visible = true; }, run(u) {
          walkLane(dB, pB1, u, 1);
          showMiss(dB.root.position, u > 0.95);
        }, end() { dB.setJoints(dB.stand); showMiss(dB.root.position, true); ctx.say('a little off', V(targetB.x, 80, targetB.z + 30), { sound: 'pop' }); } },
        { dur: 3.4, start() { showMiss(null, false); pushG.position.set(dB.root.position.x, 40, dB.root.position.z + 70); pushG.visible = true; }, run(u) {
          const k = Math.floor(u * 8);
          for (let c = 0; c < 5; c++) laneB.paint(c, 0, floors[(c + k) % floors.length]);
          pushG.position.set(dB.root.position.x, 40, dB.root.position.z + 70);
          pushG.visible = u < 0.85;
          push.position.z = -Math.sin(u * Math.PI * 4) * 12;
          dB.root.rotation.z = Math.sin(u * Math.PI * 8) * 0.04;
          if (u > 0.85) { const r = seg(u, 0.85, 1); dB.root.scale.setScalar(S * Math.max(0.01, r < 0.5 ? 1 - r * 2 : (r - 0.5) * 2)); if (r >= 0.5) { dB.root.position.copy(sB); dB.root.rotation.set(0, 0, 0); } }
        }, end() { pushG.visible = false; laneB.clearPaint(); dB.root.scale.setScalar(S); dB.root.position.copy(sB); dB.root.rotation.set(0, 0, 0); } },
        { dur: 4.0, run(u) {
          walkLane(dB, pB2, u, 0.4);
          showMiss(dB.root.position, u > 0.95);
        }, end() { dB.setJoints(dB.stand); showMiss(dB.root.position, true); ctx.say('closer', V(targetB.x, 80, targetB.z + 30), { sound: 'ding', cls: 'is-green' }); } },
      ],
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 9. company
  company(ctx) {
    const { group } = ctx;
    const S = 0.32;
    const path = new THREE.Mesh(new THREE.PlaneGeometry(420, 150), K.paper(0xe9e2d0));
    path.rotation.x = -Math.PI / 2; path.position.set(0, 0.8, 30); path.receiveShadow = true;
    const ground = new THREE.Group(); ground.add(path);
    const grass1 = K.tree(90); grass1.position.set(-170, 0, -150); ground.add(grass1);
    const grass2 = K.tree(120); grass2.position.set(60, 0, -170); ground.add(grass2);
    group.add(ground);
    const stairs = new THREE.Group();
    const steps3 = [0, 1, 2].map((i) => { const b = K.box(26, 15 * (i + 1), 150, 0xd9cdb4); b.position.set(84 + i * 26, 7.5 * (i + 1), 30); stairs.add(b); return b; });
    const top = K.box(76, 45, 150, 0xd9cdb4); top.position.set(173, 22.5, 30); stairs.add(top);
    group.add(stairs);
    const traveler = K.person({ h: 150 });
    group.add(traveler);
    const duck = new K.Duck({ scale: S });
    group.add(duck.root);
    const gapLabel = ctx.label('too far!', V(0, 120, 30), { cls: 'is-red' });
    const ask = () => ctx.say('?', duck.pointOn('head').clone().setY(110), { sound: 'quack', cls: 'is-blue', scale: 1.3 });
    const zP = 0, zD = 72;
    const st = { px: -170, dx: -195, pFace: 0, kneel: 0, lift: 0 };
    const place = () => {
      traveler.position.set(st.px, st.px > 70 ? Math.min(45, Math.max(0, (st.px - 70) * 0.55)) : 0, zP);
      traveler.rotation.y = st.pFace;
      traveler.scale.set(1, 1 - st.kneel * 0.3, 1);
    };
    const walkDuck = (x0, x1, u) => { const d = (x1 - x0) * u; duck.root.position.set(x0 + d, 0, zD); duck.root.rotation.y = 0; duck.walkPose(K.Duck.phaseFor(Math.abs(d) / S), { stride: 40 }); };
    const bob = (u, n) => { traveler.position.y += Math.abs(Math.sin(u * Math.PI * n)) * 3; };
    const api = {
      group,
      reset() { Object.assign(st, { px: -170, dx: -195, pFace: 0, kneel: 0, lift: 0 }); place(); duck.root.position.set(st.dx, 0, zD); duck.setJoints(duck.stand); show(gapLabel, false); },
      chips() { return [['duck pace', 'about 0.12 m/s']]; },
      steps: [
        { dur: 3.2, run(u) { st.px = lerp(-170, -110, u); place(); bob(u, 6); walkDuck(-195, -135, u); }, end() { duck.setJoints(duck.stand); } },
        { dur: 3.0, run(u) {
          st.px = lerp(-110, 30, ease.inOut(u)); place(); bob(u, 9);
          walkDuck(-135, -95, u);
          show(gapLabel, u > 0.5);
          gapLabel.position.x = (st.px + duck.root.position.x) / 2;
        }, end() { duck.setJoints(duck.stand); } },
        { dur: 3.6, start() { show(gapLabel, false); }, run(u) {
          const turn = seg(u, 0, 0.15), back = seg(u, 0.85, 1);
          st.pFace = u < 0.85 ? lerp(0, Math.PI, ease.inOut(turn)) : lerp(Math.PI, 0, ease.inOut(back));
          place();
          walkDuck(-95, 30, seg(u, 0.1, 0.9));
          if (u > 0.2 && u < 0.3 && !api._w) { api._w = true; ctx.say('wait', V(30, 200, 0), { cls: 'is-green' }); }
        }, end() { api._w = false; duck.setJoints(duck.stand); st.pFace = 0; place(); } },
        { dur: 3.0, run(u) {
          st.px = lerp(30, 70, seg(u, 0, 0.6)); place();
          walkDuck(30, 62, seg(u, 0, 0.55));
          if (u > 0.6 && !api._a) { api._a = true; ask(); }
          duck.beak(u > 0.6 && u < 0.8 ? 1 : 0);
          st.pFace = lerp(0, Math.PI * 0.8, ease.inOut(seg(u, 0.7, 1))); place();
        }, end() { api._a = false; duck.beak(0); duck.setJoints(duck.stand); } },
        { dur: 4.4, run(u) {
          const kneel = seg(u, 0, 0.2), carry = seg(u, 0.2, 0.75), up = seg(u, 0.75, 0.9), go = seg(u, 0.85, 1);
          st.kneel = u < 0.75 ? ease.inOut(kneel) : 1 - ease.inOut(up);
          st.px = lerp(70, 140, ease.inOut(carry)) + 30 * ease.inOut(go);
          st.pFace = u < 0.2 ? Math.PI * 0.8 : lerp(Math.PI * 0.8, 0, ease.inOut(seg(u, 0.2, 0.35)));
          place();
          const a = ease.inOut(carry);
          const x = lerp(62, 160, a), y = Math.sin(a * Math.PI) * 110 + 45 * a;
          duck.root.position.set(x, y, lerp(zD, 60, Math.sin(a * Math.PI)));
          duck.setJoints(duck.stand);
          if (go > 0) { walkDuck(160, 182, go); duck.root.position.y = 45; }
        }, end() { duck.setJoints(duck.stand); ctx.say('thank you', V(170, 150, 40), { sound: 'quack', cls: 'is-green' }); } },
      ],
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 10. making
  invent(ctx) {
    const { group } = ctx;
    const duck = new K.Duck({ scale: 0.85 });
    duck.root.position.set(-40, 0, -50);
    duck.root.rotation.y = -1.15;
    group.add(duck.root);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(380, 64), K.paper(0xf0e6cf));
    strip.rotation.x = -Math.PI / 2; strip.position.set(10, 1, 132); strip.receiveShadow = true;
    const tl = new THREE.Group(); tl.add(strip);
    for (let i = 0; i <= 8; i++) { const tick = new THREE.Mesh(new THREE.BoxGeometry(2, 1, i % 4 ? 14 : 26), K.flat(K.COL.ink)); tick.position.set(-170 + i * 45, 1.6, 120); tl.add(tick); }
    group.add(tl);
    const key = (x) => { const k = K.box(36, 4, 46, K.COL.yellow); k.position.set(x, 2, 140); k.userData.x = x; return k; };
    const k1 = key(-125), k2 = key(55);
    const keys = new THREE.Group(); keys.add(k1, k2); group.add(keys);
    const head = new THREE.Mesh(new THREE.ConeGeometry(10, 22, 3), K.paper(K.COL.orange));
    head.rotation.set(Math.PI / 2, 0, 0);
    const playhead = new THREE.Group(); playhead.add(head); playhead.position.set(55, 18, 110); group.add(playhead);
    const blank = K.duckCard(K.CARDS.yours, { w: 72, h: 100 });
    blank.position.set(150, 0, 10);
    group.add(blank);
    const P0 = duck.stand.slice();
    const P1 = P0.slice(); P1[5] = -0.35; P1[6] = -0.4;
    const P2 = P0.slice(); P2[5] = 0.95; P2[6] = 0.55; P2[2] += 0.16; P2[11] += 0.16; P2[3] += 0.12; P2[12] += 0.12; P2[4] += -0.04; P2[13] += -0.04;
    const mix = (a, b, u) => a.map((v, i) => lerp(v, b[i], u));
    const LIMIT = (20 * Math.PI) / 180;
    let roll = 0, target = 0, stepActive = false, manual = false, limitHit = false;
    const limitLabel = ctx.label('limit', V(0, 64, 0), { parent: duck.parts.headRoll, cls: 'is-red' });
    const apply = (base) => {
      const a = base.slice();
      roll = clamp(target, -LIMIT, LIMIT);
      a[8] = roll;
      duck.setJoints(a);
      const over = Math.abs(target) > LIMIT + 0.001;
      duck.ring(8, over, K.COL.red);
      show(limitLabel, over);
      if (over && !limitHit) { limitHit = true; ctx.say('CLUNK', duck.pointOn('head').clone().add(V(0, 60, 0)), { sound: 'thud', cls: 'is-red' }); }
      if (!over) limitHit = false;
    };
    let base = P0;
    // the name is printed small on the card, so it is also said above it, big enough to read
    const cardName = ctx.label('Bow', V(150, 150, 10), { cls: 'is-big is-accent' });
    const nameCard = (name) => {
      const fresh = K.duckCard({ ...K.CARDS.yours, name }, { w: 72, h: 100 });
      blank.children.forEach((c) => { if (c.material && c.material.map) c.material = fresh.children[1].material; });
      show(cardName, name === 'Bow');
    };
    const api = {
      group,
      slider: { label: 'Head tip', min: -40, max: 40, step: 1, value: 0, format: (v) => `${v.toFixed(0)}°`, input(v) { target = (v * Math.PI) / 180; manual = true; } },
      reset() {
        base = P0; target = 0; manual = false; limitHit = false; apply(base);
        [k1, k2].forEach((k) => { k.position.y = 160; k.visible = false; });
        playhead.position.x = 55; playhead.visible = false;
        nameCard('Your card'); blank.rotation.set(0, 0, 0); blank.position.y = 0;
      },
      steps: [
        { dur: 1.8, start() { stepActive = true; }, run(u) {
          base = mix(P0, P1, ease.inOut(seg(u, 0, 0.6))); apply(base);
          k1.visible = u > 0.55; k1.position.y = lerp(160, 2, ease.land(seg(u, 0.55, 1)));
          if (u > 0.9 && !api._c) { api._c = true; ctx.say('CLICK', V(-125, 70, 140), { sound: 'tick' }); }
        }, end() { stepActive = false; api._c = false; } },
        { dur: 1.8, start() { stepActive = true; }, run(u) {
          base = mix(P1, P2, ease.inOut(seg(u, 0, 0.6))); apply(base);
          k2.visible = u > 0.55; k2.position.y = lerp(160, 2, ease.land(seg(u, 0.55, 1)));
          if (u > 0.9 && !api._c) { api._c = true; ctx.say('CLICK', V(55, 70, 140), { sound: 'tick' }); }
        }, end() { stepActive = false; api._c = false; } },
        { dur: 4.2, start() { stepActive = true; playhead.visible = true; }, run(u) {
          // there and back, twice: keyframe to keyframe, smoothly
          const a = (1 - Math.cos(u * Math.PI * 4)) / 2;
          base = mix(P2, P1, a); apply(base);
          playhead.position.x = lerp(55, -125, a);
        }, end() { stepActive = false; base = P2; apply(base); playhead.position.x = 55; } },
        { dur: 2.8, start() { stepActive = true; base = P2; }, run(u) {
          target = LIMIT * 2 * Math.sin(seg(u, 0, 0.8) * Math.PI / 2) * (u < 0.8 ? 1 : 1 - seg(u, 0.8, 1));
          apply(base);
        }, end() { stepActive = false; target = 0; apply(base); } },
        { dur: 2.4, start() { stepActive = true; }, run(u) {
          blank.position.y = Math.sin(u * Math.PI) * 60;
          blank.rotation.z = u * Math.PI * 2;
          if (u > 0.5 && !api._n) { api._n = true; nameCard('Bow'); ctx.sound('ding'); }
          base = mix(P2, P1, Math.sin(seg(u, 0.4, 1) * Math.PI)); apply(base);
        }, end() { stepActive = false; api._n = false; blank.rotation.z = 0; blank.position.y = 0; base = P2; apply(base); } },
      ],
      idle(t, dt) { if (!stepActive && manual) apply(base); },
    };
    api.reset();
    return api;
  },
};

function stub(ctx, n) {
  const duck = new K.Duck({ scale: 0.8 });
  ctx.group.add(duck.root);
  return { group: ctx.group, reset() {}, steps: Array.from({ length: n }, () => ({ dur: 0.8, run() {} })) };
}
