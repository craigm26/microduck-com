// Stills of every step of every lesson, for looking at, plus the checks a
// still cannot show: console errors, step counts, a left page that overflows,
// and frame jumps (a mesh that moves too far between two frames).
//
//   node tools/books/shoot.cjs <book> [lessons] [outdir] [--w 1440 --h 900] [--flat] [--dark]
//
// Needs tools/books/serve.py running on :8123.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };
const flag = (name) => args.includes('--' + name);
const valued = new Set(['--w', '--h']);
const pos = [];
for (let i = 0; i < args.length; i++) {
  if (valued.has(args[i])) { i++; continue; }
  if (!args[i].startsWith('--')) pos.push(args[i]);
}
const book = pos[0] || 'beginner';
const which = pos[1] && pos[1] !== 'all' ? pos[1].split(',').map(Number) : null;
const out = pos[2] || path.join(process.env.SHOTS || '/tmp', 'shots-' + book);
const W = Number(opt('w', 1280)), H = Number(opt('h', 800));
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: flag('dark') ? 'dark' : 'light', reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`console ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => problems.push('requestfailed: ' + r.url()));
  await page.goto(`http://127.0.0.1:8123/books/${book}/?test`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__book, null, { timeout: 20000 });
  // set the view explicitly: Book 1 opens flat on screens where its 3D pages would read small
  await page.evaluate((flat) => window.__book.setMode(flat ? 'flat' : '3d'), flag('flat'));
  await page.evaluate(() => window.__book.manual(true));
  await page.evaluate(() => window.__book.advance(2500));
  const lessons = await page.evaluate(() => window.__book.lessons);
  const report = [];
  const idx = which || lessons.map((_, i) => i);
  for (const i of idx) {
    await page.evaluate((i) => window.__book.jump(i), i);
    await page.evaluate(() => window.__book.advance(1200));
    const st = await page.evaluate(() => window.__book.state());
    const L = lessons[i];
    const row = { i, figure: L.figure, steps: st.steps, pageSteps: st.pageSteps, overflow: st.leftOverflow, jumps: [] };
    if (st.steps !== st.pageSteps && i > 0) problems.push(`lesson ${i} ${L.figure}: ${st.steps} figure steps, ${st.pageSteps} on the page`);
    if (st.leftOverflow > 2) problems.push(`lesson ${i}: left page overflows by ${st.leftOverflow}px`);
    await page.screenshot({ path: path.join(out, `${String(i).padStart(2, '0')}-0.png`), timeout: 120000 });
    for (let s = 0; s < st.steps; s++) {
      await page.evaluate(() => window.__book.step());
      // walk the step at 60 frames a second and look for jumps
      let prev = await page.evaluate(() => window.__book.positions());
      let worst = 0;
      for (let f = 0; f < 600; f++) {
        await page.evaluate(() => window.__book.advance(1000 / 60, 1000 / 60, false));
        const cur = await page.evaluate(() => window.__book.positions());
        if (cur.length === prev.length) {
          for (let k = 0; k < cur.length; k++) {
            // a mesh that is hidden, or shrunk to nothing, may move: nobody sees it
            if (cur[k][3] < 0.05 || prev[k][3] < 0.05) continue;
            const d = Math.hypot(cur[k][0] - prev[k][0], cur[k][1] - prev[k][1], cur[k][2] - prev[k][2]);
            if (d > worst) worst = d;
          }
        }
        prev = cur;
        const r = await page.evaluate(() => window.__book.state().running);
        if (r === -1) break;
        if (!flag('jumps') && f % 4 !== 0) continue;
      }
      row.jumps.push(Math.round(worst));
      if (worst > 45) problems.push(`lesson ${i} step ${s + 1}: a mesh moved ${worst.toFixed(0)} units in one frame`);
      await page.evaluate(() => window.__book.advance(300));
      await page.screenshot({ path: path.join(out, `${String(i).padStart(2, '0')}-${s + 1}.png`), timeout: 120000 });
    }
    // with the answer open the left page may scroll; the engine scrolls it to the answer, so this is a note, not a failure
    if (st.steps) row.answerScroll = (await page.evaluate(() => window.__book.state())).leftOverflow;
    report.push(row);
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ report, problems }, null, 2));
  console.log(JSON.stringify(report));
  console.log(problems.length ? problems.join('\n') : 'no problems');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
