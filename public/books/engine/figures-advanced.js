// Book 3, Training Microducks: the figure on each right-hand page.
//
// Each figure keeps a small state (how far each idea has been drawn) and one
// draw() that turns that state into the picture, so a step only moves numbers
// and every step ends exactly where the next begins. reset() puts the first
// picture back. The formulas drawn are the real ones; where a figure needs
// values to draw (rewards, errors, signals), they are made up and the page's
// caption says so.

import * as K from './kit.js';

const { THREE } = K;
const { ease, seg, lerp, clamp } = K;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function show(label, on) { label.userData.el.classList.toggle('is-hidden', !on); }
function say1(api, key, cond, fn) { if (cond && !api[key]) { api[key] = true; fn(); } }

// A row of boxes in one draw call, each placed and coloured by hand.
function instBars(n, { w = 4, d = 8, color = K.COL.blue } = {}) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, K.paper(0xffffff, { unique: true }), n);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) mesh.setColorAt(i, c);
  mesh.instanceColor.needsUpdate = true;
  return {
    mesh,
    set(i, x, y, z, h, ww = w, dd = d) {
      const a = Math.max(0.25, Math.abs(h));
      dummy.position.set(x, h < 0 ? y - a : y, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(ww, a, dd);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    },
    hide(i) { dummy.position.set(0, -50, 0); dummy.scale.set(0.001, 0.001, 0.001); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); },
    color(i, hex) { c.set(hex); mesh.setColorAt(i, c); },
    commit() { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; },
  };
}

// Dots that ride curves, for signals and data.
function stream(group, color, n = 6, r = 6) {
  const dots = [];
  for (let i = 0; i < n; i++) { const d = K.packet(color, r); d.visible = false; group.add(d); dots.push(d); }
  return {
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
const arc = (a, b, lift = 50) => {
  const m = a.clone().lerp(b, 0.5); m.y += lift;
  return new THREE.QuadraticBezierCurve3(a.clone(), m, b.clone());
};

// A chart on an easel, leaning back so the reader looks at its face.
function easel(chart, x, z, tilt = -0.42) {
  chart.group.position.set(x, 0, z);
  chart.group.rotation.x = tilt;
  return chart;
}
// Where a chart value sits on the card, in the chart group's own frame.
function onChart(chart, x, y, lift = 6) {
  const X = chart._X(x) / chart.px - chart.w / 2;
  const Y = chart.h - chart._Y(y) / chart.px;
  return V(X, Y, 1.5 + lift);
}

// Redraw a chart's canvas only when what it shows has changed: a canvas
// upload every frame would cost battery for a picture that is standing still.
function plotIf(chart, key, series) {
  if (chart._key === key) return;
  chart._key = key;
  chart.plot(series);
}
const k3 = (...v) => v.map((x) => (typeof x === 'number' ? x.toFixed(3) : String(x))).join('|');

// A flat strip of paper lying on the page.
function strip(w, d, color = 0xece4d2) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), K.paper(color));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.8;
  m.receiveShadow = true;
  return m;
}

// A label made once, with its text changed in place.
function setText(label, text) { if (label.userData.el.textContent !== text) label.userData.el.textContent = text; }

const BLUE = K.COL.blue, GREEN = 0x2f9a5c, RED = K.COL.red, ORANGE = K.COL.orange;
// the clip's two edges, 1 - eps and 1 + eps, and 1 between them, as ticks that follow the slider
const clipTicks = (e) => [Math.round((1 - e) * 100) / 100, 1, Math.round((1 + e) * 100) / 100];

