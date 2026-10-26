// Book 4, How a Policy Became: the figure on each right-hand page.
//
// The runs in this book are real, so the figures draw their numbers: the
// speeds, widths, weights and logs are copied from duckbatch's notes and
// records, and each lesson's notes say which. Where a figure has to invent
// something to draw (a duck's stride, a ball's roll), the page's caption says
// so. Each figure keeps a small state and one draw() that turns it into the
// picture, so a step only moves numbers and ends where the next begins.

import * as K from './kit.js';

const { THREE } = K;
const { ease, seg, lerp, clamp } = K;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function show(label, on) { label.userData.el.classList.toggle('is-hidden', !on); }
function setText(label, text) { if (label.userData.el.textContent !== text) label.userData.el.textContent = text; }
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
// Redraw a chart's canvas only when what it shows has changed.
function plotIf(chart, key, series) {
  if (chart._key === key) return;
  chart._key = key;
  chart.plot(series);
}

// A flat strip of paper lying on the page.
function strip(w, d, color = 0xece4d2) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), K.paper(color));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.8;
  m.receiveShadow = true;
  return m;
}

// Scale an object up from nothing, the way a pop-up stands up off the page.
function pop(obj, u) { obj.scale.setScalar(Math.max(0.001, ease.back(clamp(u)))); obj.visible = u > 0.001; }

const BLUE = K.COL.blue, GREEN = 0x2f9a5c, RED = K.COL.red, ORANGE = K.COL.orange;

// Pairs of bars for two series side by side: a name under each pair, its values over the bars.
// grow(g) says how far each pair has risen, from 0 to 1.
function pairBars(ctx, parent, groups, { z = 30, x0 = -150, dx = 112, gap = 44, H = 100, colors = [K.COL.blue, K.COL.orange], cls = ['is-small is-blue', 'is-small is-accent'] } = {}) {
  const bars = instBars(groups.length * 2, { w: 24, d: 22 });
  parent.add(bars.mesh);
  const gx = (g) => x0 + g * dx;
  const names = groups.map((gr, g) => ctx.label(gr.name, V(gx(g) + gap / 2, 2, z + 34), { cls: 'is-small', parent }));
  const vals = groups.map((gr, g) => gr.text.map((t, k) => ctx.label(t, V(gx(g) + k * gap, 14, z), { cls: cls[k], parent })));
  return {
    x: (g, k) => gx(g) + k * gap,
    top: (g, k) => Math.max(0, groups[g].vals[k]) * H,
    draw(grow) {
      groups.forEach((gr, g) => {
        const u = ease.out(clamp(grow(g)));
        const hs = gr.vals.map((v) => Math.max(0, v) * H * u);
        gr.vals.forEach((v, k) => {
          const h = hs[k];
          if (grow(g) < 0.01) bars.hide(2 * g + k);
          else bars.set(2 * g + k, gx(g) + k * gap, 0, z, Math.max(0.6, h));
          bars.color(2 * g + k, colors[k]);
          const lift = k === 1 && Math.abs(hs[1] - hs[0]) < 16 ? 20 : 0;
          vals[g][k].position.y = h + 14 + lift;
          show(vals[g][k], u > 0.6);
        });
        show(names[g], grow(g) > 0.3);
      });
      bars.commit();
    },
  };
}

// A paper rope between two points, sagging a little; thicker for a stronger pull.
function rope(a, b, r, color = 0x8a6d4a) {
  const m = a.clone().lerp(b, 0.5);
  m.y -= 8;
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a.clone(), m, b.clone()), 20, r, 6, false), K.paper(color));
}

// Thin flat needles lying on the page, one draw call: an arrow for each practice command.
function needles(n) {
  const geo = new THREE.BoxGeometry(1, 1.6, 3.6);
  geo.translate(0.5, 0.8, 0);
  const mesh = new THREE.InstancedMesh(geo, K.paper(0xffffff, { unique: true }), n);
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  return {
    mesh,
    set(i, x, z, ang, len, hex) {
      d.position.set(x, 1, z);
      d.rotation.set(0, ang, 0);
      d.scale.set(Math.max(0.5, len), 1, 1);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
      c.set(hex);
      mesh.setColorAt(i, c);
    },
    commit() { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; },
  };
}

// A flat line on the page through points, for paths and tracks.
function pathLine(points, color, width = 2.2) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => V(p[0], 1.4, p[1])));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, points.length * 4), width / 2, 5, false), K.flat(color));
}

// the same colours as the canvas draws them
const C_GREEN = '#2f9a5c', C_ORANGE = '#ff9500';

// The turning speed each run reached at a 1.0 rad/s command, from b003 to
// b003g, in the order they ran (each run's close note).
const TURNING = [0.017, 0.456, 0.299, 0.284, 0.525, 0.806, 0.699];

