// Book 2, How a Microduck Learns: the pop-up on each right-hand page.
//
// Where a figure prints a real number it is one the page states and the notes
// source. Where it moves bars or draws a curve for the lesson, the page says so.

import * as K from './kit.js';

const { THREE } = K;
const { ease, seg, lerp, clamp } = K;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const show = (label, on) => label.userData.el.classList.toggle('is-hidden', !on);

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
    // a steady flow, for loops that keep going
    flow(curves, t, speed = 0.8) {
      dots.forEach((d, i) => {
        const c = curves[i % curves.length];
        const k = (t * speed + i / dots.length) % 1;
        // a dot leaves at the end and a fresh one starts at the beginning
        d.visible = k > 0.03 && k < 0.97;
        d.position.copy(c.getPoint(k));
      });
    },
    hide() { dots.forEach((d) => (d.visible = false)); },
  };
}
const arc = (a, b, lift = 60) => { const m = a.clone().lerp(b, 0.5); m.y += lift; return new THREE.QuadraticBezierCurve3(a.clone(), m, b.clone()); };
const poof = (obj, base, r) => obj.scale.setScalar(base * Math.max(0.01, r < 0.5 ? 1 - r * 2 : (r - 0.5) * 2));

// group colours for the 61 numbers, in their real order
const OBS = [
  { n: 3, name: 'turning', color: 0xff9500 },
  { n: 3, name: 'down', color: 0xd8432e },
  { n: 14, name: 'joint angles', color: 0x2a64c9 },
  { n: 14, name: 'joint speeds', color: 0x0b777a },
  { n: 14, name: 'last actions', color: 0x7044c2 },
  { n: 3, name: 'walk and turn', color: 0x1b6e3e },
  { n: 4, name: 'head', color: 0xc99a10 },
  { n: 6, name: 'body', color: 0x8a8478 },
];
const obsColors = () => OBS.flatMap((g) => new Array(g.n).fill(g.color));