export const figures = {

  // ------------------------------------------------------------ the title page
  cover(ctx) {
    const { group } = ctx;
    const floorTex = K.canvasTexture(256, 256, (c, w, h) => {
      c.fillStyle = '#d6e4f3'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(42,100,201,.35)'; c.lineWidth = 2;
      for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, h); c.stroke(); c.beginPath(); c.moveTo(0, i * 32); c.lineTo(w, i * 32); c.stroke(); }
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(380, 300), new THREE.MeshToonMaterial({ map: floorTex.tex }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.8, 40); floor.receiveShadow = true;
    const floorG = new THREE.Group(); floorG.add(floor); group.add(floorG);
    const chart = easel(new K.Chart({ w: 210, h: 130, x: [0, 1], y: [0, 1], xLabel: 'practice', yLabel: 'return', px: 3 }), 95, -160);
    chart.plot([{ points: Array.from({ length: 40 }, (_, i) => [i / 39, 0.08 + 0.82 * (1 - Math.exp(-i / 9)) + 0.03 * Math.sin(i * 1.7)]), color: '#2f9a5c', width: 3 }]);
    group.add(chart.group);
    const gpu = K.chip(K.COL.green, { w: 64, d: 52, h: 12 });
    gpu.position.set(150, 0, 140);
    group.add(gpu);
    const duck = new K.Duck({ scale: 0.95 });
    duck.root.position.set(-50, 0, 70);
    duck.root.rotation.y = -0.65;
    group.add(duck.root);
    return {
      group, steps: [],
      reset() { duck.setJoints(duck.stand); },
      idle(t) {
        const a = duck.stand.slice();
        a[7] = Math.sin(t * 0.6) * 0.5;
        a[5] = duck.stand[5] + Math.sin(t * 1.1) * 0.08;
        duck.setJoints(a);
      },
    };
  },

  // ------------------------------------------------------------ 1. the return
  horizon(ctx) {
    const { group } = ctx;
    const N = 120, W = 2.1, G = 0.8, MAXH = 120;
    const span = N * W + (N - 1) * G;
    const xOf = (k) => -span / 2 + k * (W + G) + W / 2;
    const R = K.rng(5);
    const rew = Array.from({ length: N }, (_, k) => clamp(0.55 + 0.32 * Math.sin(k * 0.37 + 0.4) + 0.12 * (R() - 0.5), 0.12, 1));
    const ROWZ = 80;
    const base = new THREE.Group(); base.add(strip(362, 18)); base.children[0].position.z = ROWZ + 6; group.add(base);
    const bars = instBars(N, { w: W, d: 9 });
    const barsG = new THREE.Group(); barsG.add(bars.mesh); group.add(barsG);
    // the envelope gamma^k, as a paper wire over the bars
    const envG = new THREE.Group(); group.add(envG);
    let env = null;
    const flag = new THREE.Group();
    const pole = K.cylinder(2.2, 2.2, 150, K.COL.ink, { seg: 8 }); pole.position.y = 75; flag.add(pole);
    const cloth = K.box(46, 26, 2, ORANGE); cloth.position.set(-24, 136, 0); flag.add(cloth);
    const flagG = new THREE.Group(); flagG.add(flag); group.add(flagG);
    flag.position.set(xOf(100), 0, ROWZ - 14);
    const flagLabel = ctx.label('100 ticks = 2 s', V(xOf(100), 170, ROWZ - 14), { cls: 'is-accent' });
    const weightLabel = ctx.label('', V(xOf(100), 64, ROWZ + 34), { cls: 'is-small' });
    const stackX = -168, stackZ = -40, STACK = 0.022;
    const gLabel = ctx.label('the return', V(stackX, 40, stackZ), { cls: 'is-blue' });
    const nowLabel = ctx.label('now', V(xOf(0), 14, ROWZ + 34), { cls: 'is-small' });
    const st = { grow: 0, disc: 0, env: 0, flag: 0, stack: 0, gamma: 0.99 };
    const weight = (k) => Math.pow(st.gamma, k);
    // the flag stands at the horizon, 1/(1 - gamma) ticks, while it fits on the row
    const horizon = () => Math.round(1 / (1 - st.gamma));
    const flagAt = () => Math.min(N - 1, horizon());
    const buildEnv = () => {
      if (env) { env.geometry.dispose(); envG.remove(env); }
      const pts = [];
      for (let k = 0; k < N; k += 3) pts.push(V(xOf(k), MAXH * weight(k) + 3, ROWZ - 7));
      pts.push(V(xOf(N - 1), MAXH * weight(N - 1) + 3, ROWZ - 7));
      env = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 1.6, 6, false), K.paper(ORANGE));
      envG.add(env);
    };
    const draw = () => {
      let acc = 0;
      for (let k = 0; k < N; k++) {
        const g = clamp((st.grow - 0.85 * (k / N)) / 0.15);
        const h = MAXH * rew[k] * g * lerp(1, weight(k), st.disc);
        const s = clamp(st.stack * 1.4 - (k / N) * 0.4);
        const e = ease.inOut(s);
        const x = lerp(xOf(k), stackX, e), z = lerp(ROWZ, stackZ, e);
        const hh = lerp(h, h * STACK, e);
        const y = lerp(0, acc, e);
        acc += h * STACK;
        bars.set(k, x, y, z, hh, lerp(W, 26, e), lerp(9, 26, e));
        bars.color(k, k === flagAt() && st.flag > 0.5 && st.stack < 0.05 ? ORANGE : st.stack > 0.3 ? BLUE : 0x5a8fd8);
      }
      bars.commit();
      envG.visible = st.env > 0.01;
      envG.scale.y = Math.max(0.01, st.env);
      flag.scale.setScalar(Math.max(0.01, ease.back(st.flag)));
      const H = horizon(), at = flagAt();
      flag.position.x = xOf(at); flagLabel.position.x = xOf(at); weightLabel.position.x = xOf(at);
      show(flagLabel, st.flag > 0.6 && st.stack < 0.3);
      show(weightLabel, st.flag > 0.6 && st.stack < 0.3);
      setText(flagLabel, H > N - 1 ? `${H} ticks: past the row` : `${H} ticks = ${(H / 50).toLocaleString('en-US', { maximumFractionDigits: 1 })} s`);
      setText(weightLabel, `weight ${weight(at).toFixed(2)}`);
      show(gLabel, st.stack > 0.95);
      gLabel.position.y = acc + 24;
      show(nowLabel, st.grow > 0.05 && st.stack < 0.3);
    };
    const api = {
      group,
      slider: {
        label: 'γ', min: 0.9, max: 0.999, step: 0.001, value: 0.99, format: (v) => v.toFixed(3),
        input(v) { st.gamma = v; buildEnv(); draw(); },
      },
      chips() {
        const h = 1 / (1 - st.gamma);
        return [['γ', st.gamma.toFixed(3)], ['horizon', `${Math.round(h)} ticks`], ['at 50 Hz', `${(h / 50).toFixed(2)} s`]];
      },
      reset() { Object.assign(st, { grow: 0, disc: 0, env: 0, flag: 0, stack: 0 }); buildEnv(); draw(); },
      steps: [
        { dur: 2.6, start() { ctx.sound('pop'); }, run(u) { st.grow = ease.out(u); draw(); } },
        { dur: 2.6, run(u) { st.disc = ease.inOut(u); st.env = ease.out(seg(u, 0, 0.5)); draw(); } },
        { dur: 1.8, start() { ctx.sound('tick'); }, run(u) { st.flag = seg(u, 0, 0.7); draw(); } },
        { dur: 3.4, start() { ctx.sound('swish'); }, run(u) { st.stack = ease.inOut(u); st.env = 1 - seg(u, 0, 0.3); st.flag = 1 - seg(u, 0, 0.3); draw(); },
          end() { ctx.say('Σ', V(stackX + 40, 120, stackZ), { cls: 'is-blue', sound: 'ding' }); } },
      ],
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 2. value, advantage
  advantage(ctx) {
    const { group } = ctx;
    const N = 20, X0 = -150, X1 = 122;
    const xOf = (i) => lerp(X0, X1, i / (N - 1));
    const gamma = 0.99;
    // made-up values and errors; the errors would come from rewards as r + γV(s') - V(s)
    const Vv = Array.from({ length: N + 1 }, (_, i) => 30 + 110 * Math.pow(i / N, 1.35) - 26 * Math.exp(-Math.pow((i - 8) / 2, 2)));
    const delta = Array.from({ length: N }, (_, i) => 7 * Math.sin(i * 1.7 + 0.5) + 3 * Math.cos(i * 0.6) + (i === 7 ? -6 : 0));
    const POSTZ = -110, DZ = 40, T0 = 4;
    const posts = instBars(N, { w: 11, d: 11, color: 0x7aa7e6 });
    const postsG = new THREE.Group(); postsG.add(posts.mesh); group.add(postsG);
    const lane = new THREE.Group(); lane.add(strip(330, 60)); lane.children[0].position.set(-7, 0.8, -40); group.add(lane);
    const base = new THREE.Mesh(new THREE.BoxGeometry(315, 1.2, 2), K.flat(K.COL.ink));
    base.position.set(-7, 1, DZ);
    const deltas = instBars(N, { w: 11, d: 11 });
    const dG = new THREE.Group(); dG.add(base, deltas.mesh); group.add(dG);
    const sumBar = instBars(1, { w: 26, d: 26, color: ORANGE });
    const sumG = new THREE.Group(); sumG.add(sumBar.mesh); group.add(sumG);
    const SUMX = -150, SUMZ = 125;
    const duck = new K.Duck({ scale: 0.28 });
    group.add(duck.root);
    const valueLabel = ctx.label('V(s): what the critic expects', V(30, 150, POSTZ), { cls: 'is-blue' });
    const dLabel = ctx.label('TD errors', V(120, 40, DZ + 30), { cls: 'is-small' });
    const aLabel = ctx.label('Â for one step', V(SUMX, 60, SUMZ), { cls: 'is-accent' });
    const critic = K.chip(0x2c64c0, { w: 70, d: 50, h: 14 });
    const eye = K.ball(9, 0xffffff); eye.position.set(0, 26, 10); critic.add(eye);
    const pupil = K.ball(4, K.COL.ink); pupil.position.set(0, 26, 18); critic.add(pupil);
    const ball = K.ball(14, RED);
    const sight = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1, 6), K.flat(0x2c64c0));
    const privG = new THREE.Group(); privG.add(critic, ball, sight); group.add(privG);
    critic.position.set(165, 0, 115);
    ball.position.set(75, 14, 130);
    const cLabel = ctx.label('critic: sees the ball', V(150, 70, 115), { cls: 'is-blue' });
    const actorLabel = ctx.label('actor: 61 in, 14 out', V(0, 62, -40), { cls: 'is-green' });
    const st = { posts: 0, walk: 0, blend: 0, priv: 0, fold: 0, lambda: 0.95 };
    const sightLine = () => {
      const a = new THREE.Vector3(); eye.getWorldPosition(a); group.worldToLocal(a);
      const b = ball.position.clone();
      const d = a.distanceTo(b);
      sight.scale.set(1, d, 1);
      sight.position.copy(a).lerp(b, 0.5);
      sight.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    };
    const adv = () => {
      let s = 0;
      for (let k = 0; T0 + k < N; k++) s += Math.pow(gamma * st.lambda, k) * delta[T0 + k];
      return s;
    };
    const draw = () => {
      for (let i = 0; i < N; i++) {
        posts.set(i, xOf(i), 0, POSTZ, Vv[i] * clamp(st.posts * 1.6 - i / N * 0.6));
        posts.color(i, i === T0 && st.blend > 0.05 ? ORANGE : 0x7aa7e6);
        const shown = st.walk * N > i + 0.5;
        let w = 1;
        if (i >= T0) w = lerp(1, Math.pow(gamma * st.lambda, i - T0), st.blend);
        else w = lerp(1, 0.15, st.blend);
        const h = delta[i] * 3.4 * w;
        if (shown) deltas.set(i, xOf(i), 1.6, DZ, h); else deltas.hide(i);
        deltas.color(i, delta[i] >= 0 ? GREEN : RED);
      }
      posts.commit(); deltas.commit();
      const A = adv() * 2.2 * ease.out(st.blend);
      if (st.blend > 0.01) sumBar.set(0, SUMX, 1, SUMZ, A); else sumBar.hide(0);
      sumBar.commit();
      const p = st.walk * (N - 1);
      duck.root.position.set(lerp(X0, X1, st.walk), 0, -40);
      duck.root.rotation.y = 0;
      if (st.walk > 0 && st.walk < 1) duck.walkPose(K.Duck.phaseFor(p * (X1 - X0) / (N - 1) / 0.28), { stride: 40 });
      else duck.setJoints(duck.stand);
      privG.visible = st.priv > 0.01;
      critic.scale.setScalar(Math.max(0.01, ease.back(st.priv) * (1 - ease.in(st.fold))));
      ball.scale.setScalar(Math.max(0.01, ease.back(st.priv)));
      sight.visible = st.priv > 0.6 && st.fold < 0.5;
      if (sight.visible) sightLine();
      show(valueLabel, st.posts > 0.6 && st.priv < 0.1);
      show(dLabel, st.walk > 0.3 && st.priv < 0.1);
      show(aLabel, st.blend > 0.7 && st.priv < 0.1);
      aLabel.position.y = Math.max(20, A) + 26;
      show(cLabel, st.priv > 0.6 && st.fold < 0.4);
      show(actorLabel, st.priv > 0.6);
      actorLabel.position.set(duck.root.position.x, 62, duck.root.position.z);
    };
    const api = {
      group,
      slider: { label: 'λ', min: 0, max: 1, step: 0.01, value: 0.95, format: (v) => v.toFixed(2), input(v) { st.lambda = v; draw(); } },
      chips() { return [['λ', st.lambda.toFixed(2)], ['γλ', (gamma * st.lambda).toFixed(3)]]; },
      reset() { Object.assign(st, { posts: 0, walk: 0, blend: 0, priv: 0, fold: 0 }); draw(); },
      steps: [
        { dur: 2.0, start() { ctx.sound('pop'); }, run(u) { st.posts = ease.out(u); draw(); } },
        { dur: 4.2, run(u) { st.walk = u; draw(); } },
        { dur: 2.6, run(u) { st.blend = ease.inOut(u); draw(); }, end() { ctx.say('Â', V(SUMX + 30, 90, SUMZ), { cls: 'is-red', sound: 'ding' }); } },
        { dur: 3.6, start() { ctx.sound('pop'); }, run(u) { st.priv = seg(u, 0, 0.35); st.fold = seg(u, 0.6, 0.95); draw(); },
          end() { ctx.say('export', V(110, 90, 115), { cls: 'is-blue', sound: 'swish' }); } },
      ],
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 3. PPO's clip
  clip(ctx) {
    const { group } = ctx;
    const chart = easel(new K.Chart({ w: 320, h: 220, x: [0.4, 1.6], y: [-1.75, 1.45], title: 'the clipped objective, per action', xLabel: 'ratio ρ', yLabel: 'objective', px: 3 }), -32, 105, -0.86);
    chart.xTicks = [0.8, 1, 1.2];
    group.add(chart.group);
    const st = { axis: 0, good: 0, bad: 0, passes: 0, eps: 0.2 };
    const Lpos = (r, e) => Math.min(r, clamp(r, 1 - e, 1 + e));
    const Lneg = (r, e) => -Math.max(r, clamp(r, 1 - e, 1 + e));
    const curve = (f, e) => Array.from({ length: 121 }, (_, i) => { const r = 0.4 + i * 0.01; return [r, f(r, e)]; });
    const goodBall = K.ball(9, GREEN), badBall = K.ball(9, RED);
    chart.group.add(goodBall, badBall);
    const meter = new THREE.Group();
    const tube = K.box(26, 120, 26, 0xf3ead6); tube.position.y = 60; meter.add(tube);
    const fill = new THREE.Mesh(new THREE.BoxGeometry(18, 1, 18), K.paper(BLUE)); fill.geometry.translate(0, 0.5, 0); fill.position.y = 3; meter.add(fill);
    const target = new THREE.Mesh(new THREE.BoxGeometry(34, 2.4, 34), K.flat(RED)); target.position.y = 90; meter.add(target);
    meter.position.set(166, 0, 40);
    const meterG = new THREE.Group(); meterG.add(meter); group.add(meterG);
    const klLabel = ctx.label('KL target 0.01', V(166, 140, 40), { cls: 'is-small' });
    const passes = instBars(20, { w: 11, d: 11, color: 0xd9d1c0 });
    const passesG = new THREE.Group(); passesG.add(passes.mesh); group.add(passesG);
    const passX = (k) => -168 + k * 14 + Math.floor(k / 4) * 8;
    const flatLabel = ctx.label('flat: nothing more to gain', V(0, 0, 0), { cls: 'is-small', parent: chart.group });
    const draw = () => {
      const e = st.eps;
      chart.xTicks = clipTicks(e);
      const series = [];
      if (st.good > 0) series.push({ points: curve(Lpos, e), color: '#2f9a5c', width: 3.5, upto: Math.max(2, Math.round(121 * clamp(st.good * 1.4))) });
      if (st.bad > 0) series.push({ points: curve(Lneg, e), color: '#d8432e', width: 3.5, upto: Math.max(2, Math.round(121 * clamp(st.bad * 1.4))) });
      chart.marks = st.axis > 0.3 ? [
        { x: 1, color: '#8a8478', text: 'old policy', align: 'left', dash: [3, 4] },
        { x: 1 - e, color: '#d8432e', dash: [6, 5] },
        { x: 1 + e, color: '#2f9a5c', dash: [6, 5] },
        { y: 0, color: '#c7c0b2', dash: [2, 4] },
      ] : [];
      chart.plot(series);
      // the green ball rides the A > 0 curve from below 1 to past the clip
      const rg = lerp(0.62, 1.5, clamp((st.good - 0.25) / 0.75));
      goodBall.visible = st.good > 0.25;
      goodBall.position.copy(onChart(chart, rg, Lpos(rg, e), 9));
      goodBall.material = K.paper(rg > 1 + e ? 0x9aa69d : GREEN);
      const rb = lerp(1.5, 0.5, clamp((st.bad - 0.25) / 0.75));
      badBall.visible = st.bad > 0.25;
      badBall.position.copy(onChart(chart, rb, Lneg(rb, e), 9));
      badBall.material = K.paper(rb < 1 - e ? 0xb0a19d : RED);
      const showFlat = st.good > 0.75 && st.bad < 0.2;
      show(flatLabel, showFlat);
      flatLabel.position.copy(onChart(chart, 1.42, 1 + e + 0.18, 12));
      meterG.visible = st.passes > 0.001;
      const k = Math.min(20, Math.floor(st.passes * 20.999));
      for (let i = 0; i < 20; i++) {
        passes.set(i, passX(i), 0, 168, i < k ? 14 : 4);
        passes.color(i, i < k ? (Math.floor(i / 4) % 2 ? 0x2c64c0 : 0x5a8fd8) : 0xd9d1c0);
      }
      passes.commit();
      passesG.visible = st.passes > 0.001;
      const kl = 0.004 + 0.009 * (k / 20) * (1 + 0.12 * Math.sin(k * 1.9));
      fill.scale.y = Math.max(0.5, (kl / 0.0135) * 112);
      show(klLabel, st.passes > 0.05);
    };
    const api = {
      group,
      slider: { label: 'ε', min: 0.05, max: 0.5, step: 0.01, value: 0.2, format: (v) => v.toFixed(2), input(v) { st.eps = v; draw(); } },
      chips() {
        const k = Math.min(20, Math.floor(st.passes * 20.999));
        const out = [['ε', st.eps.toFixed(2)], ['clip', `${(1 - st.eps).toFixed(2)} to ${(1 + st.eps).toFixed(2)}`]];
        if (st.passes > 0) out.push(['passes', `${k} of 20`]);
        return out;
      },
      reset() { Object.assign(st, { axis: 0, good: 0, bad: 0, passes: 0 }); api._f = api._b = false; draw(); },
      steps: [
        { dur: 1.6, start() { ctx.sound('pop'); }, run(u) { st.axis = u; draw(); }, end() { st.axis = 1; draw(); } },
        { dur: 3.2, run(u) { st.good = u; draw(); say1(api, '_f', u > 0.62, () => ctx.say('clip!', V(90, 150, 30), { cls: 'is-green', sound: 'tick' })); } },
        { dur: 3.0, run(u) { st.bad = u; draw(); say1(api, '_b', u > 0.75, () => ctx.say('clip!', V(-120, 60, 60), { cls: 'is-red', sound: 'tick' })); } },
        { dur: 4.0, run(u) { const before = Math.floor(st.passes * 20.999); st.passes = u; draw(); if (Math.floor(u * 20.999) !== before) ctx.sound('tick'); } },
      ],
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 4. the contract
  contract(ctx) {
    const { group } = ctx;
    const groups = [
      { name: 'gyro', n: 3, color: 0x2a64c9 }, { name: 'gravity', n: 3, color: 0x0b777a },
      { name: 'joint pos', n: 14, color: 0xf08c12 }, { name: 'joint vel', n: 14, color: 0xe2b33c },
      { name: 'last action', n: 14, color: 0x7044c2 }, { name: 'command', n: 13, color: 0x2f9a5c },
    ];
    const N = 61, W = 4.6, G = 1.75, INZ = -128;
    const xOf = (i) => -(N * W + (N - 1) * G) / 2 + i * (W + G) + W / 2;
    const groupOf = [];
    groups.forEach((g, gi) => { for (let k = 0; k < g.n; k++) groupOf.push(gi); });
    const firstOf = (gi) => groupOf.indexOf(gi);
    const midOf = (gi) => (xOf(firstOf(gi)) + xOf(firstOf(gi) + groups[gi].n - 1)) / 2;
    const ins = instBars(N, { w: W, d: 8 });
    const ghosts = instBars(14, { w: W, d: 8, color: 0xe2b33c });
    ghosts.mesh.material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
    const insG = new THREE.Group(); insG.add(ins.mesh, ghosts.mesh); group.add(insG);
    // the group names, staggered so neighbours do not sit on each other
    const names = [
      ['gyro 3, gravity 3', (xOf(0) + xOf(5)) / 2, 0, [0, 1]],
      ['joint pos 14', midOf(2), 1, [2]],
      ['joint vel 14', midOf(3), 0, [3]],
      ['last action 14', midOf(4), 1, [4]],
      ['command 13', midOf(5), 0, [5]],
    ].map(([text, x, row, gs]) => ({ label: ctx.label(text, V(x, row ? 84 : 64, INZ), { cls: 'is-small' }), gs }));
    const outN = 14, OUTZ = 78;
    const outX = (j) => -150 + j * 15;
    const outs = instBars(outN, { w: 10, d: 10, color: ORANGE });
    const outsG = new THREE.Group(); outsG.add(outs.mesh); group.add(outsG);
    const box = (color) => {
      const g = new THREE.Group();
      const b = K.box(124, 46, 56, color); b.position.y = 23; g.add(b);
      const plugIn = K.box(96, 7, 7, 0x3c3c44); plugIn.position.set(0, 15, -31); g.add(plugIn);
      const plugOut = K.box(64, 7, 7, 0x3c3c44); plugOut.position.set(0, 15, 31); g.add(plugOut);
      return g;
    };
    const BOXZ = -28, BOXX = -40;
    const walkBox = box(0x2c64c0), kickBox = box(ORANGE);
    const boxG = new THREE.Group(); boxG.add(walkBox, kickBox); group.add(boxG);
    const walkLabel = ctx.label('walk policy', V(0, 66, 0), { cls: 'is-blue', parent: walkBox });
    const kickLabel = ctx.label('kick policy', V(0, 66, 0), { cls: 'is-accent', parent: kickBox });
    const duck = new K.Duck({ scale: 0.42 });
    duck.root.position.set(150, 0, 130);
    duck.root.rotation.y = -0.8;
    group.add(duck.root);
    const flow = new THREE.Group(); group.add(flow);
    const inStream = stream(flow, 0xffd27a, 14, 4.5);
    const outStream = stream(flow, 0xffb340, 14, 4.5);
    const inCurves = groups.map((g, gi) => arc(V(xOf(firstOf(gi) + Math.floor(g.n / 2)), 10, INZ + 8), V(BOXX, 36, BOXZ - 26), 36));
    const outCurves = Array.from({ length: outN }, (_, j) => arc(V(BOXX, 26, BOXZ + 34), V(outX(j), 10, OUTZ), 28));
    const lateLabel = ctx.label('1 tick late', V(midOf(3), 98, INZ), { cls: 'is-accent' });
    const imuLabel = ctx.label('0 to 1 tick late', V((xOf(0) + xOf(5)) / 2, 98, INZ), { cls: 'is-accent' });
    const biasLabel = ctx.label('bias ±0.015 rad', V(midOf(2) - 6, 120, INZ), { cls: 'is-accent' });
    const targetLabel = ctx.label('target = home + 1.0 × action', V(-50, 52, OUTZ + 30), { cls: 'is-small' });
    const st = { in: 0, out: 0, late: 0, swap: 0, t: 0 };
    const sig = (i, t) => {
      const g = groupOf[i];
      const ph = i * 0.7;
      if (g === 5) return 0.25 + 0.15 * Math.sin(ph);
      return 0.45 + 0.35 * Math.sin(t * (g === 3 ? 5 : 3) + ph);
    };
    const draw = () => {
      const t = st.t;
      for (let i = 0; i < N; i++) {
        const g = groupOf[i];
        const lit = clamp(st.in * 6 - g);
        let tt = t;
        if (g === 3) tt = t - 0.16 * st.late;
        if (g <= 1) tt = t - 0.08 * st.late * (Math.sin(t * 7) > 0 ? 1 : 0);
        let h = 10 + 44 * sig(i, tt) * (0.25 + 0.75 * lit);
        if (g === 2) h += 3 * st.late * Math.sin(i * 2.1);
        ins.set(i, xOf(i), 0, INZ, h);
        ins.color(i, lit > 0.5 ? groups[g].color : 0xd9d1c0);
      }
      ins.commit();
      for (let j = 0; j < 14; j++) {
        const i = firstOf(3) + j;
        if (st.late > 0.05) ghosts.set(j, xOf(i), 0, INZ + 9, 10 + 44 * sig(i, t)); else ghosts.hide(j);
      }
      ghosts.commit();
      names.forEach(({ label, gs }) => show(label, gs.every((gi) => st.in * 6 > gi + 0.5) && st.late < 0.1));
      const aOut = clamp(st.out * 1.3);
      for (let j = 0; j < outN; j++) outs.set(j, outX(j), 0, OUTZ, 6 + 32 * aOut * (0.5 + 0.45 * Math.sin(t * 3 + j * 0.9)));
      outs.commit();
      outsG.visible = st.out > 0.01;
      show(targetLabel, st.out > 0.6 && st.late < 0.1);
      for (let i = 0; i < 14; i++) duck.dot(i, st.out > 0.5 && st.swap < 0.05, 0xffb340);
      const kick = clamp(Math.sin(clamp((st.swap - 0.3) / 0.4) * Math.PI));
      if (kick > 0.01) {
        const a = duck.stand.slice();
        const R = duck.solveLeg(lerp(0, 34, kick), lerp(0, 22, kick));
        a[11] = R.hip; a[12] = R.knee; a[13] = R.ankle;
        duck.setJoints(a);
      } else if (st.out > 0.3) duck.walkPose(t * 1.4, { stride: 0, lift: 9 });
      else duck.setJoints(duck.stand);
      const lateOn = st.late > 0.3 && st.swap < 0.05;
      show(lateLabel, lateOn); show(imuLabel, lateOn); show(biasLabel, lateOn);
      // the swap: walk lifts out, kick drops in, then back
      const s1 = ease.inOut(seg(st.swap, 0, 0.3)), s2 = ease.inOut(seg(st.swap, 0.7, 1));
      const out = s1 * (1 - s2);
      walkBox.position.set(BOXX, 130 * out, BOXZ);
      kickBox.position.set(BOXX, 130 * (1 - out), BOXZ);
      kickBox.visible = st.swap > 0.001 && st.swap < 0.999;
      show(kickLabel, out > 0.8);
      show(walkLabel, out < 0.2);
    };
    const api = {
      group,
      chips() { return [['in', '61'], ['out', '14']]; },
      reset() { Object.assign(st, { in: 0, out: 0, late: 0, swap: 0 }); api._k = false; draw(); },
      steps: [
        { dur: 3.0, start() { ctx.sound('pop'); }, run(u) { st.in = u; inStream.at(inCurves, u, 0.6); draw(); }, end() { inStream.hide(); } },
        { dur: 2.8, run(u) { st.out = u; outStream.at(outCurves, u, 0.6); draw(); }, end() { outStream.hide(); } },
        { dur: 2.6, run(u) { st.late = ease.out(u); draw(); } },
        { dur: 3.6, start() { ctx.sound('swish'); }, run(u) { st.late = 1 - seg(u, 0, 0.15); st.swap = u; draw(); say1(api, '_k', u > 0.5, () => ctx.say('kick', V(150, 130, 120), { cls: 'is-red', sound: 'thud' })); },
          end() { api._k = false; st.swap = 0; st.late = 0; draw(); } },
      ],
      idle(t, dt) { st.t += dt; draw(); },
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 5. reward design
  shaping(ctx) {
    const { group } = ctx;
    const LX = -112, RX = 100, DZ = -10, S = 0.48;
    const lanes = new THREE.Group();
    const l1 = strip(180, 170, 0xf3e1d4); l1.position.set(LX, 0.8, DZ); lanes.add(l1);
    const l2 = strip(180, 170, 0xdcebd9); l2.position.set(RX, 0.8, DZ); lanes.add(l2);
    group.add(lanes);
    const dl = new K.Duck({ scale: S }); dl.root.position.set(LX - 30, 0, DZ + 10); group.add(dl.root);
    const dr = new K.Duck({ scale: S }); dr.root.position.set(RX - 30, 0, DZ + 10); group.add(dr.root);
    const ruleL = ctx.label('paid every tick it is low', V(LX, 4, DZ + 88), { cls: 'is-red is-small' });
    const ruleR = ctx.label('paid the change in cos(tilt)', V(RX, 4, DZ + 88), { cls: 'is-green is-small' });
    const totL = ctx.label('', V(LX, 96, DZ - 30), { cls: 'is-big' });
    const totR = ctx.label('', V(RX - 20, 150, DZ - 30), { cls: 'is-big' });
    // the potential beside the right duck, cos(tilt) as a filling column
    const phi = new THREE.Group();
    const glass = K.box(20, 100, 20, 0xf6eedb); glass.position.y = 50; phi.add(glass);
    const level = new THREE.Mesh(new THREE.BoxGeometry(14, 1, 14), K.paper(GREEN)); level.geometry.translate(0, 0.5, 0); level.position.y = 2; phi.add(level);
    phi.position.set(RX + 78, 0, DZ + 20);
    group.add(phi);
    const phiLabel = ctx.label('Φ = cos(tilt)', V(RX + 78, 2, DZ + 56), { cls: 'is-small' });
    // the episode's reward terms, as bars round a zero line
    const terms = [['task', 1.0], ['action rate', -0.28], ['penalty', -0.36], ['foot slip', -0.12]];
    const bars = instBars(terms.length, { w: 30, d: 22 });
    const zero = new THREE.Mesh(new THREE.BoxGeometry(250, 1.4, 2), K.flat(K.COL.ink));
    zero.position.set(0, 48, 170);
    const barsG = new THREE.Group(); barsG.add(bars.mesh, zero); group.add(barsG);
    const barX = (i) => -126 + i * 80;
    const termLabels = terms.map(([n], i) => ctx.label(n, V(barX(i), 4, 208), { cls: 'is-small' }));
    const bugLabel = ctx.label('negative weight × negative penalty: a prize', V(20, 128, 170), { cls: 'is-red' });
    const okLabel = ctx.label('every penalty ≤ 0', V(20, 118, 170), { cls: 'is-green' });
    const st = { gated: 0, pot: 0, bug: 0, fix: 0 };
    const draw = () => {
      // left: rises a little, sinks to its cheapest low pose and parks
      const g = st.gated;
      const rise = g < 0.25 ? 1 - 0.35 * ease.inOut(g / 0.25) : g < 0.45 ? 0.65 + 0.2 * ease.inOut((g - 0.25) / 0.2) : 0.85;
      dl.fall(st.gated > 0 ? rise : 1, 'forward');
      dl.setJoints(dl.stand);
      if (st.gated > 0.45) dl.crouchPose(0.55);
      setText(totL, `total ${Math.floor(lerp(0, 180, g))}`);
      show(totL, g > 0.02);
      // right: rises all the way; pays only while rising
      const up = ease.inOut(st.pot);
      dr.fall(1 - up, 'forward');
      dr.setJoints(dr.stand);
      const tilt = (1 - up) * Math.PI * 0.47;
      level.scale.y = Math.max(0.5, Math.cos(tilt) * 96);
      setText(totR, `total ${(Math.cos(tilt) - Math.cos(Math.PI * 0.47)).toFixed(2)}`);
      show(totR, st.pot > 0.02);
      show(phiLabel, st.pot > 0.02);
      const flip = ease.inOut(st.bug) * (1 - ease.inOut(st.fix));
      terms.forEach(([, v], i) => {
        const val = i === 2 ? lerp(v, -v, flip) : v;
        bars.set(i, barX(i), 48, 170, val * 60 * clamp((st.bug + st.fix) * 3), 30, 22);
        bars.color(i, i === 0 ? GREEN : i === 2 && flip > 0.5 ? RED : 0xd98b7a);
      });
      bars.commit();
      barsG.visible = st.bug > 0.001;
      termLabels.forEach((l) => show(l, st.bug > 0.1));
      show(bugLabel, flip > 0.6);
      show(okLabel, st.fix > 0.7);
      // the lanes' rule labels sit where the verdicts print: they step aside for them
      show(ruleL, flip <= 0.6 && st.fix <= 0.7);
      show(ruleR, flip <= 0.6 && st.fix <= 0.7);
      if (flip > 0.6 || st.fix > 0.7) show(phiLabel, false);
    };
    const api = {
      group,
      reset() { Object.assign(st, { gated: 0, pot: 0, bug: 0, fix: 0 }); api._p1 = api._p2 = api._h = false; draw(); },
      steps: [
        { dur: 4.0, run(u) {
          st.gated = u; draw();
          say1(api, '_p1', u > 0.5, () => ctx.say('+1', V(LX - 40, 130, DZ), { cls: 'is-red', sound: 'tick' }));
          say1(api, '_p2', u > 0.8, () => ctx.say('+1', V(LX + 20, 130, DZ), { cls: 'is-red', sound: 'tick' }));
        } },
        { dur: 3.4, run(u) { st.pot = seg(u, 0, 0.7); draw(); say1(api, '_h', u > 0.8, () => ctx.say('holding pays nothing', V(RX - 40, 190, DZ - 30), { cls: 'is-green', life: 1.6, scale: 0.7 })); } },
        { dur: 2.6, start() { ctx.sound('thud'); }, run(u) { st.bug = u; draw(); } },
        { dur: 2.2, start() { ctx.sound('ding'); }, run(u) { st.fix = u; draw(); } },
      ],
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 6. the actuator
  actuator(ctx) {
    const { group } = ctx;
    const chart = easel(new K.Chart({ w: 260, h: 185, x: [0, 1], y: [0, 1.25], title: 'torque the servo can give', xLabel: 'speed', yLabel: 'torque', px: 3 }), 58, 40, -0.86);
    group.add(chart.group);
    // the servo: a case, a horn on top, and two gears drawn large for the play
    const servo = new THREE.Group();
    const body = K.box(70, 46, 52, 0x3c3c44); body.position.y = 23; servo.add(body);
    const hornPivot = new THREE.Group(); hornPivot.position.set(14, 50, 0); servo.add(hornPivot);
    const hub = K.cylinder(10, 10, 8, 0xe9e2d0, { seg: 20 }); hornPivot.add(hub);
    const arm = K.box(54, 6, 12, 0xe9e2d0); arm.position.set(22, 2, 0); hornPivot.add(arm);
    servo.position.set(-150, 0, -120);
    servo.scale.setScalar(1.25);
    group.add(servo);
    const gears = new THREE.Group();
    const gear = (r, teeth, color) => {
      const g = new THREE.Group();
      const disk = K.cylinder(r, r, 10, color, { seg: 32 }); g.add(disk);
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * Math.PI * 2;
        const t = K.box(7, 10, 8, color, { line: false });
        t.position.set(Math.cos(a) * (r + 3), 0, Math.sin(a) * (r + 3));
        t.rotation.y = -a;
        g.add(t);
      }
      return g;
    };
    const motorGear = gear(28, 12, 0xd9a441);
    const outGear = gear(42, 18, 0xb8c4cf);
    motorGear.position.set(-170, 6, 110);
    outGear.position.set(-170 + 28 + 42 + 7, 6, 110);
    gears.add(motorGear, outGear);
    group.add(gears);
    const gearLabel = ctx.label('±1° of play, drawn 6× larger', V(-128, 66, 110), { cls: 'is-accent' });
    const encLabel = ctx.label('the encoder reads the output', V(-110, 4, 170), { cls: 'is-small' });
    const st = { ideal: 0, emf: 0, fric: 0, lash: 0, volt: 1, t: 0 };
    const dot = K.ball(7, BLUE); chart.group.add(dot);
    const fricOf = (w) => 0.07 + 0.11 * Math.exp(-Math.pow(w / 0.06, 2));
    const motor = (w, v) => clamp(1.05 * v * (1 - w / (0.95 * v)), 0, 2);
    const draw = () => {
      const v = st.volt;
      const series = [];
      if (st.ideal > 0) series.push({ points: [[0, 1.05], [1, 1.05]].map((p, i) => (i ? [lerp(0, 1, clamp(st.ideal * 1.3)), 1.05] : p)), color: '#8a8478', width: 3, dash: [8, 6] });
      if (st.emf > 0) {
        const pts = [];
        for (let i = 0; i <= 100; i++) {
          const w = i / 100;
          let tau = motor(w, v);
          if (st.fric > 0) tau = Math.max(0, tau - fricOf(w) * ease.out(st.fric));
          pts.push([w, tau]);
        }
        series.push({ points: pts, color: '#2c64c0', width: 3.5, upto: Math.max(2, Math.round(101 * clamp(st.emf * 1.3))) });
      }
      chart.marks = st.fric > 0.3 ? [{ x: 0.12, color: '#d8432e', text: 'sticks', align: 'left' }] : [];
      plotIf(chart, k3(st.ideal, st.emf, st.fric, v), series);
      // the dot slides down the curve as the motor speeds up
      dot.visible = st.emf > 0.4;
      const w = lerp(0, 0.92 * v, clamp((st.emf - 0.4) / 0.6));
      dot.position.copy(onChart(chart, w, Math.max(0, motor(w, v) - (st.fric > 0 ? fricOf(w) * ease.out(st.fric) : 0)), 8));
      // the horn: snapping (ideal), easing (back-EMF), stick then slip (friction)
      const T = st.t;
      let ang = 0;
      if (st.lash > 0) ang = 0.6;
      else if (st.fric > 0) { const ph = (T * 0.8) % 1; ang = ph < 0.55 ? 0 : 0.6 * ease.out(clamp((ph - 0.55) / 0.12)); }
      else if (st.emf > 0) ang = 0.6 * (0.5 - 0.5 * Math.cos(T * 2.2));
      else if (st.ideal > 0) ang = Math.sin(T * 2.2) > 0 ? 0.6 : -0.6;
      hornPivot.rotation.y = ang;
      gears.visible = st.lash > 0.001;
      motorGear.scale.setScalar(Math.max(0.01, ease.back(clamp(st.lash * 2))));
      outGear.scale.setScalar(Math.max(0.01, ease.back(clamp(st.lash * 2 - 0.2))));
      const wob = st.lash > 0.4 ? Math.sin(T * 9) * (6 * Math.PI / 180) : 0;
      outGear.rotation.y = 0.12 + wob;
      motorGear.rotation.y = 0.0;
      show(gearLabel, st.lash > 0.5);
      show(encLabel, st.lash > 0.7);
    };
    const api = {
      group,
      slider: { label: 'Battery', min: 70, max: 100, step: 1, value: 100, format: (v) => `${v.toFixed(0)}%`, input(v) { st.volt = v / 100; draw(); } },
      reset() { Object.assign(st, { ideal: 0, emf: 0, fric: 0, lash: 0 }); api._s = api._p = false; draw(); },
      steps: [
        { dur: 2.2, start() { ctx.sound('pop'); }, run(u) { st.ideal = u; draw(); } },
        { dur: 3.0, run(u) { st.emf = u; draw(); } },
        { dur: 2.8, run(u) {
          st.fric = u; draw();
          say1(api, '_s', u > 0.25, () => ctx.say('stick', V(-150, 120, -110), { cls: 'is-red', sound: 'tick' }));
          say1(api, '_p', u > 0.6, () => ctx.say('slip', V(-110, 130, -110), { cls: 'is-blue', sound: 'swish' }));
        } },
        { dur: 2.6, start() { ctx.sound('whirr'); }, run(u) { st.lash = u; draw(); } },
      ],
      idle(t, dt) { st.t += dt; draw(); },
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 7. randomize, measure
  randomize(ctx) {
    const { group } = ctx;
    const cell = 52, n = 4, GX = 92, GZ = -168;
    const tiles = [], ducks = [];
    const gridG = new THREE.Group(); group.add(gridG);
    const R = K.rng(3);
    const grip = Array.from({ length: 16 }, () => R());
    const gripColor = (g) => new THREE.Color(0x9fd0ff).lerp(new THREE.Color(0xffb26b), g).getHex();
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(cell - 6, cell * 0.82 - 6), K.paper(0xece4d2, { unique: true }));
      t.rotation.x = -Math.PI / 2;
      t.position.set(GX + (c - 1.5) * cell, 1, GZ + (r - 1.5) * cell * 0.82);
      t.receiveShadow = true;
      gridG.add(t);
      tiles.push(t);
      const d = new K.Duck({ scale: 0.14 });
      d.root.position.copy(t.position).setY(0);
      d.root.rotation.y = -0.6;
      gridG.add(d.root);
      ducks.push(d);
    }
    const pushes = [];
    for (let i = 0; i < 3; i++) { const a = K.arrow([[0, 0, 0], [-28, 0, 0]], { color: RED, width: 4.5, head: 12 }); a.visible = false; gridG.add(a); pushes.push(a); }
    const shakeLabel = ctx.label('grip ×0.7 to 1.3, pushes ±0.3 m/s', V(GX - 120, 4, GZ + 20), { cls: 'is-small' });
    // the lane: 14 squares, a duck, and where it believes it is
    const LANE = 14, LC = 26, LZ = -40;
    const laneX = (i) => -LANE * LC / 2 + LC / 2 + i * LC + 6;
    const lane = new K.Board({ cols: LANE, rows: 1, cell: LC, thick: 4 });
    lane.group.position.set(6, 0, LZ);
    group.add(lane.group);
    const walker = new K.Duck({ scale: 0.13 });
    group.add(walker.root);
    const belief = K.ringFlat(8, 11.5, BLUE, { y: 5.5 });
    const beliefG = new THREE.Group(); beliefG.add(belief); group.add(beliefG);
    const nest = K.ringFlat(11, 14, ORANGE, { y: 5.4 });
    nest.position.x = laneX(7); nest.position.z = LZ;
    const nestG = new THREE.Group(); nestG.add(nest); group.add(nestG);
    const nestLabel = ctx.label('nest', V(laneX(7), 24, LZ + 18), { cls: 'is-small' });
    const beliefLabel = ctx.label('where it thinks it is', V(laneX(10), 30, LZ - 42), { cls: 'is-blue' });
    // the chart, lying in front: the miss along the row, then the measured rates
    const chart = new K.Chart({ w: 400, h: 150, x: [0, 14], y: [0, 1], xLabel: 'cards walked', yLabel: 'miss', px: 3, stand: false });
    chart.group.position.set(8, 0, 100);
    group.add(chart.group);
    const st = { shake: 0, drift: 0, chap: 0, measure: 0, t: 0 };
    const missAt = (cards, chaptered) => 0.065 * (chaptered && cards > 7 ? cards - 7 : cards);
    const rates = [['shipped loop', 37], ['merged cards', 42], ['nests', 63], ['mat on the nest', 97.5]];
    const draw = () => {
      const k = Math.floor(st.t * 2.2);
      tiles.forEach((t, i) => {
        const g = grip[i];
        t.material.color.setHex(st.shake > 0.05 ? gripColor(g) : 0xece4d2);
        const d = ducks[i];
        if (st.shake > 0.05) d.walkPose(st.t * 1.8 + i * 0.3, { stride: 0, lift: 8 }); else d.setJoints(d.stand);
        d.root.rotation.z = st.shake > 0.05 ? Math.sin(st.t * 3 + i) * 0.05 : 0;
      });
      pushes.forEach((a, j) => {
        const tt = tiles[(k * 5 + j * 7) % 16].position;
        a.visible = st.shake > 0.2 && ((k + j * 3) % 5 === 0);
        a.position.set(tt.x + 24, 12, tt.z);
      });
      show(shakeLabel, st.shake > 0.3);
      // the walker: the drift row, then (after a reset) the chaptered row
      const chaptered = st.chap > 0;
      const prog = chaptered ? seg(st.chap, 0.15, 1) : st.drift;
      const cards = 13 * prog;
      walker.root.position.set(laneX(0) + cards * LC, 4, LZ);
      const reset = chaptered ? seg(st.chap, 0, 0.15) : 1;
      walker.root.scale.setScalar(0.13 * Math.max(0.01, chaptered && reset < 1 ? Math.abs(1 - reset * 2) : 1));
      if (chaptered && reset < 0.5) walker.root.position.x = laneX(0) + 13 * LC;
      if (prog > 0 && prog < 1) walker.walkPose(K.Duck.phaseFor(cards * LC / 0.13), { stride: 40 }); else walker.setJoints(walker.stand);
      let miss = missAt(cards, chaptered);
      if (chaptered && cards > 7 && cards < 7.6) miss = lerp(missAt(7, false), missAt(cards, true), clamp((cards - 7) / 0.6));
      beliefG.visible = prog > 0.01 && st.measure < 0.5 && !(chaptered && reset < 1);
      belief.position.set(walker.root.position.x + miss * 22, 5.5, LZ - miss * 52);
      nestG.visible = chaptered && st.measure < 0.5;
      show(nestLabel, chaptered && st.measure < 0.5);
      show(beliefLabel, st.drift > 0.5 && !chaptered);
      if (st.measure > 0) {
        chart.marks = [];
        chart.xLabel = '';
        chart.yLabel = 'long rows landed';
        chart.extra = (c, X, Y, px) => {
          rates.forEach(([name, v], i) => {
            const x0 = 40 * px + i * 90 * px, hgt = (v / 100) * (92 * px) * clamp(st.measure * 1.5 - i * 0.15);
            const y0 = 124 * px;
            c.fillStyle = i === 3 ? '#2f9a5c' : '#5a8fd8';
            c.fillRect(x0 + 28 * px, y0 - hgt, 40 * px, hgt);
            c.fillStyle = '#2b2620';
            c.font = `700 ${12 * px}px ${K.ROUND}`;
            c.textAlign = 'center';
            if (hgt > 1) c.fillText(`${v}%`, x0 + 48 * px, y0 - hgt - 4 * px);
            c.font = `500 ${10 * px}px ${K.FONT}`;
            c.fillText(name, x0 + 48 * px, y0 + 13 * px);
          });
        };
        plotIf(chart, k3('bars', st.measure), []);
      } else {
        const pts = (fn, upto) => Array.from({ length: 141 }, (_, i) => [i / 10, fn(i / 10)]).slice(0, Math.max(2, Math.round(141 * upto)));
        chart.extra = null;
        chart.xLabel = 'cards walked';
        chart.yLabel = 'miss';
        const series = [];
        if (st.drift > 0) series.push({ points: pts((c) => missAt(c, false), chaptered ? 1 : st.drift), color: '#d8432e', width: 3 });
        if (chaptered && prog > 0) series.push({ points: pts((c) => missAt(c, true), prog), color: '#2f9a5c', width: 3.5 });
        chart.marks = chaptered && prog > 0.5 ? [{ x: 7, color: '#ff9500', text: 'nest', align: 'left' }] : [];
        plotIf(chart, k3('line', st.drift, prog, chaptered ? 1 : 0), series);
      }
    };
    const api = {
      group,
      reset() { Object.assign(st, { shake: 0, drift: 0, chap: 0, measure: 0 }); api._n = api._r = false; draw(); },
      steps: [
        { dur: 3.0, start() { ctx.sound('swish'); }, run(u) { st.shake = u; draw(); } },
        { dur: 4.2, run(u) { st.drift = u; draw(); } },
        { dur: 4.6, run(u) {
          st.chap = u; draw();
          say1(api, '_r', u > 0.05, () => ctx.say('reset', V(laneX(13), 60, LZ), { cls: 'is-blue', sound: 'pop' }));
          say1(api, '_n', u > 0.6, () => ctx.say('re-seat', V(laneX(7), 64, LZ), { cls: 'is-accent', sound: 'pop' }));
        } },
        { dur: 2.8, start() { ctx.sound('ding'); }, run(u) { st.measure = u; draw(); } },
      ],
      idle(t, dt) { st.t += dt; if (st.shake > 0.05) draw(); },
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 8. honest numbers
  honest(ctx) {
    const { group } = ctx;
    const MAX = 400, SZ = 8.5, GAP = 2.6;
    const tokens = instBars(MAX, { w: SZ, d: SZ, color: GREEN });
    const tokG = new THREE.Group(); tokG.add(tokens.mesh); group.add(tokG);
    const gridPos = (i) => { const c = i % 20, r = Math.floor(i / 20); return [-205 + c * (SZ + GAP), -228 + r * (SZ + GAP)]; };
    const sessPos = (i) => {
      const s = Math.floor(i / 12), k = i % 12;
      const sc = s % 6, sr = Math.floor(s / 6);
      return [-210 + sc * 41 + (k % 4) * (SZ + 0.6), -232 + sr * 38 + Math.floor(k / 4) * (SZ + 0.6)];
    };
    const z = 1.96;
    const ub = (n) => (z * z) / (n + z * z);
    // the ruler: 0 to 5 percent, with the 1 percent line
    const RX0 = -170, RX1 = 190, RZ = 118;
    const pct = (p) => lerp(RX0, RX1, p / 5);
    const ruler = new THREE.Group();
    const rbase = K.box(RX1 - RX0 + 16, 6, 30, 0xf6eedb); rbase.position.set((RX0 + RX1) / 2, 3, RZ); ruler.add(rbase);
    for (let p = 0; p <= 5; p++) { const tick = new THREE.Mesh(new THREE.BoxGeometry(2, 2, p === 1 ? 44 : 22), K.flat(p === 1 ? RED : K.COL.ink)); tick.position.set(pct(p), 7, RZ); ruler.add(tick); }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 18), K.paper(GREEN)); bar.geometry.translate(0.5, 0, 0); bar.position.set(pct(0), 12, RZ); ruler.add(bar);
    const wide = new THREE.Mesh(new THREE.BoxGeometry(1, 6, 26), K.flat(GREEN, { transparent: true, opacity: 0.28, depthWrite: false })); wide.geometry.translate(0.5, 0, 0); wide.position.set(pct(0), 10, RZ); ruler.add(wide);
    group.add(ruler);
    const tickLabels = [0, 1, 2, 3, 4, 5].map((p) => ctx.label(`${p}%`, V(pct(p), 4, RZ + 34), { cls: p === 1 ? 'is-small is-red' : 'is-small' }));
    const ubLabel = ctx.label('', V(0, 46, RZ), { cls: 'is-accent' });
    const sessLabel = ctx.label('400 rows ≈ 34 ducks', V(80, 60, -150), { cls: 'is-blue' });
    const wideLabel = ctx.label('counted by duck: up to 10%, off the ruler', V(0, 30, RZ - 38), { cls: 'is-small' });
    const st = { n: 0, ruler: 0, sess: 0, manual: 0 };
    const draw = () => {
      const n = Math.round(st.n);
      for (let i = 0; i < MAX; i++) {
        if (i >= n) { tokens.hide(i); continue; }
        const [gx, gz] = gridPos(i), [sx, sz] = sessPos(i);
        const e = ease.inOut(st.sess);
        tokens.set(i, lerp(gx, sx, e), 0, lerp(gz, sz, e), SZ * 0.8);
        const s = Math.floor(i / 12);
        tokens.color(i, st.sess > 0.3 ? (s % 2 ? 0x2f9a5c : 0x6cc08b) : GREEN);
      }
      tokens.commit();
      ruler.visible = st.ruler > 0.001;
      const shownN = Math.max(1, n);
      const u = ub(shownN) * 100;
      bar.scale.x = Math.max(0.5, (pct(Math.min(5, u)) - pct(0)) * ease.out(st.ruler));
      wide.visible = st.sess > 0.3;
      // counted by duck: 0 falls in about 34 independent sessions bounds the rate near 10%,
      // past the ruler's end; the honest interval lies between the two bars
      const byDuck = ub(34) * 100;
      wide.scale.x = Math.max(0.5, pct(Math.min(5, lerp(u, byDuck, ease.inOut(st.sess)))) - pct(0));
      tickLabels.forEach((l) => show(l, st.ruler > 0.3));
      setText(ubLabel, `0 falls in ${n} rows: up to ${u.toFixed(n >= 300 ? 2 : 1)}%, counted by row`);
      ubLabel.position.x = Math.min(120, pct(Math.min(5, u)) * 0.6);
      show(ubLabel, st.ruler > 0.6);
      show(sessLabel, st.sess > 0.6);
      show(wideLabel, st.sess > 0.6);
    };
    const api = {
      group,
      slider: { label: 'Rows n', min: 20, max: 400, step: 1, value: 100, format: (v) => String(Math.round(v)), input(v) { st.n = v; if (st.ruler < 1) st.ruler = 1; draw(); } },
      chips() {
        const n = Math.round(st.n);
        if (n < 1) return [];
        return [['rows', String(n)], ['falls', '0'], ['Wilson upper', `${(ub(n) * 100).toFixed(2)}%`]];
      },
      reset() { Object.assign(st, { n: 0, ruler: 0, sess: 0 }); draw(); },
      steps: [
        { dur: 2.2, start() { ctx.sound('pop'); }, run(u) { st.n = 100 * ease.out(u); draw(); }, end() { st.n = 100; draw(); } },
        { dur: 2.0, run(u) { st.ruler = u; draw(); } },
        { dur: 3.2, run(u) { st.n = lerp(100, 381, ease.inOut(u)); draw(); }, end() { st.n = 381; draw(); ctx.say('1%', V(pct(1), 60, RZ), { cls: 'is-red', sound: 'ding' }); } },
        { dur: 3.0, run(u) { st.n = lerp(381, 400, seg(u, 0, 0.2)); st.sess = seg(u, 0.15, 0.85); draw(); }, end() { st.n = 400; st.sess = 1; draw(); } },
      ],
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 9. people
  people(ctx) {
    const { group } = ctx;
    // back left: a walk, recorded as rows flowing into a dataset
    const walkG = new THREE.Group(); group.add(walkG);
    const traveler = K.person({ h: 104 }); traveler.position.set(-185, 0, -175); traveler.rotation.y = 0.5; walkG.add(traveler);
    const kd = new K.Duck({ scale: 0.21 }); kd.root.position.set(-150, 0, -150); kd.root.rotation.y = 0.3; walkG.add(kd.root);
    const can = K.cylinder(24, 24, 50, 0xd6e4f3, { seg: 28 }); can.position.set(-50, 25, -205); walkG.add(can);
    const canLabel = ctx.label('open dataset', V(-50, 70, -205), { cls: 'is-blue is-small' });
    const rows = [];
    for (let i = 0; i < 8; i++) { const r = K.box(15, 3, 9, 0xfffaf0); r.visible = false; walkG.add(r); rows.push(r); }
    const rowLabel = ctx.label('sensed, did, earned', V(-110, 4, -128), { cls: 'is-small' });
    // back right: two runs, one pick, a pile of labels
    const pickG = new THREE.Group(); group.add(pickG);
    const ped = (x) => { const p = K.box(50, 14, 50, 0xe9e2d0); p.position.set(x, 7, -185); pickG.add(p); return p; };
    ped(55); ped(140);
    const da = new K.Duck({ scale: 0.24 }); da.root.position.set(55, 14, -185); da.root.rotation.y = -0.7; pickG.add(da.root);
    const db = new K.Duck({ scale: 0.24 }); db.root.position.set(140, 14, -185); db.root.rotation.y = -0.7; pickG.add(db.root);
    const la = ctx.label('A', V(55, 96, -185), { cls: 'is-big' });
    const lb = ctx.label('B', V(140, 96, -185), { cls: 'is-big' });
    const tick = ctx.label('picked', V(55, 122, -185), { cls: 'is-green' });
    const pile = new THREE.Group(); pile.position.set(176, 0, -112); pickG.add(pile);
    const cards = [];
    for (let i = 0; i < 4; i++) { const c = K.box(36, 3, 24, 0xfff1dc); c.position.set(0, 2 + i * 3.4, 0); c.rotation.y = (i % 2 ? 0.2 : -0.15); c.visible = i < 3; pile.add(c); cards.push(c); }
    const pileLabel = ctx.label('labels', V(176, 34, -112), { cls: 'is-small' });
    // front left: a scorer fitted to the picks, off the phone
    const chart = easel(new K.Chart({ w: 210, h: 140, x: [-4, 4], y: [-0.05, 1.05], xLabel: 'score A minus score B', yLabel: 'A picked', px: 3 }), -100, 92, -0.86);
    group.add(chart.group);
    const R = K.rng(9);
    const picks = Array.from({ length: 26 }, () => { const x = (R() - 0.5) * 7.6; return [x, R() < 1 / (1 + Math.exp(-x * 1.4)) ? 1 : 0]; });
    const offLabel = ctx.label('off the phone', V(-100, 4, 128), { cls: 'is-small' });
    // front right: a pose, copied
    const poseG = new THREE.Group(); group.add(poseG);
    const person = K.person({ h: 116 }); person.position.set(85, 0, 60); person.rotation.y = -0.3; poseG.add(person);
    const armL = K.capsule(5, 38, 0x5a7d9a); const armR = K.capsule(5, 38, 0x5a7d9a);
    const shL = new THREE.Group(); shL.position.set(-21, 71, 0); shL.add(armL); armL.position.y = -21; person.add(shL);
    const shR = new THREE.Group(); shR.position.set(21, 71, 0); shR.add(armR); armR.position.y = -21; person.add(shR);
    const md = new K.Duck({ scale: 0.36 }); md.root.position.set(152, 0, 100); md.root.rotation.y = -1.25; poseG.add(md.root);
    const mimicLabel = ctx.label('the duck copies the pose', V(130, 4, 148), { cls: 'is-small' });
    const st = { ep: 0, pick: 0, fit: 0, pose: 0, t: 0 };
    const draw = () => {
      const t = st.t;
      // rows flow into the can while the episode records; each fades in and out at its ends
      const rec = st.ep > 0.05 && st.ep < 0.999;
      rows.forEach((r, i) => {
        const ph = (t * 0.5 + i / rows.length) % 1;
        r.visible = rec;
        r.position.set(lerp(-145, -50, ph), 18 + Math.sin(ph * Math.PI) * 46, lerp(-150, -205, ph));
        r.scale.setScalar(Math.max(0.01, Math.min(1, ph * 8, (1 - ph) * 8)));
      });
      if (rec) kd.walkPose(t * 1.6, { stride: 0, lift: 8 }); else kd.setJoints(kd.stand);
      show(canLabel, st.ep > 0.2);
      show(rowLabel, rec && st.ep > 0.2);
      // A walks smoothly, B jitters; A is picked; a label drops on the pile
      if (st.pick > 0) { da.walkPose(t * 1.4, { stride: 0, lift: 9 }); const a = db.stand.slice(); a[5] += Math.sin(t * 23) * 0.18; a[2] += Math.sin(t * 19) * 0.12; db.setJoints(a); }
      else { da.setJoints(da.stand); db.setJoints(db.stand); }
      show(la, st.pick > 0.05); show(lb, st.pick > 0.05);
      show(tick, st.pick > 0.5);
      const drop = ease.land(seg(st.pick, 0.55, 0.9));
      cards[3].visible = st.pick > 0.55;
      cards[3].position.set(0, lerp(110, 2 + 3 * 3.4, drop), 0);
      show(pileLabel, st.pick > 0.6);
      // the scorer: the picks as dots, then the curve through them
      const shownPicks = st.fit > 0 ? Math.max(1, Math.round(picks.length * clamp(st.fit * 2))) : 0;
      const series = [];
      if (st.fit > 0.3) series.push({ points: Array.from({ length: 81 }, (_, i) => { const x = -4 + i * 0.1; return [x, 1 / (1 + Math.exp(-x * 1.4))]; }), color: '#2f9a5c', width: 3.5, upto: Math.max(2, Math.round(81 * clamp(st.fit * 1.6 - 0.5))) });
      chart.extra = (c, X, Y, px) => {
        c.fillStyle = '#5c574e';
        for (let i = 0; i < shownPicks; i++) { c.beginPath(); c.arc(X(picks[i][0]), Y(picks[i][1]), 2.6 * px, 0, Math.PI * 2); c.fill(); }
      };
      plotIf(chart, k3(st.fit), series);
      show(offLabel, st.fit > 0.2);
      // a person lifts both arms; the duck lifts its head
      const p = ease.inOut(st.pose);
      shL.rotation.z = -p * 2.3; shR.rotation.z = p * 2.3;
      const a = md.stand.slice();
      a[5] = lerp(md.stand[5], -0.45, p); a[6] = lerp(md.stand[6], -0.35, p);
      md.setJoints(a);
      show(mimicLabel, st.pose > 0.5);
    };
    const api = {
      group,
      reset() { Object.assign(st, { ep: 0, pick: 0, fit: 0, pose: 0 }); draw(); },
      steps: [
        { dur: 3.4, start() { ctx.sound('pop'); }, run(u) { st.ep = u; draw(); } },
        { dur: 3.2, run(u) { st.pick = u; draw(); }, end() { ctx.say('A over B', V(150, 70, -112), { cls: 'is-green', sound: 'tick' }); } },
        { dur: 3.0, run(u) { st.fit = u; draw(); } },
        { dur: 2.6, start() { ctx.sound('quack'); }, run(u) { st.pose = Math.sin(clamp(u / 0.85) * Math.PI / 2); draw(); } },
      ],
      idle(t, dt) { st.t += dt; draw(); },
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 10. shipping
  ship(ctx) {
    const { group } = ctx;
    const BZ = 30, X0 = -195, X1 = 186;
    const S = [-152, -74, 4, 82, 150];
    const beltG = new THREE.Group(); group.add(beltG);
    const belt = K.box(X1 - X0, 8, 34, 0x5c5c64); belt.position.set((X0 + X1) / 2, 4, BZ); beltG.add(belt);
    const names = ['smoke test', 'train', 'export', 'publish', 'measure'];
    const stationLabels = names.map((n, i) => ctx.label(n, V(S[i], 4, BZ + 44), { cls: 'is-small' }));
    // smoke test: 64 small ducks
    const crowd = K.duckCrowd(64, { size: 3.4 });
    const crowdG = new THREE.Group(); crowdG.add(crowd); group.add(crowdG);
    const dummy = new THREE.Object3D();
    const setCrowd = (t, on) => {
      for (let i = 0; i < 64; i++) {
        const c = i % 8, r = Math.floor(i / 8);
        dummy.position.set(S[0] - 33 + c * 9.5, on ? Math.abs(Math.sin(t * 7 + i)) * 1.2 : 0, -120 + r * 9.5);
        dummy.rotation.set(0, -Math.PI / 2, 0);
        dummy.scale.setScalar(on ? 1 : 0.0001);
        dummy.updateMatrix();
        crowd.setMatrixAt(i, dummy.matrix);
      }
      crowd.instanceMatrix.needsUpdate = true;
    };
    const spark = ctx.label('config error caught', V(S[0], 70, -100), { cls: 'is-red' });
    const iterLabel = ctx.label('', V(S[0], 46, -40), { cls: 'is-small' });
    // train: the run's chart, penalties under zero, the task term rising
    const run = easel(new K.Chart({ w: 120, h: 86, x: [0, 1], y: [-0.5, 1], px: 3 }), S[1], -100, -0.5);
    group.add(run.group);
    // export: the normalizer ring the file passes through
    const ring = K.torus(24, 4, 0x7044c2); ring.position.set(S[2], 30, BZ); ring.rotation.y = Math.PI / 2;
    const ringG = new THREE.Group(); ringG.add(ring); group.add(ringG);
    const normLabel = ctx.label('normalizer baked in', V(S[2], 74, BZ), { cls: 'is-small' });
    // publish: a gate, and a padlock for the private repository
    const gate = new THREE.Group();
    const p1 = K.box(8, 66, 8, 0x3c3c44); p1.position.set(0, 33, BZ - 24); gate.add(p1);
    const p2 = K.box(8, 66, 8, 0x3c3c44); p2.position.set(0, 33, BZ + 24); gate.add(p2);
    const top = K.box(10, 8, 56, 0x3c3c44); top.position.set(0, 66, BZ); gate.add(top);
    gate.position.x = S[3];
    const lock = new THREE.Group();
    const lb = K.box(22, 18, 10, 0xd9a441); lb.position.y = 9; lock.add(lb);
    const shackle = K.torus(7, 2.2, 0x8a8478); shackle.position.y = 20; lock.add(shackle);
    lock.position.set(S[3] + 26, 0, BZ - 72);
    const pubG = new THREE.Group(); pubG.add(gate, lock); group.add(pubG);
    const shapeLabel = ctx.label('[1,61] → [1,14], no NaN', V(S[3], 100, BZ), { cls: 'is-small' });
    const privLabel = ctx.label('private', V(S[3] + 26, 40, BZ - 72), { cls: 'is-small' });
    // measure: a duck runs it, and the log unrolls
    const duck = new K.Duck({ scale: 0.3 }); duck.root.position.set(S[4] + 8, 0, BZ - 80); duck.root.rotation.y = -1.2;
    const scroll = new THREE.Group();
    const roll = K.cylinder(6, 6, 44, 0xfffaf0, { seg: 16 }); roll.rotation.x = Math.PI / 2; roll.position.y = 6; scroll.add(roll);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(44, 1), K.paper(0xfffaf0, { side: THREE.DoubleSide }));
    sheet.rotation.x = -Math.PI / 2; sheet.geometry.translate(0, -0.5, 0); sheet.position.set(0, 1.2, 0); scroll.add(sheet);
    scroll.position.set(S[4] - 4, 0, BZ + 62);
    const measG = new THREE.Group(); measG.add(duck.root, scroll); group.add(measG);
    const logLabel = ctx.label('EvalLog', V(S[4] - 4, 26, BZ + 112), { cls: 'is-blue' });
    // the files on the belt: the good one, and one that outputs NaN
    const file = (color) => { const f = K.box(28, 20, 22, color); f.position.y = 18; const g = new THREE.Group(); g.add(f); return g; };
    const good = file(ORANGE), bad = file(RED);
    const filesG = new THREE.Group(); filesG.add(good, bad); group.add(filesG);
    const badLabel = ctx.label('NaN: refused', V(0, 46, 0), { cls: 'is-red', parent: bad });
    const st = { smoke: 0, train: 0, exp: 0, pub: 0, meas: 0, t: 0 };
    const draw = () => {
      const t = st.t;
      const smoking = st.smoke > 0.02 && st.smoke < 0.999;
      setCrowd(t, smoking);
      crowdG.visible = smoking;
      setText(iterLabel, `iteration ${Math.min(5, 1 + Math.floor(st.smoke * 5))} of 5`);
      show(iterLabel, smoking);
      show(spark, st.smoke > 0.6 && smoking);
      stationLabels.forEach((l) => show(l, true));
      const series = [];
      if (st.train > 0) {
        const upto = Math.max(2, Math.round(41 * st.train));
        series.push({ points: Array.from({ length: 41 }, (_, i) => [i / 40, 0.05 + 0.85 * (1 - Math.exp(-i / 12))]), color: '#2f9a5c', width: 3, upto });
        series.push({ points: Array.from({ length: 41 }, (_, i) => [i / 40, -0.12 - 0.18 * (i / 40)]), color: '#d8432e', width: 3, upto });
        series.push({ points: Array.from({ length: 41 }, (_, i) => [i / 40, -0.3 + 0.1 * Math.sin(i * 0.4)]), color: '#d98b7a', width: 2.5, upto });
      }
      run.marks = st.train > 0 ? [{ y: 0, color: '#8a8478', dash: [3, 4] }] : [];
      plotIf(run, k3(st.train), series);
      // the good file rides from train, through the ring, past the gate, to the duck
      let gx = S[1];
      if (st.exp > 0) gx = lerp(S[1], S[2] + 32, ease.inOut(st.exp));
      if (st.pub > 0) gx = lerp(S[2] + 32, S[3] + 34, ease.inOut(clamp((st.pub - 0.4) / 0.6)));
      if (st.meas > 0) gx = lerp(S[3] + 34, S[4] - 30, ease.inOut(clamp(st.meas / 0.4)));
      good.position.set(gx, 8, BZ);
      good.visible = st.train > 0.5;
      good.children[0].material = K.paper(st.exp > 0.55 ? 0xffb340 : ORANGE);
      show(normLabel, st.exp > 0.3 && st.exp < 1);
      // the bad file reaches the gate first and is pushed off the belt
      const b = st.pub;
      bad.visible = b > 0.001 && b < 0.999;
      const bx = lerp(S[2] + 8, S[3] - 22, ease.inOut(clamp(b / 0.3)));
      const off = ease.in(clamp((b - 0.3) / 0.25));
      bad.position.set(bx, 8 - off * 8, BZ + off * 62);
      bad.rotation.x = off * 1.2;
      show(badLabel, b > 0.25 && b < 0.999);
      show(shapeLabel, b > 0.05 && st.meas < 0.5);
      lock.visible = b > 0.75;
      show(privLabel, b > 0.8 && st.meas < 0.5);
      if (st.meas > 0.4) duck.walkPose(t * 1.5, { stride: 0, lift: 9 }); else duck.setJoints(duck.stand);
      sheet.scale.y = Math.max(0.01, ease.out(clamp((st.meas - 0.45) / 0.5)) * 44);
      show(logLabel, st.meas > 0.7);
    };
    const api = {
      group,
      reset() { Object.assign(st, { smoke: 0, train: 0, exp: 0, pub: 0, meas: 0 }); api._r = false; draw(); },
      steps: [
        { dur: 3.0, start() { ctx.sound('pop'); }, run(u) { st.smoke = u; draw(); }, end() { st.smoke = 1; draw(); } },
        { dur: 3.0, run(u) { st.train = u; draw(); } },
        { dur: 3.0, start() { ctx.sound('swish'); }, run(u) { st.exp = u; draw(); } },
        { dur: 3.4, run(u) { st.pub = u; draw(); say1(api, '_r', u > 0.3, () => ctx.say('refused', V(S[3], 116, BZ + 36), { cls: 'is-red', sound: 'thud' })); }, end() { api._r = false; } },
        { dur: 3.0, run(u) { st.meas = u; draw(); }, end() { ctx.say('report what it shows', V(S[4] - 95, 124, BZ), { cls: 'is-green', sound: 'ding', life: 1.6, scale: 0.65 }); } },
      ],
      idle(t, dt) { st.t += dt; draw(); },
    };
    api.reset();
    return api;
  },
};
