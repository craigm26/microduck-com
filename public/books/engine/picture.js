// The picture book's page turner. A reader without it gets the same spreads, one
// under the next, with every word on the page: this only hides all but one and
// turns between them. Every word stays in the document; nothing here writes one
// except the page count, and the same spread is read out in the live region.

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;
const main = document.querySelector('.pb-main');
const spreads = [...main.querySelectorAll('.pb-spread')];
const TURN = 720;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(cls, text, label) {
  const b = el('button', cls, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  return b;
}

// A screen too short to fit a spread keeps the plain scrolling page, which reads well there.
function start() {
  if (innerHeight < 430) return;
  root.classList.add('pb-live');
  const stage = el('div', 'pb-stage');
  stage.setAttribute('aria-label', 'The book');
  stage.tabIndex = -1;
  stage.append(...spreads);
  main.append(stage);
  const prevTap = button('pb-tap pb-tap-prev', 'Back', 'Back a page');
  const nextTap = button('pb-tap pb-tap-next', 'Next', 'Next page');
  prevTap.tabIndex = nextTap.tabIndex = -1;
  stage.append(prevTap, nextTap);
  const nav = el('nav', 'pb-nav');
  nav.setAttribute('aria-label', 'Turn the page');
  const prev = button('', 'Back', 'Back a page');
  const where = el('span', 'pb-where');
  const next = button('', 'Next', 'Next page');
  nav.append(prev, where, next);
  main.append(nav);
  const live = el('div', 'pb-announce');
  live.setAttribute('aria-live', 'polite');
  document.body.append(live);

  let spreadAt = 0, side = 0, paged = false, busy = false;

  function fit() {
    const barH = document.querySelector('.story-bar').offsetHeight;
    const h = Math.max(240, innerHeight - barH - nav.offsetHeight);
    const whole = Math.min(innerWidth, h * 1.5);
    paged = whole < 680;
    if (paged) {
      const w = Math.min(innerWidth, h * 0.75);
      root.style.setProperty('--pb-w', `${w}px`);
      root.style.setProperty('--pb-cw', `${w * 2}px`);
    } else {
      side = 0;
      root.style.setProperty('--pb-w', `${whole}px`);
      root.style.setProperty('--pb-cw', `${whole}px`);
    }
    root.style.setProperty('--pb-h', `${h}px`);
    show();
  }

  function preload(i) {
    const s = spreads[i];
    if (s) s.querySelector('.pb-art').loading = 'eager';
  }

  function show() {
    spreads.forEach((s, i) => {
      s.hidden = i !== spreadAt;
      s.classList.toggle('pb-on-right', i === spreadAt && paged && side === 1);
    });
    preload(spreadAt);
    preload(spreadAt + 1);
    preload(spreadAt - 1);
    const last = spreads.length - 1;
    prev.disabled = prevTap.disabled = spreadAt === 0 && side === 0;
    next.disabled = nextTap.disabled = spreadAt === last && (!paged || side === 1);
    const title = spreads[spreadAt].querySelector('.pb-title')?.textContent;
    where.textContent = spreadAt ? `${spreadAt} of ${last}: ${title}` : 'Title page';
  }

  function say() {
    live.textContent = [...spreads[spreadAt].querySelectorAll('.pb-title, .pb-words p, .pb-words h1')].map((n) => n.textContent).join(' ');
    history.replaceState(null, '', spreadAt ? `#spread-${spreadAt}` : location.pathname);
  }

  // The turning leaf is the two pictures cut in half: the right half of this
  // spread on its front, the left half of the next on its back.
  function turnTo(to) {
    const dir = to > spreadAt ? 1 : -1;
    const from = spreads[spreadAt], into = spreads[to];
    if (reduced || paged) { spreadAt = to; show(); say(); return; }
    busy = true;
    const box = from.getBoundingClientRect(), host = stage.getBoundingClientRect();
    const wrap = el('div', 'pb-turn');
    Object.assign(wrap.style, { left: `${box.left - host.left}px`, top: `${box.top - host.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    const art = (s) => `url("${s.querySelector('.pb-art').getAttribute('src')}")`;
    const half = (side_, s, extra = '') => {
      const h = el('div', `pb-half pb-half-${side_} ${extra}`);
      h.style.backgroundImage = art(s);
      return h;
    };
    const leaf = el('div', 'pb-leaf');
    leaf.style.left = dir > 0 ? '50%' : '0';
    leaf.style.transformOrigin = dir > 0 ? 'left center' : 'right center';
    const front = half(dir > 0 ? 'r' : 'l', from), back = half(dir > 0 ? 'l' : 'r', into, 'pb-back');
    front.style.left = back.style.left = '0';
    leaf.append(front, back);
    wrap.append(half(dir > 0 ? 'l' : 'r', from), leaf);
    const words = from.querySelector('.pb-words');
    words.classList.add('pb-quiet');
    stage.append(wrap);
    spreadAt = to;
    const anim = leaf.animate(
      [{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${dir > 0 ? -180 : 180}deg)` }],
      { duration: TURN, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'forwards' },
    );
    const incoming = into.querySelector('.pb-words');
    incoming.classList.add('pb-quiet');
    show();
    anim.onfinish = () => {
      wrap.remove();
      words.classList.remove('pb-quiet');
      incoming.classList.remove('pb-quiet');
      busy = false;
      say();
    };
  }

  function forward() {
    if (busy || next.disabled) return;
    if (paged && side === 0) { side = 1; show(); say(); return; }
    side = 0;
    turnTo(spreadAt + 1);
  }
  function back() {
    if (busy || prev.disabled) return;
    if (paged && side === 1) { side = 0; show(); say(); return; }
    if (paged) side = 1;
    turnTo(spreadAt - 1);
  }
  function jump(i) {
    spreadAt = Math.max(0, Math.min(spreads.length - 1, i));
    side = 0;
    show();
  }

  prev.addEventListener('click', back);
  next.addEventListener('click', forward);
  prevTap.addEventListener('click', back);
  nextTap.addEventListener('click', forward);
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest?.('a, input, textarea, select')) return;
    const onButton = e.target.closest?.('button');
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !onButton)) { e.preventDefault(); forward(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); back(); }
    else if (e.key === 'Home') { e.preventDefault(); jump(0); }
    else if (e.key === 'End') { e.preventDefault(); jump(spreads.length - 1); }
  });
  // A swipe is a turn; a drag that is mostly up and down leaves the page to scroll.
  let downX = null, downY = 0;
  stage.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; });
  stage.addEventListener('pointerup', (e) => {
    if (downX === null) return;
    const dx = e.clientX - downX, dy = e.clientY - downY;
    downX = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) forward(); else back(); }
  });
  stage.addEventListener('pointercancel', () => { downX = null; });
  addEventListener('resize', fit);
  addEventListener('hashchange', () => {
    const m = /^#spread-(\d+)$/.exec(location.hash);
    if (m) jump(Number(m[1]));
  });
  addEventListener('beforeprint', () => spreads.forEach((s) => { s.querySelector('.pb-art').loading = 'eager'; }));

  const m = /^#spread-(\d+)$/.exec(location.hash);
  if (m) spreadAt = Math.max(0, Math.min(spreads.length - 1, Number(m[1])));
  fit();
}

start();