export const figures = {

  // ------------------------------------------------------------ title page
  cover(ctx) {
    const { group } = ctx;
    const duck = new K.Duck({ scale: 0.95 });
    duck.root.position.set(-60, 0, 70); duck.root.rotation.y = -0.6;
    group.add(duck.root);
    const chart = new K.Chart({ w: 190, h: 130, x: [0, 10], y: [0, 1], title: 'practice', xLabel: '', yLabel: '' });
    chart.plot([{ points: Array.from({ length: 11 }, (_, i) => [i, 1 / (1 + Math.exp(-(i - 4.5)))]), color: '#2a64c9' }]);
    chart.group.position.set(110, 0, -120); chart.group.rotation.y = -0.25;
    group.add(chart.group);
    const chip = K.chip(K.COL.green, { w: 64, d: 64, h: 12 });
    chip.position.set(120, 0, 90);
    group.add(chip);
    return {
      group, steps: [],
      reset() { duck.setJoints(duck.stand); },
      idle(t) { duck.walkPose(t * 0.9, { stride: 0, lift: 8 }); chip.rotation.y = Math.sin(t * 0.6) * 0.3; },
    };
  },

  // ------------------------------------------------------------ 1. the loop
  rlloop(ctx) {
    const { group } = ctx;
    const S = 0.74;
    const duck = new K.Duck({ scale: S });
    const home = V(-140, 0, 150);
    duck.root.position.copy(home); duck.root.rotation.y = -0.35;
    group.add(duck.root);
    const brain = K.chip(K.COL.green, { w: 88, d: 70, h: 16 });
    const stand = K.cylinder(18, 26, 80, 0xd9cdb4);
    stand.position.y = 40;
    const brainG = new THREE.Group(); brainG.add(stand, brain); brain.position.y = 82;
    brainG.position.set(140, 0, 130);
    group.add(brainG);
    ctx.label('brain', V(140, 132, 130), { cls: 'is-green' });
    ctx.label('world', V(-140, 210, 150), { cls: 'is-blue' });
    const top = arc(V(-110, 150, 135), V(115, 108, 120), 80);
    const bottom = arc(V(115, 62, 150), V(-100, 28, 185), 14);
    const tubes = new THREE.Group();
    tubes.add(K.arrow(top.getPoints(20), { color: 0xc99a10, width: 5, head: 16 }));
    tubes.add(K.arrow(bottom.getPoints(20), { color: K.COL.green, width: 5, head: 16 }));
    group.add(tubes);
    const obsL = ctx.label('observation', top.getPoint(0.5).add(V(0, 24, 0)), { cls: 'is-small' });
    const actL = ctx.label('action', bottom.getPoint(0.5).add(V(0, 2, 26)), { cls: 'is-small' });
    const flow = new THREE.Group(); group.add(flow);
    const up = stream(flow, K.COL.yellow, 7, 6), down = stream(flow, K.COL.green, 7, 6);
    // the reward gauge: the episode's running total
    const gauge = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 150, 24, 1, true), K.flat(0xffffff, { transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
    tube.position.y = 75; gauge.add(tube);
    const cap = new THREE.Mesh(new THREE.TorusGeometry(16, 2, 6, 24), K.paper(K.COL.ink)); cap.rotation.x = Math.PI / 2; cap.position.y = 150; gauge.add(cap);
    const fill = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 1, 24), K.paper(0xf2c230));
    gauge.add(fill);
    gauge.position.set(10, 0, -40);
    group.add(gauge);
    ctx.label('reward so far', V(10, 172, -40), { cls: 'is-accent' });
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 4, 24), K.paper(0xf2c230));
    coin.rotation.x = Math.PI / 2;
    group.add(coin);
    let total = 0, steps = 0, episodes = 1;
    const H = 140;
    const setFill = (v) => { fill.scale.y = Math.max(0.5, v * H); fill.position.y = Math.max(0.5, v * H) / 2; };
    const api = {
      group,
      reset() { total = 0; steps = 0; episodes = 1; setFill(0); up.hide(); down.hide(); coin.visible = false; duck.fall(0); duck.root.position.copy(home); duck.root.scale.setScalar(S); duck.setJoints(duck.stand); show(obsL, true); show(actL, true); },
      chips() { return [['steps', String(steps)], ['episode', String(episodes)]]; },
      steps: [
        { dur: 1.8, start() { ctx.sound('tick'); }, run(u) { up.at([top], u, 0.6); }, end() { up.hide(); } },
        { dur: 2.0, run(u) {
          down.at([bottom], seg(u, 0, 0.7), 0.6);
          duck.walkPose(seg(u, 0.4, 1) * 1.0, { stride: 0, lift: 12 });
        }, end() { down.hide(); duck.setJoints(duck.stand); steps = 1; } },
        { dur: 1.8, start() { coin.visible = true; coin.position.set(-125, 140, 150); ctx.sound('ding'); }, run(u) {
          const c = arc(V(-125, 140, 150), V(10, 10, -40), 150);
          coin.position.copy(c.getPoint(ease.inOut(u)));
          coin.rotation.z = u * 12;
          setFill(lerp(0, 0.06, seg(u, 0.85, 1)));
        }, end() { coin.visible = false; total = 0.06; setFill(total); } },
        { dur: 4.4, run(u) {
          const live = seg(u, 0, 0.7);
          steps = 1 + Math.floor(live * 3.0 * 50);
          if (u < 0.7) { up.flow([top], u * 4.4, 1.6); down.flow([bottom], u * 4.4 + 0.3, 1.6); }
          else { up.hide(); down.hide(); }
          if (u < 0.7) duck.walkPose(u * 7, { stride: 0, lift: 12 });
          total = 0.06 + live * 0.8;
          if (u < 0.84) setFill(Math.min(total, 0.86));
          // the episode ends: a fall, a reset, a fresh total
          if (u >= 0.7) duck.fall(seg(u, 0.7, 0.82), 'forward');
          if (u > 0.8 && !api._t) { api._t = true; ctx.sound('thud'); }
          const r = seg(u, 0.84, 1);
          if (u >= 0.84) { poof(duck.root, S, r); if (r >= 0.5) { duck.fall(0); duck.setJoints(duck.stand); setFill(0.86 * (1 - ease.inOut(seg(r, 0.5, 0.9)))); total = 0; episodes = 2; } }
          if (r > 0.5 && !api._r) { api._r = true; ctx.say('RESET', V(-250, 96, 165), { sound: 'pop', cls: 'is-blue' }); }
        }, end() { api._t = api._r = false; up.hide(); down.hide(); duck.root.scale.setScalar(S); duck.fall(0); duck.setJoints(duck.stand); episodes = 2; total = 0; setFill(0); } },
      ],
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 2. 61 numbers
  senses61(ctx) {
    const { group } = ctx;
    const S = 0.56;
    const duck = new K.Duck({ scale: S });
    const home = V(-140, 0, -70);
    duck.root.position.copy(home); duck.root.rotation.y = -0.3;
    group.add(duck.root);
    const colors = obsColors();
    const bars = new K.Bars({ n: 61, width: 5.2, gap: 1.3, depth: 8, maxH: 46, colors });
    const board = K.box(410, 120, 6, 0xfffaf0);
    board.position.set(0, 60, -6);
    const code = new THREE.Group();
    code.add(board);
    bars.mesh.position.set(0, 60, 4);
    code.add(bars.mesh);
    const base = new THREE.Mesh(new THREE.BoxGeometry(400, 1.5, 2), K.flat(K.COL.ink));
    base.position.set(0, 60, 9); code.add(base);
    code.position.set(10, 0, 110);
    group.add(code);
    let x0 = 0;
    // the three order groups are 13 bars together, too narrow for three labels,
    // so they share one, centred over the right of the code where it fits the page
    const orders = ctx.label('orders: walk and turn 3, head 4, body 6', V(96, 150, 112), { cls: 'is-small' });
    show(orders, false);
    const groupLabels = OBS.map((g, gi) => {
      const first = x0, last = x0 + g.n - 1;
      x0 += g.n;
      const mid = (bars.x(first) + bars.x(last)) / 2;
      const l = gi >= 5 ? orders : ctx.label(`${g.name} ${g.n}`, V(10 + mid, gi % 2 ? 150 : 134, 112), { cls: 'is-small' });
      show(l, false);
      return { l, first, last };
    });
    let lean = 0, last = new Array(14).fill(0), prev = null;
    const dim = (i, on) => bars.color(i, on ? colors[i] : 0xd6d0c4);
    const highlight = (groups) => {
      for (let i = 0; i < 61; i++) dim(i, groups === null);
      if (groups) for (const gi of groups) for (let i = groupLabels[gi].first; i <= groupLabels[gi].last; i++) dim(i, true);
      groupLabels.forEach((g, gi) => { if (gi < 5) show(g.l, !!groups && groups.includes(gi)); });
      show(orders, !!groups && groups.some((gi) => gi >= 5));
    };
    const values = (t) => {
      const v = new Array(61).fill(0);
      const a = duck.angles;
      const sway = Math.sin(t * 5.2) * 0.25;
      v[0] = Math.cos(t * 5.2) * 0.5 + lean * 0.4; v[1] = Math.sin(t * 2.6) * 0.3; v[2] = Math.cos(t * 2.1) * 0.25;
      v[3] = Math.sin(lean) * 0.9 + sway * 0.2; v[4] = sway * 0.3; v[5] = -Math.cos(lean) * 0.85;
      for (let i = 0; i < 14; i++) v[6 + i] = clamp(a[i] - duck.stand[i], -1, 1) * 1.6;
      for (let i = 0; i < 14; i++) v[20 + i] = prev ? clamp((a[i] - prev[i]) * 18, -1, 1) : 0;
      for (let i = 0; i < 14; i++) v[34 + i] = last[i];
      v[48] = 0.5; v[49] = 0; v[50] = 0.15;
      v[51] = 0.2; v[52] = -0.1;
      prev = a.slice();
      last = a.map((x, i) => clamp(x - duck.stand[i], -1, 1) * 1.4);
      return v;
    };
    const api = {
      group,
      reset() { lean = 0; prev = null; duck.root.rotation.z = 0; duck.setJoints(duck.stand); highlight(null); bars.set(new Array(61).fill(0), true); },
      steps: [
        { dur: 2.4, start() { highlight([0]); }, run() {} },
        { dur: 2.6, start() { highlight([1]); }, run(u) { lean = Math.sin(u * Math.PI) * 0.35; duck.root.rotation.z = -lean * 0.6; }, end() { lean = 0; duck.root.rotation.z = 0; } },
        { dur: 2.6, start() { highlight([2, 3]); }, run() {} },
        { dur: 2.2, start() { highlight([4]); }, run() {} },
        { dur: 2.6, start() { highlight([5, 6, 7]); }, run() {} },
      ],
      idle(t) {
        duck.walkPose(t * 1.1, { stride: 16, lift: 12 });
        bars.set(values(t), true);
      },
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 3. 14 motors
  motors14(ctx) {
    const { group } = ctx;
    const S = 0.98;
    const duck = new K.Duck({ scale: S });
    const ghost = new K.Duck({ scale: S, ghost: true });
    const home = V(-40, 0, 70);
    for (const d of [duck, ghost]) { d.root.position.copy(home); d.root.rotation.y = -0.55; }
    group.add(duck.root, ghost.root);
    const target = duck.stand.slice();
    target[11] = 0.95; target[12] = 1.25; target[13] = 0.15; target[2] = 0.18; target[5] = 0.3; target[6] = 0.1;
    const tags = [];
    for (let i = 0; i < 14; i++) {
      const dot = duck.dot(i, false, K.COL.yellow);
      const l = ctx.label(String(i), V(0, 14, 10), { parent: dot, cls: 'is-small' });
      show(l, false);
      tags.push(l);
    }
    const lagL = ctx.label('lags behind', V(0, -60, 30), { parent: duck.right.knee, cls: 'is-red' });
    const slackL = ctx.label('gear play', V(0, -60, 30), { parent: duck.right.knee, cls: 'is-accent' });
    let cur = duck.stand.slice(), wobble = 0, lit = 0;
    const api = {
      group,
      reset() { cur = duck.stand.slice(); duck.setJoints(cur); ghost.setJoints(duck.stand); ghost.root.visible = false; duck.dots_off(); tags.forEach((l) => show(l, false)); show(lagL, false); show(slackL, false); wobble = 0; lit = 0; },
      chips() { return lit ? [['motors', String(lit)]] : []; },
      steps: [
        { dur: 4.2, run(u) {
          const n = Math.min(14, Math.floor(u * 15));
          for (let i = 0; i < 14; i++) { duck.dot(i, i < n, i <= 4 ? K.COL.blue : i <= 8 ? K.COL.yellow : K.COL.red); show(tags[i], i < n); }
          if (n !== lit) ctx.sound('tick');
          lit = n;
        } },
        { dur: 1.8, start() { ghost.root.visible = true; ghost.setJoints(duck.stand); tags.forEach((l) => show(l, false)); duck.dots_off(); }, run(u) {
          ghost.setJoints(duck.stand.map((v, i) => lerp(v, target[i], ease.inOut(u))));
        } },
        { dur: 3.2, start() { show(lagL, true); }, run(u, dt) {
          // each joint closes a fixed fraction of its gap every frame, after a short wait
          const go = seg(u, 0.12, 1);
          const k = 1 - Math.exp(-3.2 * go);
          cur = duck.stand.map((v, i) => lerp(v, target[i], k));
          duck.setJoints(cur);
        }, end() { show(lagL, false); } },
        { dur: 2.6, start() { show(slackL, true); }, run(u) {
          const amp = 0.09 * (1 - u) * (u < 0.15 ? u / 0.15 : 1);
          const a = target.slice();
          const k = 1 - Math.exp(-3.2);
          for (let i = 0; i < 14; i++) a[i] = lerp(duck.stand[i], target[i], k);
          a[12] += Math.sin(u * 40) * amp; a[13] += Math.sin(u * 40 + 1) * amp * 0.8;
          duck.setJoints(a);
        }, end() { show(slackL, false); } },
      ],
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 4. the network
  network(ctx) {
    const { group } = ctx;
    // the network lies on the page like a printed diagram: inputs at the top,
    // outputs at the bottom, one row per layer
    const sizes = [61, 64, 32, 16, 14];
    const real = ['61 inputs', '512', '256', '128', '14 outputs'];
    const zs = [-215, -145, -75, -5, 62];
    const spans = [355, 355, 280, 210, 180];
    const R = K.rng(5);
    const xOf = (li, i) => 22 + (sizes[li] === 1 ? 0 : (i / (sizes[li] - 1) - 0.5) * spans[li]);
    const layers = sizes.map((n, li) => {
      const geo = new THREE.SphereGeometry(li === 0 || li === 4 ? 3.2 : 3.8, 8, 6);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), n);
      const d = new THREE.Object3D();
      for (let i = 0; i < n; i++) {
        d.position.set(xOf(li, i), 6, zs[li]); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix);
        mesh.setColorAt(i, new THREE.Color(0xc8c2b6));
      }
      mesh.instanceColor.needsUpdate = true;
      mesh.userData.n = n;
      return mesh;
    });
    const net = new THREE.Group();
    layers.forEach((m) => net.add(m));
    // a sample of the connections; drawing all of them would be a grey sheet
    const pos = [];
    for (let li = 0; li < 4; li++) {
      for (let k = 0; k < 150; k++) {
        const a = Math.floor(R() * sizes[li]), b = Math.floor(R() * sizes[li + 1]);
        pos.push(xOf(li, a), 4, zs[li], xOf(li + 1, b), 4, zs[li + 1]);
      }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x8a8478, transparent: true, opacity: 0.22 }));
    net.add(lines);
    group.add(net);
    layers.forEach((m, li) => ctx.label(real[li], V(xOf(li, 0) + 16, 18, zs[li] - 16), { cls: li === 0 || li === 4 ? 'is-small' : 'is-small is-blue' }));
    const outBars = new K.Bars({ n: 14, width: 9, gap: (180 - 14 * 9) / 13, depth: 8, maxH: 46, colors: new Array(14).fill(K.COL.orange) });
    outBars.mesh.position.set(22, 0, 88);
    const outG = new THREE.Group(); outG.add(outBars.mesh); group.add(outG);
    const duck = new K.Duck({ scale: 0.4 });
    duck.root.position.set(140, 0, 135); duck.root.rotation.y = -0.9;
    group.add(duck.root);
    // a small random network of the same shape, so the outputs really come from the inputs
    const W = [];
    for (let li = 0; li < 4; li++) W.push(Array.from({ length: sizes[li + 1] }, () => Array.from({ length: sizes[li] }, () => (R() * 2 - 1) * Math.sqrt(3 / sizes[li]))));
    const elu = (x) => (x > 0 ? x : Math.exp(x) - 1);
    const input = Array.from({ length: 61 }, (_, i) => Math.sin(i * 1.7) * 0.9);
    let scale = 1, out = new Array(14).fill(0);
    const forward = (s) => {
      let a = input;
      for (let li = 0; li < 4; li++) a = W[li].map((row) => { const z = row.reduce((acc, w, j) => acc + w * s * a[j], 0); return li < 3 ? elu(z) : Math.tanh(z); });
      return a;
    };
    const grey = new THREE.Color(0xc8c2b6), lit = new THREE.Color(0xffc93d), hot = new THREE.Color(0xff9500);
    const paint = (amount) => {
      layers.forEach((m, li) => {
        const c = (li === 4 ? hot : lit).clone().lerp(grey, 1 - clamp(amount[li]));
        for (let i = 0; i < m.userData.n; i++) m.setColorAt(i, c);
        m.instanceColor.needsUpdate = true;
      });
    };
    const pose = () => {
      out = forward(scale);
      outBars.set(out.map((v) => Math.abs(v)), false);
      duck.setJoints(duck.stand.map((v, i) => v + out[i] * 0.35));
    };
    const api = {
      group,
      slider: { label: 'Every weight', min: 0, max: 2, step: 0.01, value: 1, format: (v) => `× ${v.toFixed(2)}`, input(v) { scale = v; if (api._live) pose(); } },
      reset() { scale = 1; api._live = false; paint([0, 0, 0, 0, 0]); outBars.set(new Array(14).fill(0)); duck.setJoints(duck.stand); lines.material.opacity = 0.22; },
      steps: [
        { dur: 1.6, run(u) { paint([ease.out(u), 0, 0, 0, 0]); } },
        { dur: 1.8, run(u) { paint([1, ease.out(u), 0, 0, 0]); lines.material.opacity = 0.22 + 0.2 * Math.sin(u * Math.PI); } },
        { dur: 2.2, run(u) { paint([1, 1, ease.out(seg(u, 0, 0.5)), ease.out(seg(u, 0.5, 1)), 0]); } },
        { dur: 2.0, start() { api._live = true; }, run(u) {
          paint([1, 1, 1, 1, ease.out(u)]);
          out = forward(scale);
          outBars.set(out.map((v) => Math.abs(v) * ease.out(u)), false);
          duck.setJoints(duck.stand.map((v, i) => v + out[i] * 0.35 * ease.inOut(u)));
        } },
        { dur: 4.4, run(u) {
          scale = u < 0.3 ? lerp(1, 0, ease.inOut(u / 0.3)) : u < 0.75 ? lerp(0, 2, ease.inOut((u - 0.3) / 0.45)) : lerp(2, 1, ease.inOut((u - 0.75) / 0.25));
          pose();
        }, end() { scale = 1; pose(); } },
      ],
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 5. the reward
  rewards(ctx) {
    const { group } = ctx;
    const S = 0.48;
    const duck = new K.Duck({ scale: S });
    duck.root.position.set(-160, 0, 175); duck.root.rotation.y = -0.45;
    group.add(duck.root);
    const terms = [
      ['speed ×2.0', 2.0, 0.85], ['turning ×2.0', 2.0, 0.8], ['upright ×2.0', 2.0, 0.95], ['feet ×3.0', 3.0, 0.4], ['pose ×1.0', 1.0, 0.6], ['head ×2.0', 2.0, 0.75],
      ['jerky', -0.4, 0.5], ['slide ×0.1', -0.1, 0.4], ['knock ×1.0', -1.0, 0.05],
    ];
    const n = terms.length + 1;
    const colors = terms.map((t) => (t[1] > 0 ? K.COL.green : K.COL.red)).concat([K.COL.orange]);
    const BW = 330, BH = 190, gap = 7, bw = (BW - 30 - (n - 1) * gap) / n;
    const bars = new K.Bars({ n, width: bw, gap, depth: 14, maxH: 50, colors });
    const names = terms.map((t) => t[0]).concat(['total']);
    let shown = 0;
    const face = K.canvasTexture(BW * 3, BH * 3, () => {});
    const drawFace = () => face.redraw((c, w, h) => {
      c.fillStyle = '#fffaf0'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#2b2620'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
      c.font = `600 ${25}px ${K.ROUND}`; c.textAlign = 'center'; c.fillStyle = '#2b2620';
      c.fillText('points this step', w / 2, 40);
      c.font = `600 ${21}px ${K.FONT}`;
      names.forEach((nm, i) => {
        if (i >= shown) return;
        const x = (bars.x(i) + BW / 2) * 3;
        const [word, weight] = nm.split(' ');
        c.fillStyle = i === n - 1 ? '#a65a00' : '#2b2620';
        c.fillText(word, x, h - 44);
        if (weight) { c.fillStyle = '#5c574e'; c.fillText(weight, x, h - 18); }
      });
    });
    const back = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, 5), [K.paper(0xfffaf0), K.paper(0xfffaf0), K.paper(0xfffaf0), K.paper(0xfffaf0), new THREE.MeshToonMaterial({ map: face.tex }), K.paper(0xfffaf0)]);
    back.position.set(0, BH / 2, -6); back.castShadow = true;
    const board = new THREE.Group();
    board.add(back);
    bars.mesh.position.set(0, 112, 6);
    board.add(bars.mesh);
    const zero = new THREE.Mesh(new THREE.BoxGeometry(BW - 20, 1.5, 2), K.flat(K.COL.ink));
    zero.position.set(0, 112, 14); board.add(zero);
    board.position.set(8, 0, 30);
    board.rotation.y = 0.12;
    group.add(board);
    const reveal = (k) => { shown = k; drawFace(); };
    let show1 = 0, show2 = 0, show3 = 0, strict = 0, fixed = 0, walk = 1, t = 0;
    const contrib = () => {
      // what each term pays this step: weight times how well the duck meets it (made up for the lesson)
      const v = terms.map(([, w, k], i) => {
        let met = k;
        if (i === 0 || i === 1 || i === 3) met = k * walk;
        if (i === 5) return walk > 0.5 ? lerp(w * k, -4.0 * strict, strict * (1 - fixed)) : w * 0.95;
        if (i === 6) met = k * (0.3 + 0.7 * walk);
        return w * met;
      });
      for (let i = 0; i < 6; i++) v[i] *= show1;
      for (let i = 6; i < 9; i++) v[i] *= show2;
      return v;
    };
    const draw = () => {
      const v = contrib();
      const total = v.reduce((a, b) => a + b, 0) * show3;
      bars.set(v.concat([total / 3]).map((x) => x / 3.2), true);
    };
    const api = {
      group,
      slider: { label: 'Head strictness', min: 0, max: 1, step: 0.01, value: 0, format: (v) => (v < 0.5 ? 'gentle' : v < 0.8 ? 'strict' : 'very strict'),
        input(v) { strict = v; fixed = 0; }, get: () => strict },
      reset() { show1 = show2 = show3 = 0; strict = 0; fixed = 0; walk = 1; reveal(0); draw(); },
      steps: [
        { dur: 1.8, start() { reveal(6); ctx.sound('pop'); }, run(u) { show1 = ease.out(u); } },
        { dur: 1.6, start() { reveal(9); }, run(u) { show2 = ease.out(u); } },
        { dur: 1.4, start() { reveal(10); }, run(u) { show3 = ease.out(u); } },
        { dur: 4.0, run(u) { strict = ease.inOut(seg(u, 0, 0.5)); }, end() { strict = 1; } },
        { dur: 3.0, run(u) { fixed = ease.inOut(seg(u, 0, 0.6)); }, end() { fixed = 1; } },
      ],
      idle(time, dt) {
        t += dt;
        // with an inescapable head charge, standing still scores higher, so the duck stands
        const want = strict * (1 - fixed) > 0.6 ? 0 : 1;
        walk += (want - walk) * Math.min(1, dt * 2.5);
        if (walk > 0.05) duck.walkPose(t * 1.4 * walk, { stride: 26 * walk, lift: 14 * walk });
        else duck.setJoints(duck.stand);
        draw();
      },
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 6. training
  training(ctx) {
    const { group } = ctx;
    const n = 64, count = n * n, gap = 3.5;
    const crowd = K.duckCrowd(count, { size: 1.9 });
    const CX = -60, CZ = -110;
    crowd.position.set(CX, 0, CZ);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(232, 232), K.paper(0xcfe0f2));
    floor.rotation.x = -Math.PI / 2; floor.position.set(CX, 0.6, CZ); floor.receiveShadow = true;
    const crowdG = new THREE.Group(); crowdG.add(floor, crowd); group.add(crowdG);
    const R = K.rng(4);
    const info = Array.from({ length: count }, (_, i) => ({ x: (i % n - (n - 1) / 2) * gap, z: (Math.floor(i / n) - (n - 1) / 2) * gap, ph: R() * 6.28 }));
    const d = new THREE.Object3D();
    const setCrowd = (t, amp) => {
      for (let i = 0; i < count; i++) {
        const o = info[i];
        d.position.set(o.x, Math.abs(Math.sin(t * 8 + o.ph)) * 1.2 * amp, o.z);
        d.rotation.set(0, Math.PI / 2, 0); d.scale.setScalar(1); d.updateMatrix(); crowd.setMatrixAt(i, d.matrix);
      }
      crowd.instanceMatrix.needsUpdate = true;
    };
    setCrowd(0, 0);
    ctx.label('4,096 pretend ducks', V(CX, 20, CZ + 132), { cls: 'is-small is-blue' });
    const brain = K.chip(K.COL.green, { w: 60, d: 48, h: 12 });
    const pedestal = K.cylinder(14, 18, 56, 0xd9cdb4); pedestal.position.y = 28;
    brain.position.y = 58;
    const brainG = new THREE.Group(); brainG.add(pedestal, brain); brainG.position.set(140, 0, -150); group.add(brainG);
    ctx.label('one brain', V(140, 100, -150), { cls: 'is-green' });
    const flow = new THREE.Group(); group.add(flow);
    const sends = stream(flow, K.COL.yellow, 14, 4);
    const curves = Array.from({ length: 14 }, () => arc(V(CX + (R() - 0.5) * 210, 6, CZ + (R() - 0.5) * 210), V(140, 66, -150), 70));
    const bar = new THREE.Group();
    const barBack = new THREE.Mesh(new THREE.BoxGeometry(232, 8, 16), K.paper(0xe8e0cc));
    const barFill = new THREE.Mesh(new THREE.BoxGeometry(1, 9, 17), K.paper(K.COL.yellow));
    bar.add(barBack, barFill);
    bar.position.set(CX, 4, 26);
    group.add(bar);
    const chart = new K.Chart({ w: 190, h: 125, x: [0, 1500], y: [0, 1], title: 'score', xLabel: 'iteration' });
    chart.xTicks = [0, 500, 1000, 1500];
    chart.group.position.set(80, 0, 168); chart.group.rotation.y = -0.2;
    group.add(chart.group);
    const curve = Array.from({ length: 61 }, (_, i) => { const x = i * 25; return [x, 0.08 + 0.82 / (1 + Math.exp(-(x - 520) / 140)) + Math.sin(i * 1.9) * 0.02]; });
    const sample = new K.Duck({ scale: 0.45 });
    sample.root.position.set(-150, 0, 170); sample.root.rotation.y = -0.6;
    group.add(sample.root);
    let it = 0, step = 0, t = 0, crowdAmp = 0;
    const fillTo = (k) => { barFill.scale.x = Math.max(0.5, k * 232); barFill.position.x = -116 + Math.max(0.5, k * 232) / 2; };
    let drawn = '';
    const plot = (upto, saves) => {
      // the card is a canvas texture: redraw it only when what it shows changes
      if (drawn === `${upto} ${saves}`) return;
      drawn = `${upto} ${saves}`;
      chart.marks = saves ? [250, 500, 750, 1000].map((x) => ({ x, color: '#1b6e3e', dash: [3, 3], width: 1.5 })) : [];
      chart.plot([{ points: curve, upto, color: '#2a64c9', width: 3 }]);
    };
    const api = {
      group,
      reset() { it = 0; step = 0; crowdAmp = 0; fillTo(0); plot(1, false); sends.hide(); sample.root.visible = false; sample.setJoints(sample.stand); setCrowd(0, 0); },
      chips() { return [['iteration', it.toLocaleString('en-US')], ['steps each', `${step} of 24`]]; },
      steps: [
        { dur: 2.6, run(u) { crowdAmp = 1; step = Math.min(24, Math.floor(u * 25)); fillTo(step / 24); } , end() { step = 24; fillTo(1); } },
        { dur: 2.2, start() { ctx.sound('whirr'); }, run(u) { sends.at(curves, u, 0.6); brain.scale.setScalar(1 + 0.2 * Math.sin(u * Math.PI)); fillTo(1 - ease.in(seg(u, 0.6, 1))); }, end() { sends.hide(); it = 1; step = 0; fillTo(0); } },
        { dur: 4.4, run(u) { it = Math.max(1, Math.floor(ease.inOut(u) * 1000)); step = Math.floor((u * 60) % 24); fillTo(ease.out(seg(u, 0, 0.12))); barFill.material = K.paper(Math.floor(u * 60) % 2 ? K.COL.yellow : 0xffe28a); plot(Math.max(1, Math.floor(it / 25) + 1), false); sends.flow(curves, u * 4.4, 1.4); }, end() { it = 1000; step = 24; fillTo(1); barFill.material = K.paper(K.COL.yellow); sends.hide(); plot(41, false); } },
        { dur: 2.0, start() { ctx.sound('ding'); }, run(u) { plot(41, u > 0.2); } },
        { dur: 3.2, start() { sample.root.visible = true; ctx.sound('pop'); }, run(u) { sample.root.scale.setScalar(0.45 * Math.max(0.01, ease.back(seg(u, 0, 0.3)))); } },
      ],
      idle(time, dt) {
        t += dt;
        if (crowdAmp) setCrowd(t, crowdAmp);
        if (sample.root.visible) sample.walkPose(t * 1.2, { stride: 0, lift: 12 });
      },
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 7. PPO
  ppo(ctx) {
    const { group } = ctx;
    // a hill of scores, drawn as a paper cut-out: a long slope, a peak, a cliff
    const XP = 40;
    const H = (x) => (x <= XP ? 140 * Math.exp(-Math.pow((x - XP) / 150, 2)) : x <= XP + 25 ? 140 - (x - XP) * 0.6 : Math.max(0, 125 - (x - XP - 25) * 8));
    const shape = new THREE.Shape();
    shape.moveTo(-190, 0);
    for (let x = -190; x <= 150; x += 4) shape.lineTo(x, H(x));
    shape.lineTo(150, 0);
    shape.lineTo(-190, 0);
    const hillGeo = new THREE.ExtrudeGeometry(shape, { depth: 110, bevelEnabled: false, curveSegments: 1 });
    hillGeo.translate(0, 0, -55);
    const hill = K.solid(hillGeo, 0x9cc98a, { lineWidth: 1.2 });
    const ZF = 40;
    const hillG = new THREE.Group(); hillG.add(hill); hillG.position.set(0, 0, ZF);
    group.add(hillG);
    ctx.label('the best score', V(XP, 175, ZF), { cls: 'is-small' });
    const marble = K.ball(13, K.COL.orange);
    group.add(marble);
    // the safe band: a strip on the hill around the marble, as far as one update may move it
    const band = new THREE.Mesh(new THREE.BufferGeometry(), K.flat(K.COL.blue, { transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    const bandG = new THREE.Group(); bandG.add(band); group.add(bandG);
    const bandL = ctx.label('safe band', V(0, 0, 0), { cls: 'is-blue', parent: bandG });
    const tries = new THREE.Group(); group.add(tries);
    const dots = Array.from({ length: 10 }, () => { const m = K.packet(K.COL.yellow, 4.5); m.visible = false; tries.add(m); return m; });
    const practisedL = ctx.label('where it practised', V(-165, 70, ZF + 62), { cls: 'is-small' });
    let clip = 0.2;
    const reach = () => 20 + clip * 240;
    const zM = ZF + 62;
    const at = (x) => V(x, H(Math.min(x, 150)) + 13, zM);
    const x0 = -165;
    let banded = '';
    const placeBand = (x) => {
      const r = reach();
      if (banded === `${x} ${r}`) return;
      banded = `${x} ${r}`;
      const a = Math.max(-190, x - r), b = Math.min(150, x + r), N = 32;
      const strip = new THREE.Shape();
      for (let i = 0; i <= N; i++) { const xi = a + ((b - a) * i) / N; if (i) strip.lineTo(xi, H(xi) + 21); else strip.moveTo(xi, H(xi) + 21); }
      for (let i = N; i >= 0; i--) { const xi = a + ((b - a) * i) / N; strip.lineTo(xi, H(xi) + 5); }
      band.geometry.dispose();
      band.geometry = new THREE.ShapeGeometry(strip);
      bandG.position.set(0, 0, zM - 2);
      const xl = Math.max(-170, Math.min(x, XP - 30));
      bandL.position.set(xl, H(xl) - 16, 6);
    };
    let hops = [];
    const planHops = () => {
      hops = [x0];
      let x = x0;
      const hop = reach() * 0.62;
      for (let k = 0; k < 14 && x < XP - 2; k++) { x = x + hop; if (x > XP && x <= XP + 25) x = Math.min(x, XP + 4); hops.push(x); if (x > XP + 25) break; }
    };
    const api = {
      group,
      slider: { label: 'Band', min: 0.05, max: 0.6, step: 0.01, value: 0.2, format: (v) => `${Math.round(v * 100)}%`, input(v) { clip = v; placeBand(api._x ?? x0); } },
      reset() { clip = 0.2; api._x = x0; marble.position.copy(at(x0)); marble.scale.setScalar(1); bandG.visible = false; show(bandL, false); band.scale.set(1, 1, 1); dots.forEach((d) => (d.visible = false)); show(practisedL, false); planHops(); },
      steps: [
        { dur: 2.0, run(u) {
          dots.forEach((d, i) => { const x = x0 + Math.sin(i * 2.3) * 40; d.visible = u > i / 12; d.position.set(x, H(x) + 8, zM + Math.cos(i * 1.7) * 20); });
          show(practisedL, u > 0.5);
        } },
        { dur: 2.8, run(u) {
          const a = ease.inOut(seg(u, 0, 0.55));
          const x = lerp(x0, 140, a);
          const p = at(x); p.y += Math.sin(a * Math.PI) * 130;
          if (u > 0.55) { const f = ease.in(seg(u, 0.55, 0.85)); p.set(140 + f * 20, lerp(H(140) + 13, -30, f), zM); }
          marble.position.copy(p);
          if (u > 0.82 && !api._o) { api._o = true; ctx.say('OVER THE EDGE', V(130, 80, zM), { sound: 'thud', cls: 'is-red' }); }
        }, end() { api._o = false; } },
        { dur: 1.8, start() { planHops(); dots.forEach((d) => (d.visible = false)); show(practisedL, false); }, run(u) {
          const r = seg(u, 0, 0.5);
          poof(marble, 1, r);
          if (r >= 0.5) marble.position.copy(at(x0));
          if (u > 0.5) { bandG.visible = true; show(bandL, true); placeBand(x0); band.material.opacity = 0.5 * ease.out(seg(u, 0.5, 1)); }
        }, end() { marble.scale.setScalar(1); band.material.opacity = 0.5; api._x = x0; } },
        { dur: 5.2, start() { planHops(); }, run(u) {
          const n = hops.length - 1;
          const f = u * n, k = Math.min(n - 1, Math.floor(f)), v = ease.inOut(f - k);
          const xa = hops[k], xb = hops[k + 1];
          const p = at(lerp(xa, xb, v)); p.y += Math.sin(v * Math.PI) * 26;
          if (xb > XP + 25) { p.set(lerp(xa, xb, v), lerp(H(xa) + 13, -30, v), zM); }
          marble.position.copy(p);
          api._x = lerp(xa, xb, v);
          placeBand(xa);
          if (u >= 1 && hops[n] <= XP + 25 && !api._top) { api._top = true; ctx.say('TOP', V(XP - 95, 185, ZF), { sound: 'ding', cls: 'is-green' }); }
        }, end() { api._top = false; } },
      ],
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 8. randomization
  randomize(ctx) {
    const { group } = ctx;
    const R = K.rng(21);
    const cells = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const g = new THREE.Group();
      const floor = new THREE.Mesh(K.roundBox(116, 8, 116, 4, 2), K.paper(0xefe5cf, { unique: true }));
      floor.position.y = 4; floor.receiveShadow = true; floor.castShadow = true;
      g.add(floor);
      const duck = new K.Duck({ scale: 0.3 });
      duck.root.position.y = 8; duck.root.rotation.y = -0.5;
      g.add(duck.root);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(6, 40, 10), K.paper(K.COL.red));
      cone.position.y = 120; cone.visible = false;
      g.add(cone);
      const push = K.arrow([[0, 0, 0], [50, 0, 0]], { color: K.COL.red, width: 5, head: 14 });
      push.position.set(-90, 50, 0); push.visible = false;
      g.add(push);
      g.position.set((c - 1) * 132, 0, (r - 1) * 132 + 40);
      group.add(g);
      cells.push({ g, floor, duck, cone, push, grip: 0.7 + R() * 0.6, mass: 0.95 + R() * 0.1, tilt: (R() * 2 - 1), tiltDir: R() * Math.PI * 2, pushAt: R(), pushDir: R() * Math.PI * 2, ph: R() * 6 });
    }
    const gripColor = (g) => new THREE.Color(0x9fd3ff).lerp(new THREE.Color(0xff9a5a), (g - 0.7) / 0.6);
    const legend = [ctx.label('grip 0.7', V(-262, 24, 140), { cls: 'is-small is-blue' }), ctx.label('grip 1.3', V(-262, 24, 182), { cls: 'is-small is-red' })];
    legend.forEach((l) => show(l, false));
    let grip = 0, body = 0, shoves = 0, senses = 0, t = 0;
    const draw = () => {
      cells.forEach((c, i) => {
        c.floor.material.color.copy(new THREE.Color(0xefe5cf).lerp(gripColor(c.grip), grip));
        c.duck.root.scale.setScalar(0.3 * lerp(1, c.mass, body) * (1 + (c.mass - 1) * 2 * body));
        c.cone.visible = senses > 0.01;
        const a = (6 * Math.PI) / 180 * Math.abs(c.tilt) * senses * 3;
        c.cone.rotation.set(Math.cos(c.tiltDir) * a, 0, Math.sin(c.tiltDir) * a);
        const cyc = (t * 0.33 + c.pushAt) % 1;
        const hit = shoves > 0.01 && cyc < 0.18;
        c.push.visible = hit;
        c.push.rotation.y = c.pushDir;
        c.push.position.set(-Math.cos(c.pushDir) * 80, 50, Math.sin(c.pushDir) * 80);
        c.duck.root.rotation.z = hit ? Math.sin(cyc / 0.18 * Math.PI) * 0.25 * shoves : 0;
      });
    };
    const api = {
      group,
      reset() { grip = body = shoves = senses = 0; legend.forEach((l) => show(l, false)); draw(); },
      steps: [
        { dur: 1.6, run() {} },
        { dur: 2.2, start() { legend.forEach((l) => show(l, true)); ctx.sound('swish'); }, run(u) { grip = ease.inOut(u); } },
        { dur: 2.0, run(u) { body = ease.inOut(u); } },
        { dur: 3.2, run(u) { shoves = ease.out(seg(u, 0, 0.2)); } },
        { dur: 2.4, run(u) { senses = ease.out(u); } },
      ],
      idle(time, dt) {
        t += dt;
        cells.forEach((c) => c.duck.walkPose(t * 1.3 + c.ph, { stride: 0, lift: 10 }));
        draw();
      },
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 9. deployment
  pipeline(ctx) {
    const { group } = ctx;
    const belt = new THREE.Mesh(K.roundBox(440, 10, 70, 4, 2), K.paper(0x6d7b8c));
    belt.position.set(0, 5, 70); belt.castShadow = true; belt.receiveShadow = true;
    const beltG = new THREE.Group(); beltG.add(belt); group.add(beltG);
    const xs = [-165, -82, 0, 80, 150];
    const names = ['train', 'export', 'rehearse', 'publish', 'install'];
    const props = new THREE.Group(); group.add(props);
    const gpu = K.chip(K.COL.green, { w: 50, d: 40, h: 10 }); gpu.position.set(xs[0], 0, -30); props.add(gpu);
    const press = K.box(50, 70, 40, 0xb8b0a0); press.position.set(xs[1], 35, -30); props.add(press);
    const laptop = new THREE.Group();
    const lb = K.box(70, 5, 50, 0x8a8478); lb.position.y = 2.5; laptop.add(lb);
    const ls = K.box(70, 46, 4, 0x3c3c44); ls.position.set(0, 26, -24); ls.rotation.x = -0.25; laptop.add(ls);
    const mini = new K.Duck({ scale: 0.14 }); mini.root.position.set(0, 6, 0); laptop.add(mini.root);
    laptop.position.set(xs[2], 0, -30); props.add(laptop);
    const hub = K.box(56, 40, 40, 0xfbe2a8); hub.position.set(xs[3], 20, -30); props.add(hub);
    const upArrow = K.arrow([[0, 0, 0], [0, 50, 0]], { color: K.COL.orange, width: 6, head: 16 }); upArrow.position.set(xs[3], 42, -30); props.add(upArrow);
    const robot = new K.Duck({ scale: 0.36 }); robot.root.position.set(xs[4], 0, -40); robot.root.rotation.y = -0.6; props.add(robot.root);
    names.forEach((n, i) => ctx.label(n, V(xs[i], i === 4 ? 120 : 100, -30), { cls: 'is-small' }));
    const file = new THREE.Group();
    const fileBox = K.box(54, 26, 40, 0xfffaf0);
    fileBox.position.y = 13;
    file.add(fileBox);
    const fileL = ctx.label('checkpoint', V(0, 44, 0), { parent: file, cls: 'is-small is-accent' });
    group.add(file);
    const stamps = names.map((_, i) => { const s = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 2, 16), K.paper(K.COL.green)); s.position.set(-21 + i * 10.5, 27, 18); s.visible = false; file.add(s); return s; });
    const checks = ['', 'normalizer built in', 'walks on a laptop', '61 in, 14 out, no NaN', 'loaded on the robot'];
    // staggered in two rows, so neighbours never print over each other
    const checkL = checks.map((c, i) => (c ? ctx.label(c, V(xs[i] - (i === 4 ? 30 : 0), 22, i % 2 ? 150 : 188), { cls: 'is-small is-green' }) : null));
    checkL.forEach((l) => l && show(l, false));
    let t = 0, k = 0;
    const move = (from, to, u) => { file.position.set(lerp(xs[from], xs[to], ease.inOut(u)), 10, 70); };
    const api = {
      group,
      reset() { file.position.set(xs[0], 10, 70); stamps.forEach((s) => (s.visible = false)); checkL.forEach((l) => l && show(l, false)); fileL.userData.el.textContent = 'checkpoint'; k = 0; },
      steps: [0, 1, 2, 3, 4].map((i) => ({
        dur: i === 0 ? 1.6 : 2.0,
        start() { if (i === 1) fileL.userData.el.textContent = 'policy.onnx'; },
        run(u) {
          if (i > 0) move(i - 1, i, seg(u, 0, 0.6));
          if (u > 0.65) { stamps[i].visible = true; if (checkL[i]) show(checkL[i], true); }
          if (u > 0.65 && !api['_d' + i]) { api['_d' + i] = true; ctx.sound(i === 4 ? 'ding' : 'tick'); }
          if (i === 0) gpu.position.y = Math.sin(u * Math.PI * 6) * 2;
          if (i === 1) press.position.y = 35 - Math.sin(seg(u, 0.55, 0.75) * Math.PI) * 14;
        },
        end() { delete api['_d' + i]; },
      })),
      idle(time, dt) {
        t += dt;
        mini.walkPose(t * 1.5, { stride: 0, lift: 10 });
        robot.walkPose(t * 1.1, { stride: 0, lift: 8 });
      },
    };
    api.reset();
    return api;
  },

  // ------------------------------------------------------------ 10. the project
  rebound(ctx) {
    const { group } = ctx;
    const S = 0.72;
    const duck = new K.Duck({ scale: S });
    duck.root.position.set(-80, 0, 140); duck.root.rotation.y = -0.3;
    group.add(duck.root);
    const ball = K.ball(16, 0xffffff);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(16, 2.4, 6, 24), K.paper(K.COL.red));
    ball.add(stripe);
    group.add(ball);
    const kick = K.sign('kick a ball', { w: 130, h: 40, size: 18 }); kick.position.set(95, 0, 70); kick.rotation.y = -0.3;
    const pick = K.sign('touch the ground', { w: 150, h: 40, size: 18 }); pick.position.set(95, 0, 150); pick.rotation.y = -0.3;
    const tasks = new THREE.Group(); tasks.add(kick, pick); group.add(tasks);
    const colors = obsColors().concat(new Array(6).fill(K.COL.red));
    const bars = new K.Bars({ n: 67, width: 4.2, gap: 1.2, depth: 6, maxH: 30, colors });
    const strip = K.box(370, 70, 5, 0xfffaf0); strip.position.set(0, 35, -6);
    const barG = new THREE.Group(); barG.add(strip, bars.mesh); bars.mesh.position.set(0, 18, 2); barG.position.set(10, 0, -110); group.add(barG);
    const sight = ctx.label('the ball', V(10 + bars.x(64), 86, -108), { cls: 'is-small is-red' });
    const warn = ctx.label('not the shared 61 any more', V(10, 96, -108), { cls: 'is-small' });
    let score = 0, mode = 'none';
    const local = (v) => group.worldToLocal(v);
    const api = {
      group,
      reset() { score = 0; mode = 'none'; kick.scale.setScalar(0.01); pick.scale.setScalar(0.01); barG.visible = false; show(sight, false); show(warn, false); ball.position.set(30, 16, 200); duck.setJoints(duck.stand); },
      chips() { return mode === 'none' ? [] : [['reward', mode === 'hold' ? 'every step' : 'per bounce'], ['score', String(score)]]; },
      steps: [
        { dur: 2.8, run(u) {
          kick.scale.setScalar(Math.max(0.01, ease.back(seg(u, 0, 0.3)))); pick.scale.setScalar(Math.max(0.01, ease.back(seg(u, 0.15, 0.45))));
          const a = duck.stand.slice();
          const pk = Math.sin(seg(u, 0.5, 1) * Math.PI);
          a[5] += pk * 1.1; a[6] += pk * 0.6;
          duck.setJoints(a);
        } },
        { dur: 2.4, start() { barG.visible = true; ctx.sound('pop'); }, run(u) {
          const v = Array.from({ length: 67 }, (_, i) => (i < 61 ? (0.4 + 0.3 * Math.sin(i * 0.9)) * ease.out(seg(u, 0, 0.4)) : 0.9 * Math.max(0, ease.back(seg(u, 0.4, 0.9)))));
          bars.set(v);
          show(sight, u > 0.6); show(warn, u > 0.75);
        } },
        { dur: 4.2, start() { mode = 'bounce'; score = 0; }, run(u) {
          // the ball rises from the ground into the first bounce, then off the beak, three times
          const b = local(duck.pointOn('beak'));
          const n = 3, f = u * n, k = Math.min(n - 1, Math.floor(f)), v = f - k;
          const h = 110 * Math.sin(v * Math.PI);
          const top = V(b.x + 8, b.y + 16 + h, b.z);
          if (k === 0 && v < 0.5) ball.position.lerpVectors(V(30, 16, 200), top, ease.out(v * 2)); else ball.position.copy(top);
          const a = duck.stand.slice();
          const near = v > 0.88 || (k > 0 && v < 0.08);
          a[5] = duck.stand[5] - (near ? 0.25 : 0); a[6] = duck.stand[6] - (near ? 0.2 : 0);
          duck.setJoints(a);
          if (k > 0 && v < 0.06 && !api['_b' + k]) { api['_b' + k] = true; score = k; ctx.say('+1', V(b.x, b.y + 60, b.z), { sound: 'pop', cls: 'is-green' }); }
        }, end() { [1, 2].forEach((k) => delete api['_b' + k]); score = 3; ctx.say('+1', V(-60, 230, 140), { cls: 'is-green' }); } },
        { dur: 3.6, start() { mode = 'hold'; score = 0; ctx.say('ball high? +1', V(0, 230, 120), { cls: 'is-red' }); }, run(u) {
          const head = local(duck.pointOn('head'));
          const from = ball.position.clone();
          ball.position.lerpVectors(from, V(head.x, head.y + 44, head.z), ease.out(seg(u, 0, 0.3)) * 0.4);
          duck.setJoints(duck.stand);
          score = Math.floor(seg(u, 0.3, 1) * 120);
          if (u > 0.5 && !api._j) { api._j = true; ctx.say('JACKPOT', V(head.x, head.y + 110, head.z), { sound: 'ding', cls: 'is-red' }); }
        }, end() { api._j = false; } },
        { dur: 3.4, start() { mode = 'bounce'; score = 0; api._from = ball.position.clone(); }, run(u) {
          const b = local(duck.pointOn('beak'));
          const n = 2, f = u * n, k = Math.min(n - 1, Math.floor(f)), v = f - k;
          const top = V(b.x + 8, b.y + 16 + 110 * Math.sin(v * Math.PI), b.z);
          if (k === 0 && v < 0.5) ball.position.lerpVectors(api._from, top, ease.inOut(v * 2)); else ball.position.copy(top);
          if (v > 0.9 && !api['_c' + k]) { api['_c' + k] = true; score = k + 1; ctx.say('+1', V(b.x, b.y + 60, b.z), { sound: 'pop', cls: 'is-green' }); }
        }, end() { [0, 1].forEach((k) => delete api['_c' + k]); } },
      ],
    };
    api.reset();
    return api;
  },

};