export const figures = {

  // ------------------------------------------------------------ the title page
  cover(ctx) {
    const { group } = ctx;
    // an open lab notebook, the run's chart lying on its right-hand page
    const book = new THREE.Group();
    const left = K.box(150, 6, 190, 0xfbf6ea); left.position.set(-78, 3, 0); left.rotation.z = 0.03; book.add(left);
    const right = K.box(150, 6, 190, 0xfbf6ea); right.position.set(78, 3, 0); right.rotation.z = -0.03; book.add(right);
    const spine = K.box(10, 8, 192, 0x2f6b4f); spine.position.set(0, 2, 0); book.add(spine);
    for (let i = 0; i < 7; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(110, 0.6, 2.2), K.flat(0xb9b0a0));
      line.position.set(-78, 6.6, -70 + i * 22);
      book.add(line);
    }
    book.position.set(30, 0, 10);
    book.rotation.y = -0.12;
    book.scale.setScalar(1.15);
    group.add(book);
    const chart = new K.Chart({ w: 130, h: 96, x: [0, TURNING.length - 1], y: [0, 0.9], xLabel: 'run', yLabel: 'turning', px: 3, stand: false });
    chart.plot([{ points: TURNING.map((v, i) => [i, v]), color: C_GREEN, width: 3, dots: 3 }]);
    chart.group.position.set(78, 6.5, 0);
    book.add(chart.group);
    // the tabs of the case files, one per run
    const tabs = new THREE.Group();
    ['b003', 'b003b', 'b003c', 'b003d', 'b003e', 'b003f', 'b003g'].forEach((name, i) => {
      const t = K.box(26, 34, 4, [0xf2c230, 0x9cc98a, 0x63aedb, 0xf1a3b5, 0xff9500, 0x7aa7e6, 0xd9cdb4][i]);
      t.position.set(-140 + i * 30, 17, -112);
      tabs.add(t);
    });
    tabs.position.set(30, 0, 10);
    tabs.rotation.y = -0.12;
    tabs.scale.setScalar(1.15);
    group.add(tabs);
    const duck = new K.Duck({ scale: 0.52 });
    duck.root.position.set(-160, 0, 175);
    duck.root.rotation.y = 0.75;
    group.add(duck.root);
    return {
      group, steps: [],
      reset() { duck.setJoints(duck.stand); },
      idle(t) {
        const a = duck.stand.slice();
        a[5] = duck.stand[5] + 0.25 + Math.sin(t * 0.9) * 0.05;
        a[7] = 0.35 + Math.sin(t * 0.5) * 0.25;
        duck.setJoints(a);
      },
    };
  },

  // ------------------------------------------------------------ 1. b003: the kernel
  kernel(ctx) {
    const { group } = ctx;
    const CMD = 0.3;
    // b003's TensorBoard log, Episode_Reward/track_linear_velocity, in 25-iteration
    // means: iterations 24, 49, ... 1,499.
    const LOG = [0.091, 0.257, 0.333, 0.356, 0.382, 0.395, 0.421, 0.425, 0.426, 0.401, 0.425, 0.426, 0.409, 0.406, 0.408,
      0.427, 0.418, 0.428, 0.452, 0.447, 0.431, 0.437, 0.45, 0.46, 0.457, 0.445, 0.458, 0.475, 0.484, 0.487, 0.469, 0.474,
      0.463, 0.465, 0.497, 0.482, 0.479, 0.491, 0.496, 0.482, 0.484, 0.478, 0.473, 0.494, 0.486, 0.49, 0.504, 0.501, 0.487,
      0.486, 0.457, 0.482, 0.488, 0.468, 0.48, 0.486, 0.497, 0.501, 0.501, 0.521];
    // the speeds the student and b003 reached, from b003's close note
    const SPEEDS = [['0.10 m/s', 0.007, 0.002, '0.007', '0.002'], ['0.30 m/s', 0.108, 0.060, '0.108', '0.060'], ['1.0 rad/s', 0.211, 0.017, '0.211', '0.017']];
    const pay = (v, s) => Math.exp(-((CMD - v) * (CMD - v)) / (s * s));
    const fmt = (p) => (p >= 0.995 ? 'all' : p < 0.001 ? p.toFixed(4) : p < 0.1 ? p.toFixed(3) : p.toFixed(2));

    // at the back, two cards on one easel line: the kernel, and later the log
    const KZ = -74, TILT = -0.48;
    const kc = easel(new K.Chart({ w: 300, h: 136, x: [0, 0.4], y: [0, 1.1], title: 'asked for 0.30 m/s', xLabel: 'speed, m/s', yLabel: 'pay', px: 3 }), 0, KZ, TILT);
    kc.xTicks = [0, 0.1, 0.2, 0.3, 0.4];
    group.add(kc.group);
    const dots = [0, 0.1, 0.3].map(() => { const d = K.packet(ORANGE, 5); kc.group.add(d); return d; });
    const lc = easel(new K.Chart({ w: 300, h: 136, x: [0, 1500], y: [0, 0.6], title: 'tracking reward, as b003 logged it', xLabel: 'iteration', px: 3 }), 0, KZ + 4, TILT);
    lc.xTicks = [0, 1500];
    lc.yTicks = [0, 0.25, 0.5];
    group.add(lc.group);

    // in front: three ducks, one for each answer to the command
    const xOn = (v) => kc._X(v) / kc.px - kc.w / 2;
    const ROW = 64;
    const WAYS = [{ v: 0, name: 'stands' }, { v: 0.1, name: 'manages 0.10' }, { v: 0.3, name: 'walks 0.30' }];
    const row = new THREE.Group();
    group.add(row);
    const ducks = [], belts = [], payLabels = [];
    WAYS.forEach((w, i) => {
      const x = -120 + 120 * i;
      const pad = strip(64, 34, [0xf3e1d4, 0xefe6d2, 0xdcebd9][i]);
      pad.position.set(x, 0.8, ROW + 4);
      row.add(pad);
      const marks = [];
      for (let k = 0; k < 3; k++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 2.4), K.flat(0xb9b0a0));
        m.position.set(x, 1.4, ROW + 16);
        row.add(m); marks.push(m);
      }
      belts.push({ x, marks });
      const d = new K.Duck({ scale: 0.27 });
      d.root.position.set(x, 0, ROW);
      row.add(d.root);
      ducks.push(d);
      ctx.label(w.name, V(x, 2, ROW + 38), { cls: 'is-small', parent: row });
      payLabels.push(ctx.label('', V(x, 82, ROW), { cls: 'is-small is-green', parent: row }));
    });
    const askLabel = ctx.label('asked for 0.30 m/s', V(0, 2, ROW + 66), { cls: 'is-accent', parent: row });

    // what PPO did: the student's speeds and b003's, side by side
    const sp = new THREE.Group();
    group.add(sp);
    const spBars = instBars(6, { w: 24, d: 22 });
    sp.add(spBars.mesh);
    const SZ = 30;
    const gx = (g) => -150 + g * 112;
    const H = 96 / 0.211;
    const spLabels = [];
    SPEEDS.forEach(([name, a, b, ta, tb], g) => {
      spLabels.push(ctx.label(name, V(gx(g) + 21, 2, SZ + 36), { cls: 'is-small', parent: sp }));
      const la = ctx.label(ta, V(gx(g), a * H + 14, SZ), { cls: 'is-small is-blue', parent: sp });
      const lb = ctx.label(tb, V(gx(g) + 44, b * H + 14, SZ), { cls: 'is-small is-accent', parent: sp });
      spLabels.push(la, lb);
    });
    spLabels.push(ctx.label('student', V(178, 72, SZ), { cls: 'is-small is-blue', parent: sp }));
    spLabels.push(ctx.label('b003', V(178, 48, SZ), { cls: 'is-small is-accent', parent: sp }));

    const st = { t: 0, sigma: 0.316, row: 0, curve: 0, speeds: 0, log: 0 };
    const draw = () => {
      const s = st.sigma;
      // the kernel curve, drawn as far as the step has got; it lies down when the log stands up
      const N = 61;
      const upto = Math.max(0, Math.round(N * st.curve));
      kc.marks = st.curve > 0.05 ? [{ x: CMD, color: C_ORANGE, dash: [4, 4] }] : [];
      plotIf(kc, `${s.toFixed(4)}|${upto}`, upto > 1 ? [{ points: Array.from({ length: N }, (_, i) => { const v = (0.4 * i) / (N - 1); return [v, pay(v, s)]; }), color: C_GREEN, width: 3, upto }] : []);
      [0, 0.1, 0.3].forEach((v, i) => {
        dots[i].visible = st.curve > 0.98;
        if (dots[i].visible) dots[i].position.copy(onChart(kc, v, pay(v, s), 3));
      });
      const fold = ease.inOut(st.log);
      kc.group.rotation.x = lerp(TILT, -Math.PI / 2 + 0.02, fold);
      lc.group.visible = st.log > 0.001;
      lc.group.rotation.x = lerp(-Math.PI / 2 + 0.02, TILT, ease.back(seg(st.log, 0.25, 1)));
      const lu = Math.round(LOG.length * seg(st.log, 0.45, 1));
      plotIf(lc, `log|${lu}`, lu > 1 ? [{ points: LOG.map((y, i) => [24 + 25 * i, y]), color: C_GREEN, width: 3, upto: lu }] : []);
      // the three ducks: one stands, one shuffles, one walks; the marks under them slide at their speed
      pop(row, st.row * (1 - ease.inOut(st.speeds)));
      WAYS.forEach((w, i) => {
        const d = ducks[i];
        if (w.v === 0) { const a = d.stand.slice(); a[1] = Math.sin(st.t * 1.3) * 0.03; a[10] = a[1]; d.setJoints(a); }
        else d.walkPose(st.t * (w.v > 0.2 ? 1.6 : 0.8), { stride: w.v > 0.2 ? 30 : 10, lift: w.v > 0.2 ? 13 : 6 });
        belts[i].marks.forEach((m, k) => {
          const u = (((k * 18 - st.t * w.v * 160) % 54 + 54) % 54) / 54;
          m.position.x = belts[i].x - 26 + u * 54;
          m.scale.setScalar(Math.max(0.001, Math.sin(Math.PI * u)));
        });
        setText(payLabels[i], `pay ${fmt(pay(w.v, s))}`);
        show(payLabels[i], st.curve > 0.98 && st.row > 0.6);
      });
      show(askLabel, st.row > 0.6);
      // the speeds
      pop(sp, st.speeds);
      SPEEDS.forEach(([, a, b], g) => {
        spBars.set(2 * g, gx(g), 0, SZ, Math.max(0.6, a * H));
        spBars.set(2 * g + 1, gx(g) + 44, 0, SZ, Math.max(0.6, b * H));
        spBars.color(2 * g, BLUE); spBars.color(2 * g + 1, ORANGE);
      });
      spBars.commit();
      spLabels.forEach((l) => show(l, st.speeds > 0.7));
    };
    const api = {
      group,
      slider: {
        label: 'σ', min: 0.05, max: 0.5, step: 0.001, value: 0.316, format: (v) => v.toFixed(3),
        input(v) { st.sigma = v; if (st.curve < 1) st.curve = 1; if (st.row < 1) st.row = 1; draw(); },
        get: () => Math.round(st.sigma * 1000) / 1000,
      },
      chips() {
        const s = st.sigma;
        return [['σ', s.toFixed(3)], ['standing', fmt(pay(0, s))], ['0.10', fmt(pay(0.1, s))], ['0.30', fmt(pay(0.3, s))]];
      },
      reset() { Object.assign(st, { sigma: api.slider.value, row: 0, curve: 0, speeds: 0, log: 0 }); draw(); },
      idle(t, dt) { st.t += dt; draw(); },
      steps: [
        { dur: 1.8, start() { ctx.sound('pop'); }, run(u) { st.row = u; draw(); } },
        { dur: 2.8, run(u) { st.sigma = 0.316; st.curve = seg(u, 0, 0.8); draw(); } },
        { dur: 3.0, run(u) { st.sigma = lerp(0.316, 0.1, ease.inOut(seg(u, 0, 0.8))); draw(); },
          end() { ctx.say('no slope', V(xOn(0.05), 120, KZ), { cls: 'is-red', sound: 'thud' }); } },
        { dur: 2.4, start() { ctx.sound('pop'); }, run(u) { st.speeds = u; draw(); } },
        { dur: 3.2, start() { ctx.sound('swish'); }, run(u) { st.log = u; draw(); }, end() { ctx.sound('ding'); } },
      ],
    };
    api.reset();
    return api;
  },
  // ------------------------------------------------------------ 2. b003b: progress
  progress(ctx) {
    const { group } = ctx;
    const CMD = 0.3;
    const track = (v) => 2 * Math.exp(-((CMD - v) * (CMD - v)) / 0.1);
    const prog = (v) => clamp(v, 0, CMD) / CMD;
    // at the back: what the two terms pay for each speed, asked for 0.30
    const KZ = -74, TILT = -0.48;
    const ch = easel(new K.Chart({ w: 300, h: 136, x: [0, 0.4], y: [0, 2.25], title: 'asked for 0.30 m/s', xLabel: 'speed, m/s', yLabel: 'pay', px: 3 }), 0, KZ, TILT);
    ch.xTicks = [0, 0.1, 0.2, 0.3, 0.4];
    group.add(ch.group);
    const tLab = ctx.label('tracking, weight 2.0', onChart(ch, 0.13, 1.95, 8), { cls: 'is-small is-green', parent: ch.group });
    const pLab = ctx.label('progress, weight 1.0', onChart(ch, 0.31, 0.62, 8), { cls: 'is-small is-accent', parent: ch.group });
    const dotT = K.packet(GREEN, 5), dotP = K.packet(ORANGE, 5);
    ch.group.add(dotT, dotP);

    // in front, one band that each step fills in turn
    const FZ = 70;
    // step 1: a duck on a speed track
    const trackG = new THREE.Group();
    group.add(trackG);
    const lane = strip(330, 40, 0xefe6d2);
    lane.position.set(0, 0.8, FZ);
    trackG.add(lane);
    const xOfV = (v) => -150 + (v / 0.4) * 300;
    for (const v of [0, 0.1, 0.2, 0.3, 0.4]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 14), K.flat(0xb9b0a0));
      t.position.set(xOfV(v), 1.4, FZ + 14);
      trackG.add(t);
    }
    const duck = new K.Duck({ scale: 0.26 });
    trackG.add(duck.root);
    const vLab = ctx.label('', V(0, 70, FZ), { cls: 'is-small', parent: trackG });
    // step 2: the pilot's falls
    const pilotG = new THREE.Group();
    group.add(pilotG);
    const pBars = instBars(2, { w: 34, d: 26 });
    pilotG.add(pBars.mesh);
    const PH = 90 / 0.96;
    const pl1 = ctx.label('student 0.36', V(-40, 0.36 * PH + 16, FZ), { cls: 'is-small is-blue', parent: pilotG });
    const pl2 = ctx.label('pilot 0.96', V(40, 0.96 * PH + 16, FZ), { cls: 'is-small is-accent', parent: pilotG });
    const pl3 = ctx.label('falls a minute, after 100 iterations', V(0, 2, FZ + 40), { cls: 'is-small', parent: pilotG });
    // steps 3 to 5: the speeds, student against b003b
    const spG = new THREE.Group();
    group.add(spG);
    const pairs = pairBars(ctx, spG, [
      { name: '0.40 m/s', vals: [0.157, 0.183], text: ['0.157', '0.183'] },
      { name: '1.0 rad/s', vals: [0.209, 0.456], text: ['0.209', '0.456'] },
      { name: '0.10 m/s', vals: [0.008, 0.008], text: ['0.008', '0.008'] },
      { name: '0.30 m/s', vals: [0.108, 0.1199], text: ['0.108', '0.1199'] },
    ], { z: FZ, x0: -150, dx: 82, gap: 34, H: 96 / 0.456 });
    const legS = ctx.label('student', V(-150, 2, FZ + 62), { cls: 'is-small is-blue', parent: spG });
    const legB = ctx.label('b003b', V(-96, 2, FZ + 62), { cls: 'is-small is-accent', parent: spG });
    const lineY = 0.12 * 96 / 0.456;
    const line = new THREE.Mesh(new THREE.BoxGeometry(62, 1.6, 30), K.flat(RED));
    line.position.set(pairs.x(3, 0) + 17, lineY, FZ);
    spG.add(line);
    const lineLab = ctx.label('line 0.12: fail by 0.0001', V(pairs.x(3, 0) + 6, lineY + 40, FZ), { cls: 'is-small is-red', parent: spG });

    const st = { t: 0, v: 0.1, chart: 0, track: 0, pilot: 0, speeds: 0, band: 0, line: 0 };
    const draw = () => {
      const N = 61;
      const upto = Math.max(0, Math.round(N * st.chart));
      const xs = Array.from({ length: N }, (_, i) => (0.4 * i) / (N - 1));
      plotIf(ch, `p|${upto}`, upto > 1 ? [
        { points: xs.map((v) => [v, track(v)]), color: C_GREEN, width: 3, upto },
        { points: xs.map((v) => [v, prog(v)]), color: C_ORANGE, width: 3, upto },
      ] : []);
      show(tLab, st.chart > 0.9); show(pLab, st.chart > 0.9);
      dotT.visible = dotP.visible = st.chart > 0.98 && st.pilot < 0.5;
      dotT.position.copy(onChart(ch, st.v, track(st.v), 3));
      dotP.position.copy(onChart(ch, st.v, prog(st.v), 3));
      // the track and its duck
      pop(trackG, st.track * (1 - ease.inOut(st.pilot)));
      duck.root.position.set(xOfV(st.v), 0, FZ - 4);
      if (st.v < 0.01) duck.setJoints(duck.stand);
      else duck.walkPose(st.t * (0.6 + 3 * st.v), { stride: 10 + 70 * st.v, lift: 6 + 18 * st.v });
      setText(vLab, `${st.v.toFixed(2)} m/s: tracking ${track(st.v).toFixed(2)}, progress ${prog(st.v).toFixed(2)}`);
      vLab.position.x = xOfV(st.v);
      show(vLab, st.chart > 0.9 && st.track > 0.9);
      // the pilot
      pop(pilotG, st.pilot * (1 - ease.inOut(st.speeds)));
      pBars.set(0, -40, 0, FZ, Math.max(0.6, 0.36 * PH * ease.out(st.pilot)));
      pBars.set(1, 40, 0, FZ, Math.max(0.6, 0.96 * PH * ease.out(st.pilot)));
      pBars.color(0, BLUE); pBars.color(1, ORANGE);
      pBars.commit();
      [pl1, pl2, pl3].forEach((l) => show(l, st.pilot > 0.7));
      // the speeds: the two that improved, then the band, then the line
      spG.visible = st.speeds > 0.001;
      pairs.draw((g) => (g < 2 ? st.speeds : g === 2 ? st.band : st.line));
      show(legS, st.speeds > 0.5); show(legB, st.speeds > 0.5);
      line.visible = st.line > 0.5;
      show(lineLab, st.line > 0.8);
    };
    const api = {
      group,
      slider: {
        label: 'speed', min: 0, max: 0.4, step: 0.01, value: 0.1, format: (v) => `${v.toFixed(2)} m/s`,
        input(v) { st.v = v; if (st.chart < 1) st.chart = 1; if (st.track < 1 && st.pilot === 0) st.track = 1; draw(); },
        get: () => Math.round(st.v * 100) / 100,
      },
      chips() {
        const v = st.v;
        return [['speed', v.toFixed(2)], ['tracking', track(v).toFixed(2)], ['progress', prog(v).toFixed(2)], ['total', (track(v) + prog(v)).toFixed(2)]];
      },
      reset() { Object.assign(st, { v: api.slider.value, chart: 0, track: 0, pilot: 0, speeds: 0, band: 0, line: 0 }); draw(); },
      idle(t, dt) { st.t += dt; draw(); },
      steps: [
        { dur: 2.8, start() { ctx.sound('pop'); }, run(u) { st.chart = seg(u, 0, 0.7); st.track = seg(u, 0.3, 1); st.v = lerp(0, 0.1, seg(u, 0.4, 1)); draw(); } },
        { dur: 2.4, start() { ctx.sound('pop'); }, run(u) { st.pilot = u; draw(); } },
        { dur: 2.6, start() { ctx.sound('pop'); }, run(u) { st.speeds = u; draw(); }, end() { ctx.say('more than doubled', V(-60, 140, FZ), { cls: 'is-green', life: 1.6, scale: 0.7 }); } },
        { dur: 2.0, run(u) { st.band = u; draw(); }, end() { ctx.say('no change', V(30, 60, FZ), { cls: 'is-red', sound: 'thud', life: 1.6, scale: 0.7 }); } },
        { dur: 2.4, run(u) { st.line = u; draw(); }, end() { ctx.sound('tick'); } },
      ],
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 3. b003c: the practice mix
  practice(ctx) {
    const { group } = ctx;
    const R = K.rng(11);
    const N = 60, COLS = 10, CELL = 30;
    // Commands for the envs asked to walk. Pollen's draw is even over the box, about 15% of it
    // under 0.15 m/s: 9 of these 60. b003c gives 21 of them, 35%, a slow command instead.
    const inBox = () => [lerp(-0.4, 0.4, R()), lerp(-0.3, 0.3, R())];
    const cmds = [];
    while (cmds.length < 9) { const c = inBox(); if (Math.hypot(c[0], c[1]) < 0.15) cmds.push(c); }
    while (cmds.length < N) { const c = inBox(); if (Math.hypot(c[0], c[1]) >= 0.15) cmds.push(c); }
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [cmds[i], cmds[j]] = [cmds[j], cmds[i]]; }
    const fast = cmds.map((c, i) => i).filter((i) => Math.hypot(cmds[i][0], cmds[i][1]) >= 0.15);
    const moved = new Set(fast.filter((_, k) => k % 4 === 1).slice(0, 12));
    const slowCmd = cmds.map(() => { const a = R() * Math.PI * 2, s = lerp(0.05, 0.25, R()); return [Math.cos(a) * s, Math.sin(a) * s]; });
    const isSlow = (c) => Math.hypot(c[0], c[1]) < 0.15;
    const ndl = needles(N);
    const tiles = instBars(N, { w: 24, d: 24 });
    const gridG = new THREE.Group();
    gridG.add(tiles.mesh, ndl.mesh);
    const pad = strip(COLS * CELL + 16, 6 * CELL + 16, 0xf3ecdc);
    pad.position.set(0, 0.6, -50);
    gridG.add(pad);
    group.add(gridG);
    const cellX = (i) => -((COLS - 1) * CELL) / 2 + (i % COLS) * CELL - 10;
    const cellZ = (i) => -125 + Math.floor(i / COLS) * CELL;
    const gridLab = ctx.label('', V(0, 4, 52), { cls: 'is-small is-accent' });
    // the sums at 0.10 m/s: coins for what standing and walking earn a step
    const sumG = new THREE.Group();
    group.add(sumG);
    const coins = instBars(15 + 9, { w: 26, d: 26 });
    sumG.add(coins.mesh);
    const SX = [-168, -116], SZ = 84;
    const sLab = ctx.label('standing 1.8', V(SX[0] + 4, 2, SZ + 30), { cls: 'is-small', parent: sumG });
    const wLab = ctx.label('walking, up to 3.0', V(SX[1] + 10, 2, SZ + 52), { cls: 'is-small', parent: sumG });
    const riskLab = ctx.label('if it does not fall', V(SX[1], 86, SZ), { cls: 'is-small is-red', parent: sumG });
    // the result: b003b against b003c
    const resG = new THREE.Group();
    group.add(resG);
    const pairs = pairBars(ctx, resG, [
      { name: '0.10 m/s', vals: [0.008, -0.001], text: ['0.008', '−0.001'] },
      { name: '0.30 m/s', vals: [0.120, 0.066], text: ['0.120', '0.066'] },
      { name: '1.0 rad/s', vals: [0.456, 0.299], text: ['0.456', '0.299'] },
    ], { z: SZ, x0: -50, dx: 80, gap: 38, H: 84 / 0.456 });
    const legB = ctx.label('b003b', V(-12, 2, SZ + 52), { cls: 'is-small is-blue', parent: resG });
    const legC = ctx.label('b003c', V(44, 2, SZ + 52), { cls: 'is-small is-accent', parent: resG });

    const st = { grid: 0, band: 0, sums: 0, res: 0 };
    const draw = () => {
      let slowN = 0;
      for (let i = 0; i < N; i++) {
        const into = moved.has(i) && st.band > (i % 7) / 7 * 0.6 + 0.2;
        const c = into ? slowCmd[i] : cmds[i];
        const slow = isSlow(c) || into;
        if (slow) slowN++;
        const len = (Math.hypot(c[0], c[1]) / 0.5) * 26 * ease.out(clamp(st.grid * 1.5 - (i / N) * 0.5));
        ndl.set(i, cellX(i), cellZ(i), Math.atan2(c[1], c[0]), len, slow ? 0x8a4b00 : 0x6d6658);
        const shown = clamp(st.grid * 1.5 - (i / N) * 0.5);
        if (shown < 0.01) tiles.hide(i); else tiles.set(i, cellX(i) + 10, 0, cellZ(i), 1.2 * ease.out(shown));
        tiles.color(i, slow ? ORANGE : 0xe9e1cf);
      }
      ndl.commit();
      tiles.commit();
      gridG.visible = st.grid > 0.001;
      setText(gridLab, `${slowN} of ${N} asked to walk slower than 0.15 m/s`);
      show(gridLab, st.grid > 0.8 && st.sums < 0.1);
      // coins: 0.2 a coin
      pop(sumG, st.sums);
      for (let k = 0; k < 9; k++) coins.set(k, SX[0], 1 + k * 4.8, SZ, 4);
      for (let k = 0; k < 15; k++) coins.set(9 + k, SX[1], 1 + k * 4.8, SZ, 4);
      for (let k = 0; k < 24; k++) coins.color(k, k < 9 ? 0xb9b0a0 : 0xf2c230);
      coins.commit();
      [sLab, wLab, riskLab].forEach((l) => show(l, st.sums > 0.7));
      resG.visible = st.res > 0.001;
      pairs.draw(() => st.res);
      show(legB, st.res > 0.5); show(legC, st.res > 0.5);
    };
    const api = {
      group,
      chips() {
        return [['walking envs', String(N)], ['slow commands', `${Math.round(100 * (9 + 12 * clamp(st.band * 1.3)) / N)}%`]];
      },
      reset() { Object.assign(st, { grid: 0, band: 0, sums: 0, res: 0 }); draw(); },
      steps: [
        { dur: 2.4, start() { ctx.sound('pop'); }, run(u) { st.grid = u; draw(); } },
        { dur: 2.8, run(u) { st.band = u; draw(); }, end() { ctx.sound('tick'); } },
        { dur: 2.2, start() { ctx.sound('pop'); }, run(u) { st.sums = u; draw(); } },
        { dur: 2.6, start() { ctx.sound('pop'); }, run(u) { st.res = u; draw(); }, end() { ctx.say('stood more', V(40, 120, SZ), { cls: 'is-red', sound: 'thud', life: 1.6, scale: 0.7 }); } },
      ],
    };
    api.reset();
    return api;
  },
  // ------------------------------------------------------------ 4. records: what ran
  records(ctx) {
    const { group } = ctx;
    const NAMES = ['menu', 'log', 'checkpoints', 'network', 'results'];
    // a folder at the back, and one run's records as cards out of it
    const folder = new THREE.Group();
    const fbase = K.box(130, 8, 70, 0xd9b26a); fbase.position.set(0, 4, 0); folder.add(fbase);
    const flap = K.box(130, 4, 70, 0xe7c47f); flap.position.set(0, 10, 0); folder.add(flap);
    folder.position.set(0, 0, -122);
    group.add(folder);
    const cards = NAMES.map((name) => { const c = K.sign(name, { w: 80, h: 32, size: 12 }); group.add(c); return c; });
    const cardAt = (i) => V(-164 + i * 82, 0, -84);
    // what was asked: the menu's line, large
    const menuBig = K.sign('rel_standing_envs: 0.05', { w: 184, h: 44, size: 13, font: 'ui-monospace, SFMono-Regular, Menlo, monospace', weight: 600 });
    menuBig.position.set(-108, 0, 24);
    menuBig.rotation.x = -0.3;
    group.add(menuBig);
    const askLab = ctx.label('asked', V(-108, 62, 24), { cls: 'is-accent' });
    // what ran: the logged share, flat at 0.25 for all 1,500 iterations
    const lc = new K.Chart({ w: 236, h: 118, x: [0, 1500], y: [0, 0.3], title: 'Curriculum/standing_envs', xLabel: 'iteration', px: 3 });
    lc.xTicks = [0, 1500];
    lc.yTicks = [0, 0.05, 0.25];
    lc.marks = [{ y: 0.05, color: C_ORANGE, dash: [4, 4], text: 'asked' }];
    lc.group.position.set(88, 0, 22);
    lc.group.rotation.x = -0.4;
    group.add(lc.group);
    const ranLab = ctx.label('ran', onChart(lc, 1150, 0.25, 8), { cls: 'is-red', parent: lc.group });
    // the practice mix, per hundred envs
    const R = K.rng(4);
    const order = Array.from({ length: 100 }, (_, i) => i);
    for (let i = 99; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const standing = new Set(order.slice(0, 25));
    // turning in place takes 25 of the hundred, 6 of them envs that had been drawn standing
    const turning = new Set([...order.slice(0, 6), ...order.slice(25, 44)]);
    const tiles = instBars(100, { w: 18, d: 18 });
    const mixG = new THREE.Group();
    mixG.add(tiles.mesh);
    group.add(mixG);
    const tx = (i) => -90 + (i % 10) * 20, tz = (i) => -112 + Math.floor(i / 10) * 20;
    const mixLab = ctx.label('', V(0, 4, 100), { cls: 'is-small' });

    const st = { cards: 0, asked: 0, ran: 0, mix: 0 };
    const draw = () => {
      // the cards rise out of the folder and fan out; they lie down again for the mix
      const out = ease.inOut(st.cards) * (1 - ease.inOut(seg(st.asked, 0, 0.5)));
      folder.visible = st.cards > 0.001 && st.asked < 0.6;
      folder.scale.setScalar(Math.max(0.001, ease.back(clamp(st.cards * 2))) * (1 - seg(st.asked, 0.1, 0.6)) + 0.001);
      cards.forEach((c, i) => {
        const to = cardAt(i);
        c.visible = out > 0.01;
        c.position.set(lerp(0, to.x, out), 0, lerp(-122, to.z, out));
        c.scale.setScalar(Math.max(0.001, out));
      });
      const away = 1 - ease.inOut(seg(st.mix, 0, 0.3));
      pop(menuBig, st.asked * away);
      show(askLab, st.asked > 0.7 && st.mix < 0.1);
      lc.group.visible = st.ran > 0.001 && away > 0.01;
      lc.group.scale.setScalar(Math.max(0.001, ease.back(st.ran) * away));
      const n = Math.round(60 * seg(st.ran, 0.3, 1));
      plotIf(lc, `sv|${n}`, n > 1 ? [{ points: Array.from({ length: 60 }, (_, i) => [i * 1500 / 59, 0.25]), color: '#d8432e', width: 3, upto: n }] : []);
      show(ranLab, st.ran > 0.9 && st.mix < 0.1);
      // the mix: first who stands, then who turns
      const m1 = seg(st.mix, 0.3, 0.6), m2 = seg(st.mix, 0.65, 1);
      let gray = 0, blue = 0;
      for (let i = 0; i < 100; i++) {
        const k = order.indexOf(i);
        const stand = standing.has(i) && m1 * 25 > k;
        const turn = turning.has(i) && m2 > 0.02 + (i % 13) / 13 * 0.9;
        if (st.mix < 0.25) { tiles.hide(i); continue; }
        tiles.set(i, tx(i), 0, tz(i), 2 + (turn ? 6 : stand ? 3 : 0));
        tiles.color(i, turn ? BLUE : stand ? 0x7d7468 : 0xece4d2);
        if (turn) blue++; else if (stand) gray++;
      }
      tiles.commit();
      mixG.visible = st.mix > 0.25;
      setText(mixLab, `of a hundred envs: ${gray} standing, ${blue} turning in place`);
      show(mixLab, st.mix > 0.35);
      api._counts = [gray, blue];
    };
    const api = {
      group,
      chips() {
        if (st.mix > 0.25) { const [g, b] = api._counts || [0, 0]; return [['standing', String(g)], ['turning', String(b)]]; }
        return st.asked > 0.5 ? [['asked', '0.05'], ['ran', st.ran > 0.5 ? '0.25' : '?']] : [];
      },
      reset() { Object.assign(st, { cards: 0, asked: 0, ran: 0, mix: 0 }); draw(); },
      steps: [
        { dur: 2.4, start() { ctx.sound('pop'); }, run(u) { st.cards = u; draw(); } },
        { dur: 2.0, start() { ctx.sound('pop'); }, run(u) { st.asked = u; draw(); } },
        { dur: 2.8, start() { ctx.sound('pop'); }, run(u) { st.ran = u; draw(); }, end() { ctx.sound('thud'); } },
        { dur: 3.6, start() { ctx.sound('swish'); }, run(u) { st.mix = u; draw(); } },
      ],
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 5. b003d and b003e: the stride
  stride(ctx) {
    const { group } = ctx;
    // What tracking pays along the way from standing to a 0.10 m/s command, under b003d's
    // width: judged at each instant, and on the 0.5 s average (b003d's close note).
    const INST = [[0.20, 0.20], [0.09, 0.17], [0.25, 0.45], [0.38, 0.64]];
    const AVG = [[0.20, 0.20], [0.21, 0.25], [0.57, 0.64], [0.81, 0.93]];
    const WHERE = ['stand', 'step in place', 'half', 'command'];
    const ch = easel(new K.Chart({ w: 310, h: 150, x: [-0.6, 3.6], y: [0, 1], title: 'tracking pay on the way to 0.10 m/s', yLabel: 'pay', px: 3 }), 18, -82, -0.48);
    ch.yTicks = [0, 0.5, 1];
    const st = { t: 0, sway: 0, inst: 0, avg: 0, res: 0 };
    ch.extra = (c, X, Y, px) => {
      const bar = (i, r, col, off, u) => {
        if (u <= 0) return;
        const x = X(i) + off * px, w = 18 * px;
        const top = Y(lerp(r[0], r[1], 1)), bot = Y(r[0]);
        c.globalAlpha = u;
        c.fillStyle = col;
        c.fillRect(x - w / 2, top - 3 * px, w, Math.max(6 * px, bot - top + 6 * px));
        c.globalAlpha = 1;
      };
      for (let i = 0; i < 4; i++) {
        bar(i, INST[i], '#d8432e', st.avg > 0 ? -11 : 0, st.inst * (1 - 0.55 * st.avg));
        bar(i, AVG[i], '#2f9a5c', 11, st.avg);
      }
      c.fillStyle = '#5c574e';
      c.font = `600 ${10 * px}px ${K.FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'top';
      WHERE.forEach((w, i) => c.fillText(w, X(i), Y(0) + 4 * px));
    };
    group.add(ch.group);
    const dipLab = ctx.label('downhill', onChart(ch, 1, 0.42, 10), { cls: 'is-small is-red', parent: ch.group });
    const upLab = ctx.label('uphill', onChart(ch, 2, 0.75, 10), { cls: 'is-small is-green', parent: ch.group });
    // in front: a walking duck, its velocity at each instant, and its velocity over 0.5 s
    const FZ = 62, DX = -136;
    const duck = new K.Duck({ scale: 0.34 });
    duck.root.position.set(DX, 0, FZ);
    group.add(duck.root);
    const mkArrow = (len, color) => { const g = new THREE.Group(); g.add(K.arrow([[0, 0, 0], [len, 0, 0]], { color, width: 4, head: 12 })); return g; };
    const aInst = mkArrow(80, RED), aAvg = mkArrow(70, GREEN);
    aInst.position.set(DX + 18, 3, FZ + 22); aAvg.position.set(DX + 18, 4, FZ + 22);
    group.add(aInst, aAvg);
    const instLab = ctx.label('each instant', V(DX + 50, 4, FZ + 58), { cls: 'is-small is-red' });
    const avgLab = ctx.label('over 0.5 s', V(DX + 50, 4, FZ + 80), { cls: 'is-small is-green' });
    // the result: two gauges, each with its line
    const resG = new THREE.Group();
    group.add(resG);
    const gb = instBars(2, { w: 28, d: 24 });
    resG.add(gb.mesh);
    const GX = [36, 150];
    const lineA = new THREE.Mesh(new THREE.BoxGeometry(46, 1.6, 30), K.flat(ORANGE)); lineA.position.set(GX[0], 0.02 * 2500, FZ); resG.add(lineA);
    const lineB = new THREE.Mesh(new THREE.BoxGeometry(46, 1.6, 30), K.flat(ORANGE)); lineB.position.set(GX[1], 0.5 * 100, FZ); resG.add(lineB);
    const r1 = ctx.label('0.10 m/s: 0.003', V(GX[0], 2, FZ + 32), { cls: 'is-small', parent: resG });
    const r2 = ctx.label('turning: 0.525', V(GX[1], 2, FZ + 32), { cls: 'is-small', parent: resG });
    const l1 = ctx.label('bar 0.02', V(GX[0], 0.02 * 2500 + 14, FZ), { cls: 'is-small is-accent', parent: resG });
    const l2 = ctx.label('line 0.5', V(GX[1], 0.5 * 100 + 14, FZ), { cls: 'is-small is-accent', parent: resG });

    const draw = () => {
      plotIf(ch, `${st.inst.toFixed(3)}|${st.avg.toFixed(3)}`, []);
      show(dipLab, st.inst > 0.8 && st.avg < 0.3);
      show(upLab, st.avg > 0.8);
      // the duck walks in place; its body sways sideways through the stride
      const phase = st.t * 1.4;
      duck.walkPose(phase, { stride: 26, lift: 11, sway: 0.09 });
      const lat = Math.sin(phase * Math.PI * 2) * 0.13, fwd = 0.1;
      pop(aInst, st.sway * (1 - 0.6 * st.avg));
      aInst.rotation.y = Math.atan2(lat, fwd) * ease.out(st.sway);
      aInst.scale.x = Math.max(0.001, Math.hypot(lat, fwd) / 0.16 * ease.out(st.sway));
      pop(aAvg, st.avg);
      show(instLab, st.sway > 0.6 && st.avg < 0.05);
      show(avgLab, st.avg > 0.7);
      // the result
      pop(resG, st.res);
      gb.set(0, GX[0], 0, FZ, Math.max(0.8, 0.003 * 2500 * ease.out(st.res)));
      gb.set(1, GX[1], 0, FZ, Math.max(0.8, 0.525 * 100 * ease.out(st.res)));
      gb.color(0, RED); gb.color(1, GREEN);
      gb.commit();
      [r1, r2, l1, l2].forEach((l) => show(l, st.res > 0.7));
    };
    const api = {
      group,
      reset() { Object.assign(st, { sway: 0, inst: 0, avg: 0, res: 0 }); draw(); },
      idle(t, dt) { st.t += dt; draw(); },
      steps: [
        { dur: 2.6, start() { ctx.sound('pop'); }, run(u) { st.sway = u; draw(); } },
        { dur: 2.6, run(u) { st.inst = u; draw(); }, end() { ctx.sound('thud'); } },
        { dur: 2.8, start() { ctx.sound('swish'); }, run(u) { st.avg = u; draw(); }, end() { ctx.sound('ding'); } },
        { dur: 2.4, start() { ctx.sound('pop'); }, run(u) { st.res = u; draw(); } },
      ],
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 6. b002 and b003f: the teacher
  anchor(ctx) {
    const { group } = ctx;
    const TX = -112, TZ = -60, SX = 70, SZ = 4;
    const teacher = new K.Duck({ scale: 0.46, body: 0x8d97a6 });
    const tG = new THREE.Group();
    tG.position.set(TX, 0, TZ);
    teacher.root.rotation.y = -0.35;
    tG.add(teacher.root);
    group.add(tG);
    const student = new K.Duck({ scale: 0.3 });
    const sG = new THREE.Group();
    sG.position.set(SX, 0, SZ);
    student.root.rotation.y = Math.PI * 0.9;
    sG.add(student.root);
    group.add(sG);
    const tLab = ctx.label('teacher, 197,774', V(TX, 116, TZ), { cls: 'is-small' });
    const sLab = ctx.label('student, 26,254', V(SX, 84, SZ), { cls: 'is-small' });
    // labels flowing from teacher to student while the student drives
    const flow = new THREE.QuadraticBezierCurve3(V(TX, 92, TZ), V((TX + SX) / 2, 150, (TZ + SZ) / 2), V(SX, 62, SZ));
    const dots = Array.from({ length: 6 }, () => { const d = K.packet(ORANGE, 5); d.visible = false; group.add(d); return d; });
    // the rope: a straight paper cord from teacher to student, its thickness the pull
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8), K.paper(0x8a6d4a));
    group.add(cord);
    const stateLab = ctx.label('', V(SX - 10, 4, SZ + 52), { cls: 'is-small is-accent' });
    // the gauge: turning on the spot, rad/s, from 0 to 1.0
    const GZ = 98, G0 = -60, G1 = 190;
    const gx = (w) => lerp(G0, G1, w / 1.0);
    const gauge = new THREE.Group();
    const rail = K.box(G1 - G0 + 12, 4, 10, 0xe9dfcb);
    rail.position.set((G0 + G1) / 2, 2, GZ);
    gauge.add(rail);
    const mark = (w, col, h = 16) => { const m = K.box(4, h, 12, col); m.position.set(gx(w), h / 2, GZ); gauge.add(m); return m; };
    mark(0.312, 0x8d97a6);
    mark(0.456, BLUE);
    const now = K.ball(8, GREEN);
    now.position.set(gx(0.456), 10, GZ);
    gauge.add(now);
    group.add(gauge);
    const gLabs = [
      ctx.label('teacher 0.312', V(gx(0.312), 30, GZ - 16), { cls: 'is-small' }),
      ctx.label('b003b 0.456', V(gx(0.456), 2, GZ + 24), { cls: 'is-small is-blue' }),
      ctx.label('b003f 0.806', V(gx(0.806), 30, GZ - 16), { cls: 'is-small is-green' }),
      ctx.label('turning on the spot, rad/s', V(gx(0.5), 2, GZ + 48), { cls: 'is-small' }),
    ];

    const st = { t: 0, distil: 0, anchor: 0, cut: 0, turn: 0, spin: 0 };
    const draw = () => {
      pop(tG, Math.min(1, st.distil * 3));
      pop(sG, Math.min(1, st.distil * 3));
      show(tLab, st.distil > 0.3); show(sLab, st.distil > 0.3);
      teacher.walkPose(st.t * 1.2, { stride: 22, lift: 10 });
      dots.forEach((d, i) => {
        const u = ((st.t * 0.5 + i / dots.length) % 1);
        d.visible = st.distil > 0.2 && st.anchor < 0.05;
        if (d.visible) { d.position.copy(flow.getPoint(u)); d.scale.setScalar(Math.max(0.001, Math.sin(Math.PI * u))); }
      });
      // the student, through the three kinds of frame, falling and getting up smoothly
      let mode = 'dead band', down = 0;
      if (st.anchor > 0) {
        const c = (st.t * 0.32) % 3;
        mode = c < 1 ? 'fallen' : c < 2 ? 'upright' : 'dead band';
        if (c < 1) down = ease.inOut(clamp(c / 0.25)) * (1 - ease.inOut(seg(c, 0.75, 1)));
      }
      down *= 1 - ease.inOut(clamp(st.turn * 2));
      student.fall(down, 'forward');
      student.root.rotation.y = Math.PI * 0.9 + st.spin;
      if (st.turn > 0) student.walkPose(st.t * 1.8, { stride: 0, lift: 9 });
      else if (mode === 'upright') student.walkPose(st.t * 1.7, { stride: 30, lift: 13 });
      else if (mode === 'dead band') student.walkPose(st.t * 0.7, { stride: 8, lift: 5 });
      else student.setJoints(student.stand);
      const pull = st.anchor <= 0 || st.turn > 0.5 ? 0 : mode === 'fallen' ? 1.0 : mode === 'upright' ? 0.2 * (1 - ease.inOut(st.cut)) : 0;
      const a = V(TX + 18, 46, TZ + 6);
      const b = V(SX, 40, SZ).lerp(V(SX - 22, 14, SZ), down);
      cord.visible = pull > 0.01;
      if (cord.visible) {
        cord.position.copy(a).lerp(b, 0.5);
        cord.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
        cord.scale.set(0.6 + 3.2 * pull, a.distanceTo(b), 0.6 + 3.2 * pull);
      }
      const names = { fallen: 'fallen: pulled at 1.0', upright: st.cut > 0.5 ? 'upright, walking fast: free' : 'upright, walking fast: pulled at 0.2', 'dead band': 'in the dead band: free' };
      setText(stateLab, names[mode]);
      show(stateLab, st.anchor > 0.3 && st.turn < 0.5);
      // the gauge
      pop(gauge, st.turn);
      now.position.x = gx(lerp(0.456, 0.806, ease.inOut(seg(st.turn, 0.3, 1))));
      gLabs.forEach((l, i) => show(l, i === 2 ? st.turn > 0.95 : st.turn > 0.5));
    };
    const api = {
      group,
      chips() {
        return [['fallen', '1.0'], ['upright', st.cut > 0.5 ? '0' : '0.2'], ['dead band', '0']];
      },
      reset() { Object.assign(st, { distil: 0, anchor: 0, cut: 0, turn: 0, spin: 0 }); draw(); },
      idle(t, dt) { st.t += dt; if (st.turn > 0) st.spin += dt * lerp(0.456, 0.806, ease.inOut(st.turn)) * 2.2; draw(); },
      steps: [
        { dur: 2.6, start() { ctx.sound('pop'); }, run(u) { st.distil = u; draw(); } },
        { dur: 3.4, run(u) { st.anchor = u; draw(); } },
        { dur: 2.0, run(u) { st.cut = u; draw(); }, end() { ctx.say('snip', V(-20, 90, -30), { cls: 'is-red', sound: 'tick' }); } },
        { dur: 3.0, start() { ctx.sound('swish'); }, run(u) { st.turn = u; draw(); }, end() { ctx.sound('ding'); } },
      ],
    };
    api.reset();
    return api;
  },
  // ------------------------------------------------------------ 7. b003g: the scorecard
  scorecard(ctx) {
    const { group } = ctx;
    const ROWS = [
      ['slow walk at 0.10', true], ['slow walk at 0.05', true], ['turn on the spot', true], ['falls', true],
      ['getting up', true], ['planar error', false], ['walk at 0.30', true], ['mechanism bar', true],
    ];
    const NEW = ['straight walk: yaw at most 0.05', 'stand: drift at most 0.05'];
    const CW = 196, CH = 208, PX = 3;
    const st = { t: 0, card: 0, circle: 0, stand: 0, more: 0 };
    const face = K.canvasTexture(CW * PX, CH * PX, () => {});
    const paint = () => face.redraw((c, w, h) => {
      c.fillStyle = '#fffaf0'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#2b2620'; c.lineWidth = 3 * PX; c.strokeRect(1.5 * PX, 1.5 * PX, w - 3 * PX, h - 3 * PX);
      c.fillStyle = '#2b2620'; c.font = `700 ${13 * PX}px ${K.ROUND}`; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText('b003g, its lines', 12 * PX, 15 * PX);
      const shown = st.card * ROWS.length;
      const rowH = 17 * PX;
      ROWS.forEach(([name, ok], i) => {
        const y = (34 + i * 17) * PX;
        c.font = `500 ${11 * PX}px ${K.FONT}`;
        c.fillStyle = '#2b2620';
        c.fillText(name, 30 * PX, y);
        if (shown > i + 0.5) {
          c.fillStyle = ok ? '#2f9a5c' : '#d8432e';
          c.beginPath(); c.arc(17 * PX, y, 6 * PX, 0, Math.PI * 2); c.fill();
        } else {
          c.strokeStyle = '#b9b0a0'; c.lineWidth = 1.5 * PX;
          c.beginPath(); c.arc(17 * PX, y, 6 * PX, 0, Math.PI * 2); c.stroke();
        }
      });
      NEW.forEach((name, i) => {
        if (st.more <= i * 0.5) return;
        const y = (34 + (ROWS.length + i) * 17 + 4) * PX;
        c.globalAlpha = clamp((st.more - i * 0.5) * 2);
        c.fillStyle = '#fff1d6'; c.fillRect(8 * PX, y - rowH / 2, w - 16 * PX, rowH);
        c.fillStyle = '#2b2620'; c.font = `600 ${11 * PX}px ${K.FONT}`;
        c.fillText(name, 30 * PX, y);
        c.strokeStyle = '#ff9500'; c.lineWidth = 2 * PX;
        c.beginPath(); c.arc(17 * PX, y, 6 * PX, 0, Math.PI * 2); c.stroke();
        c.globalAlpha = 1;
      });
    });
    const card = new THREE.Mesh(new THREE.BoxGeometry(CW, CH, 3), [
      K.paper(K.COL.paper), K.paper(K.COL.paper), K.paper(K.COL.paper), K.paper(K.COL.paper),
      new THREE.MeshToonMaterial({ map: face.tex }), K.paper(K.COL.paper),
    ]);
    card.position.y = CH / 2;
    card.castShadow = true;
    const cardG = new THREE.Group();
    cardG.add(card);
    cardG.position.set(-100, 0, -4);
    cardG.rotation.x = -1.0;
    group.add(cardG);
    const scoreLab = ctx.label('', V(-100, 4, 24), { cls: 'is-small is-accent' });
    // the walk, seen from above: asked to go straight, it curves clockwise
    const CX = 98, CZ = 40, RAD = 56;
    const circleG = new THREE.Group();
    const ringPath = pathLine(Array.from({ length: 49 }, (_, i) => { const a = (i / 48) * Math.PI * 2; return [CX + RAD * Math.cos(a), CZ + RAD * Math.sin(a)]; }), 0xc9a26a, 2.4);
    circleG.add(ringPath);
    const start = [CX, CZ - RAD];
    const want = K.arrow([[start[0], 2, start[1]], [start[0] + 84, 2, start[1]]], { color: K.COL.blue, width: 3, head: 12 });
    circleG.add(want);
    group.add(circleG);
    const duckG = new THREE.Group();
    const duck = new K.Duck({ scale: 0.24 });
    duckG.add(duck.root);
    group.add(duckG);
    const wantLab = ctx.label('asked: straight ahead', V(start[0] + 30, 4, start[1] - 22), { cls: 'is-small is-blue' });
    const circLab = ctx.label('clockwise, 0.27 m radius', V(CX, 4, CZ + RAD + 24), { cls: 'is-small is-red' });
    const standLab = ctx.label('told to stand: drifts 0.106 m/s', V(CX - 10, 4, CZ + RAD + 24), { cls: 'is-small is-red' });

    const draw = () => {
      paint();
      const shown = Math.min(ROWS.length, Math.floor(st.card * ROWS.length + 0.5));
      const passed = ROWS.slice(0, shown).filter((r) => r[1]).length;
      setText(scoreLab, st.more > 0.5 ? 'ten lines next time' : `${passed} of ${shown} pass`);
      show(scoreLab, st.card > 0.1);
      pop(circleG, st.circle);
      pop(duckG, Math.max(st.circle, st.stand));
      // circling clockwise while walking, then stepping and drifting when told to stand
      // told to stand, it drifts from wherever its circle had got to
      let x, z, head;
      if (st.stand < 0.5) {
        const a = -Math.PI / 2 + st.t * 0.55;
        x = CX + RAD * Math.cos(a); z = CZ + RAD * Math.sin(a);
        head = -(a + Math.PI / 2);
        duck.walkPose(st.t * 1.6, { stride: 20, lift: 10 });
        Object.assign(st, { ax: x, az: z, ah: head, ts: st.t });
      } else {
        const d = (st.t - st.ts) * 0.25;
        x = st.ax + 18 * Math.sin(d); z = st.az + 10 * Math.sin(d * 1.7);
        head = st.ah - (st.t - st.ts) * 0.4;
        duck.walkPose(st.t * 1.6, { stride: 4, lift: 9 });
      }
      duckG.position.set(x, 0, z);
      duck.root.rotation.y = head;
      ringPath.visible = st.stand < 0.5;
      want.visible = st.stand < 0.5;
      show(wantLab, st.circle > 0.6 && st.stand < 0.5);
      show(circLab, st.circle > 0.8 && st.stand < 0.5);
      show(standLab, st.stand > 0.6 && st.more < 0.5);
    };
    const api = {
      group,
      reset() { Object.assign(st, { card: 0, circle: 0, stand: 0, more: 0, ax: CX, az: CZ - RAD, ah: 0, ts: st.t }); draw(); },
      idle(t, dt) { st.t += dt; draw(); },
      steps: [
        { dur: 3.2, start() { ctx.sound('pop'); }, run(u) { st.card = u; draw(); }, end() { ctx.sound('ding'); } },
        { dur: 2.4, start() { ctx.sound('pop'); }, run(u) { st.circle = u; draw(); } },
        { dur: 2.0, run(u) { st.stand = u; draw(); }, end() { ctx.sound('thud'); } },
        { dur: 2.2, start() { ctx.sound('pop'); }, run(u) { st.more = u; draw(); }, end() { ctx.sound('tick'); } },
      ],
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 8. k001: the kick
  aim(ctx) {
    const { group } = ctx;
    // the pitch from above: the kick line runs left to right, 64 units to the metre
    const M = 64, BX = -150, BZ = 30, L = 5.064 * M;
    const pitch = strip(392, 150, 0xcfe3bd);
    pitch.position.set(8, 0.6, BZ + 6);
    group.add(pitch);
    const lineG = pathLine([[BX, BZ], [BX + L + 20, BZ]], 0xffffff, 2);
    group.add(lineG);
    const duck = new K.Duck({ scale: 0.26 });
    duck.root.position.set(BX - 26, 0, BZ - 6);
    group.add(duck.root);
    const ball = K.ball(7, 0xffffff);
    group.add(ball);
    const end = (deg) => { const a = (deg * Math.PI) / 180; return [BX + L * Math.cos(a), BZ + L * Math.sin(a)]; };
    const mk = (deg, color) => pathLine([[BX, BZ], end(deg)], color, 2.6);
    const pPollen = mk(8.0, ORANGE), pK = mk(3.4, BLUE), pPollenB = mk(8.6, 0xffc070), pKB = mk(3.8, 0x8fb2ef);
    group.add(pPollen, pK, pPollenB, pKB);
    const labP = ctx.label('Pollen: 8.0°, 5.064 m', V(end(8.0)[0] - 40, 4, end(8.0)[1] + 22), { cls: 'is-small is-accent' });
    const labK = ctx.label('k001: 3.4°, 0.999 of the distance', V(96, 4, BZ - 4), { cls: 'is-small is-blue' });
    const labB = ctx.label('backlash twin: 8.6° and 3.8°', V(BX + 150, 4, BZ + 92), { cls: 'is-small' });
    const labLine = ctx.label('kick line', V(BX + 40, 4, BZ - 14), { cls: 'is-small' });
    // the split: the ball's speed along the line pays, across it costs
    const SPX = -128;
    const along = new THREE.Group(), across = new THREE.Group();
    along.add(K.arrow([[0, 0, 0], [60, 0, 0]], { color: GREEN, width: 5, head: 14 }));
    across.add(K.arrow([[0, 0, 0], [0, 0, 26]], { color: RED, width: 5, head: 12 }));
    along.position.set(SPX, 6, BZ + 66); across.position.set(SPX + 60, 6, BZ + 66);
    group.add(along, across);
    const labAlong = ctx.label('along: pays 12.0', V(SPX + 26, 4, BZ + 46), { cls: 'is-small is-green' });
    const labAcross = ctx.label('across: costs 12.0', V(SPX + 120, 4, BZ + 84), { cls: 'is-small is-red' });

    const st = { t: 0, theta: 8.0, pollen: 0, split: 0, k: 0, back: 0 };
    const draw = () => {
      // Pollen's roll; then the ball shrinks away at its end and grows again on the spot for k001's
      const onPath = (deg, u) => { const a = (deg * Math.PI) / 180, e = ease.out(clamp(u * 1.2)); return [BX + L * e * Math.cos(a), BZ + L * e * Math.sin(a)]; };
      let bp, bs = 1, roll = st.pollen;
      if (st.back > 0 || st.k >= 1) { bp = end(3.4); roll = 0; }
      else if (st.k > 0 && st.k < 0.08) { bp = end(8.0); bs = 1 - st.k / 0.08; roll = 0; }
      else if (st.k >= 0.08) { roll = (st.k - 0.08) / 0.92; bp = onPath(3.4, roll); bs = clamp((st.k - 0.08) / 0.06); }
      else bp = onPath(8.0, st.pollen);
      ball.position.set(bp[0], 7, bp[1]);
      ball.scale.setScalar(Math.max(0.001, bs));
      const kick = clamp(roll * 6);
      const ap = duck.stand.slice();
      ap[11] = duck.stand[11] + Math.sin(kick * Math.PI) * 0.9;
      duck.setJoints(ap);
      const grow = (p, u2) => { p.visible = u2 > 0.01; p.scale.set(1, 1, 1); };
      grow(pPollen, st.pollen); grow(pK, st.k);
      pPollenB.visible = pKB.visible = st.back > 0.3;
      show(labP, st.pollen > 0.8);
      show(labK, st.k > 0.8);
      show(labB, st.back > 0.6);
      show(labLine, st.pollen > 0.3);
      // the split follows the slider's angle
      const th = (st.theta * Math.PI) / 180;
      const sp = st.split * (1 - ease.inOut(st.back));
      pop(along, sp * Math.max(0.05, Math.cos(th)));
      across.visible = sp > 0.01;
      across.scale.set(1, 1, Math.max(0.02, Math.sin(th) / Math.sin((8 * Math.PI) / 180)) * sp);
      show(labAlong, st.split > 0.6 && st.k < 0.5);
      show(labAcross, st.split > 0.6 && st.k < 0.5);
    };
    const api = {
      group,
      slider: {
        label: 'θ', min: 0, max: 15, step: 0.1, value: 8.0, format: (v) => `${v.toFixed(1)}°`,
        input(v) { st.theta = v; if (st.split < 1) st.split = 1; draw(); },
        get: () => Math.round(st.theta * 10) / 10,
      },
      chips() {
        const th = (st.theta * Math.PI) / 180;
        return [['θ', `${st.theta.toFixed(1)}°`], ['along', `+${(12 * Math.cos(th)).toFixed(2)}`], ['across', `−${(12 * Math.sin(th)).toFixed(2)}`]];
      },
      reset() { Object.assign(st, { theta: api.slider.value, pollen: 0, split: 0, k: 0, back: 0 }); draw(); },
      idle(t, dt) { st.t += dt; draw(); },
      steps: [
        { dur: 2.8, start() { ctx.sound('swish'); }, run(u) { st.pollen = u; draw(); } },
        { dur: 2.2, start() { ctx.sound('pop'); }, run(u) { st.split = u; draw(); } },
        { dur: 2.8, start() { ctx.sound('swish'); }, run(u) { st.k = u; draw(); }, end() { ctx.sound('ding'); } },
        { dur: 2.0, start() { ctx.sound('pop'); }, run(u) { st.back = u; draw(); } },
      ],
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 9. the bus
  bus(ctx) {
    const { group } = ctx;
    // Pollen's open Robot HAT at the back, its four Qwiic sockets along the front edge
    const BXo = -10, BZo = -132;
    const board = new THREE.Group();
    const pcb = K.box(256, 6, 84, 0x2f6b4f);
    pcb.position.set(0, 3, 0);
    board.add(pcb);
    const SOCK = [-105, -45, 15, 75];
    SOCK.forEach((x) => { const sk = K.box(26, 10, 12, 0xf3ead6); sk.position.set(x, 11, 36); board.add(sk); });
    board.position.set(BXo, 0, BZo);
    group.add(board);
    const sock = (i) => V(SOCK[i] + BXo, 8, BZo + 42);
    const sockLabs = ['J5', 'J6', 'J7', 'J8'].map((n, i) => ctx.label(n, V(SOCK[i] + BXo, 4, BZo + 62), { cls: 'is-small' }));
    const hatLab = ctx.label('Robot HAT', V(BXo, 12, BZo - 16), { cls: 'is-small is-green' });
    // the main bus: J5 shares it with the IMU and the codec, and the depth sensor plugs into it
    const imu = K.chip(0x3c3c44, { w: 30, d: 30, h: 8 }); imu.position.set(-168, 0, -36); group.add(imu);
    const codec = K.chip(0x3c3c44, { w: 30, d: 30, h: 8 }); codec.position.set(-104, 0, -6); group.add(codec);
    const tof = new THREE.Group();
    const tofBox = K.box(32, 12, 22, 0x7044c2); tofBox.position.y = 6; tof.add(tofBox);
    const lens = K.cylinder(5, 5, 4, 0x1d1d1f); lens.rotation.x = Math.PI / 2; lens.position.set(0, 7, 12); tof.add(lens);
    tof.position.set(-30, 0, -16);
    group.add(tof);
    const j5 = sock(0);
    const routes = [[[j5.x, j5.z], [-160, -66], [-168, -52]], [[j5.x, j5.z], [-104, -46], [-104, -22]], [[j5.x, j5.z], [-64, -46], [-34, -30]]];
    const wires = new THREE.Group();
    routes.forEach((r) => wires.add(pathLine(r, 0x1d1d1f, 3)));
    group.add(wires);
    const busLabs = [
      ctx.label('IMU', V(-168, 4, -8), { cls: 'is-small' }),
      ctx.label('codec 0x18', V(-104, 4, 24), { cls: 'is-small' }),
      ctx.label('depth sensor 0x29', V(-30, 4, 14), { cls: 'is-small' }),
    ];
    const pk = Array.from({ length: 6 }, () => { const d = K.packet(ORANGE, 4); d.visible = false; group.add(d); return d; });
    const pkCurves = routes.map((r) => new THREE.CatmullRomCurve3(r.map((q) => V(q[0], 8, q[1]))));
    // a new sensor in a spare socket
    const j7 = sock(2);
    const newG = new THREE.Group();
    const nb = K.box(36, 4, 26, 0x2a64c9); nb.position.set(108, 2, -20); newG.add(nb);
    const nchip = K.box(10, 4, 10, 0x1d1d1f); nchip.position.set(108, 6, -20); newG.add(nchip);
    newG.add(pathLine([[j7.x, j7.z], [60, -56], [92, -28]], 0x2a64c9, 3));
    group.add(newG);
    const newLab = ctx.label('new sensor, its own address', V(108, 4, 12), { cls: 'is-small is-blue' });
    // the two ways into behaviour
    const ways = new THREE.Group();
    const cmd = K.sign('as a command:\na program steers the walk', { w: 176, h: 52, size: 12, bg: '#e3f2e7' });
    cmd.position.set(-92, 0, 108); cmd.rotation.x = -0.8;
    const obs = K.sign('as an observation:\na network learns to read it', { w: 176, h: 52, size: 12, bg: '#e2ebfa' });
    obs.position.set(102, 0, 108); obs.rotation.x = -0.8;
    ways.add(cmd, obs);
    ways.add(K.arrow([[94, 2, -6], [20, 2, 50], [-40, 2, 84]], { color: GREEN, width: 4, head: 12 }));
    ways.add(K.arrow([[108, 2, -4], [104, 2, 80]], { color: K.COL.blue, width: 4, head: 12 }));
    group.add(ways);
    const wayLabs = [];

    const st = { t: 0, board: 0, bus: 0, add: 0, ways: 0 };
    const draw = () => {
      pop(board, st.board);
      sockLabs.forEach((l) => show(l, st.board > 0.7));
      show(hatLab, st.board > 0.7);
      [imu, codec, tof].forEach((o) => pop(o, st.bus));
      wires.visible = st.bus > 0.2;
      busLabs.forEach((l) => show(l, st.bus > 0.7 && st.ways < 0.3));
      pk.forEach((d, i) => {
        const u = (st.t * 0.6 + i / pk.length) % 1;
        d.visible = st.bus > 0.6;
        if (d.visible) { d.position.copy(pkCurves[i % 3].getPoint(u)); d.scale.setScalar(Math.max(0.001, Math.sin(Math.PI * u))); }
      });
      pop(newG, st.add);
      show(newLab, st.add > 0.7 && st.ways < 0.3);
      pop(ways, st.ways);
      wayLabs.forEach((l) => show(l, st.ways > 0.7));
    };
    const api = {
      group,
      chips() { return st.bus > 0.5 ? [['bus', '400 kHz'], ['codec', '0x18'], ['depth sensor', '0x29']] : []; },
      reset() { Object.assign(st, { board: 0, bus: 0, add: 0, ways: 0 }); draw(); },
      idle(t, dt) { st.t += dt; draw(); },
      steps: [
        { dur: 2.0, start() { ctx.sound('pop'); }, run(u) { st.board = u; draw(); } },
        { dur: 2.6, start() { ctx.sound('pop'); }, run(u) { st.bus = u; draw(); } },
        { dur: 2.2, start() { ctx.sound('pop'); }, run(u) { st.add = u; draw(); }, end() { ctx.sound('tick'); } },
        { dur: 2.4, start() { ctx.sound('pop'); }, run(u) { st.ways = u; draw(); }, end() { ctx.sound('ding'); } },
      ],
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 10. the contract
  contract(ctx) {
    const { group } = ctx;
    // the network and its pins: 61 in at the back, 14 out in front
    const NZ = -58;
    const net = K.box(150, 34, 48, 0x3c3c44);
    net.position.set(12, 17, NZ);
    group.add(net);
    const netLab = ctx.label('policy.onnx', V(0, 44, NZ), { cls: 'is-small' });
    const pinsIn = instBars(61, { w: 3.2, d: 6 });
    const pinsOut = instBars(14, { w: 6, d: 6 });
    group.add(pinsIn.mesh, pinsOut.mesh);
    const inX = (i) => -96 + i * 4.4, outX = (i) => -40 + i * 8;
    const IZ = -100, OZ = -14;
    const inLab = ctx.label('61 in', V(-124, 4, IZ), { cls: 'is-small is-blue' });
    const outLab = ctx.label('14 out', V(-72, 4, OZ), { cls: 'is-small is-green' });
    const hzLab = ctx.label('50 times a second', V(118, 4, OZ), { cls: 'is-small' });
    const swapLab = ctx.label('two inputs swapped', V(-8, 40, IZ - 6), { cls: 'is-small is-red' });
    const flow = Array.from({ length: 8 }, () => { const d = K.packet(K.COL.blue, 3.5); d.visible = false; group.add(d); return d; });
    // three workshops that can each make the file
    const shops = new THREE.Group();
    const names = ['mjlab', 'MuJoCo Playground', 'Isaac Lab'];
    const SX = [-84, 22, 128], SZ = -150;
    SX.forEach((x) => {
      const hut = K.box(46, 24, 30, 0xe7c47f); hut.position.set(x, 12, SZ); shops.add(hut);
      const roof = K.cone(32, 20, 0xd8432e, { seg: 4 }); roof.rotation.y = Math.PI / 4; roof.position.set(x, 34, SZ); shops.add(roof);
    });
    group.add(shops);
    const shopLabs = names.map((n, i) => ctx.label(n, V(SX[i], 52, SZ), { cls: 'is-small' }));
    const plugs = SX.map(() => { const p = K.box(18, 8, 12, 0x3c3c44); group.add(p); return p; });
    // the check: the same recorded inputs through a reference and the port
    const BZ = 44;
    const bench = new THREE.Group();
    const ref = K.box(64, 18, 28, 0x8d97a6); ref.position.set(-70, 9, BZ); bench.add(ref);
    const port = K.box(64, 18, 28, 0x3c3c44); port.position.set(70, 9, BZ); bench.add(port);
    const lamp = K.ball(10, GREEN); lamp.position.set(0, 12, BZ); bench.add(lamp);
    group.add(bench);
    const benchLabs = [
      ctx.label('reference', V(-70, 30, BZ), { cls: 'is-small' }),
      ctx.label('port', V(70, 30, BZ), { cls: 'is-small' }),
    ];
    const verdict = ctx.label('', V(0, 4, BZ + 30), { cls: 'is-small' });
    const benchDots = Array.from({ length: 6 }, () => { const d = K.packet(K.COL.blue, 3.5); d.visible = false; group.add(d); return d; });
    const SW = [17, 18];

    const st = { t: 0, plug: 0, shops: 0, swap: 0, check: 0 };
    const draw = () => {
      const p = ease.out(st.plug);
      net.scale.setScalar(Math.max(0.001, ease.back(st.plug)));
      show(netLab, st.plug > 0.6);
      const sw = ease.inOut(st.swap);
      for (let i = 0; i < 61; i++) {
        let x = inX(i);
        if (i === SW[0]) x = lerp(inX(SW[0]), inX(SW[1]), sw);
        if (i === SW[1]) x = lerp(inX(SW[1]), inX(SW[0]), sw);
        const hot = (i === SW[0] || i === SW[1]) && st.swap > 0;
        const lift = hot ? 14 * Math.sin(sw * Math.PI) : 0;
        if (p < 0.01) pinsIn.hide(i); else pinsIn.set(i, x, lift, IZ, (hot ? 22 : 14) * p, hot ? 4.4 : 3.2, 6);
        pinsIn.color(i, (i === SW[0] || i === SW[1]) && st.swap > 0 ? RED : K.COL.blue);
      }
      for (let i = 0; i < 14; i++) { if (p < 0.01) pinsOut.hide(i); else pinsOut.set(i, outX(i), 0, OZ, 14 * p); pinsOut.color(i, GREEN); }
      pinsIn.commit(); pinsOut.commit();
      [inLab, outLab, hzLab].forEach((l) => show(l, st.plug > 0.7));
      show(swapLab, st.swap > 0.6 && st.check < 0.6);
      flow.forEach((d, i) => {
        const u = (st.t * 0.7 + i / flow.length) % 1;
        d.visible = st.plug > 0.8 && st.check < 0.1;
        if (d.visible) { const x = inX((i * 8) % 61); d.position.set(lerp(x, outX(i % 14), u), 18, lerp(IZ, OZ, u)); d.scale.setScalar(Math.max(0.001, Math.sin(Math.PI * u))); }
      });
      // the workshops, each sending a plug down to the network
      pop(shops, st.shops);
      shopLabs.forEach((l) => show(l, st.shops > 0.6 && st.check < 0.5));
      plugs.forEach((pl, i) => {
        const u = clamp(st.shops * 1.6 - 0.3 - i * 0.15);
        pl.visible = u > 0 && u < 1;
        pl.position.set(lerp(SX[i], 0, ease.inOut(u)), 30 + 10 * Math.sin(u * Math.PI), lerp(SZ + 20, NZ, ease.inOut(u)));
      });
      // the check: inputs into both; a match while nothing is swapped, a difference once it is
      pop(bench, st.check);
      benchLabs.forEach((l) => show(l, st.check > 0.6));
      const bad = st.swap > 0.5 && st.check > 0.55;
      lamp.material = K.paper(bad ? RED : GREEN);
      setText(verdict, bad ? 'the swapped port: outputs differ' : 'a faithful port: difference 0');
      show(verdict, st.check > 0.3);
      benchDots.forEach((d, i) => {
        const u = (st.t * 0.8 + i / benchDots.length) % 1;
        d.visible = st.check > 0.2;
        if (d.visible) { d.position.set(lerp(0, i % 2 ? 70 : -70, u), 24, BZ - 30 + 26 * u); d.scale.setScalar(Math.max(0.001, Math.sin(Math.PI * u))); }
      });
    };
    const api = {
      group,
      reset() { Object.assign(st, { plug: 0, shops: 0, swap: 0, check: 0 }); draw(); },
      idle(t, dt) { st.t += dt; draw(); },
      steps: [
        { dur: 2.2, start() { ctx.sound('pop'); }, run(u) { st.plug = u; draw(); } },
        { dur: 2.8, start() { ctx.sound('pop'); }, run(u) { st.shops = u; draw(); } },
        { dur: 2.2, run(u) { st.swap = u; draw(); }, end() { ctx.sound('thud'); } },
        { dur: 3.4, start() { ctx.sound('pop'); }, run(u) { st.check = u; draw(); }, end() { ctx.sound('ding'); } },
      ],
    };
    api.reset();
    return api;
  },
};
