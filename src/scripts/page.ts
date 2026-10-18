// Progressive behaviours: without JS every plate is visible, every video keeps the browser's
// native controls (no autoplay), tool tiles still lift on hover, and images keep the normal cursor.

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function reveals() {
  // Plates start hidden only once this script is running, so a failed load never hides content.
  document.documentElement.classList.add('js');
  const plates = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (reduceMotion() || !('IntersectionObserver' in window)) {
    plates.forEach((p) => p.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  plates.forEach((p) => io.observe(p));
}

function reels() {
  const videos = [...document.querySelectorAll<HTMLVideoElement>('video[data-reel]')];
  if (!videos.length) return;
  document.documentElement.classList.add('has-reels');

  // Posters are attached shortly before a clip scrolls into view, so they never compete with the hero.
  const attachPoster = (v: HTMLVideoElement) => {
    if (v.dataset.poster && !v.poster) v.poster = v.dataset.poster;
  };
  if ('IntersectionObserver' in window) {
    const near = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          attachPoster(e.target as HTMLVideoElement);
          near.unobserve(e.target);
        }
      },
      { rootMargin: '900px 0px' },
    );
    videos.forEach((v) => near.observe(v));
  } else {
    videos.forEach(attachPoster);
  }

  // Visitor's explicit pause wins over autoplay-in-view.
  const pausedByUser = new WeakSet<HTMLVideoElement>();

  const sync = (v: HTMLVideoElement) => {
    const fig = v.closest('.reel')!;
    const playBtn = fig.querySelector<HTMLButtonElement>('[data-reel-play]')!;
    const soundBtn = fig.querySelector<HTMLButtonElement>('[data-reel-sound]')!;
    const playing = !v.paused;
    fig.classList.toggle('is-playing', playing);
    playBtn.setAttribute('aria-label', playing ? playBtn.dataset.labelPause! : playBtn.dataset.labelPlay!);
    soundBtn.setAttribute('aria-pressed', String(!v.muted));
    soundBtn.setAttribute('aria-label', v.muted ? soundBtn.dataset.labelOn! : soundBtn.dataset.labelOff!);
    fig.classList.toggle('has-sound', !v.muted);
  };

  const play = (v: HTMLVideoElement) => {
    attachPoster(v);
    if (v.preload === 'none') v.preload = 'auto';
    v.play().catch(() => {});
  };

  for (const v of videos) {
    const fig = v.closest('.reel')!;
    v.controls = false;
    v.addEventListener('play', () => sync(v));
    v.addEventListener('pause', () => sync(v));
    v.addEventListener('volumechange', () => sync(v));

    fig.querySelector('[data-reel-play]')!.addEventListener('click', () => {
      if (v.paused) {
        pausedByUser.delete(v);
        play(v);
      } else {
        pausedByUser.add(v);
        v.pause();
      }
    });

    fig.querySelector('[data-reel-sound]')!.addEventListener('click', () => {
      const unmute = v.muted;
      // Only one clip speaks at a time.
      if (unmute) videos.forEach((o) => { if (o !== v) o.muted = true; });
      v.muted = !unmute;
      if (unmute && v.paused) { pausedByUser.delete(v); play(v); }
    });
    sync(v);
  }

  // Muted loops run only while on screen, and never on their own under reduced motion.
  if (reduceMotion() || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const v = e.target as HTMLVideoElement;
        if (e.isIntersecting && e.intersectionRatio >= 0.5) {
          if (!pausedByUser.has(v)) play(v);
        } else if (!v.paused) {
          v.pause();
        }
      }
    },
    { threshold: [0, 0.5] },
  );
  videos.forEach((v) => io.observe(v));
}

// Mouse and trackpad only: touch screens and reduced motion get static tiles and the normal cursor.
const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches && !reduceMotion();

// Tools: each tile tilts toward the cursor (the lift itself is CSS :hover).
function tilt() {
  if (!finePointer()) return;
  const MAX = 9; // degrees
  for (const tile of document.querySelectorAll<HTMLElement>('[data-tilt]')) {
    const face = tile.firstElementChild as HTMLElement;
    // Measured once on entry: the tile's own transform would otherwise feed back into the angle.
    let rect: DOMRect | null = null;
    let frame = 0;
    let px = 0;
    let py = 0;
    const clamp = (n: number) => Math.max(-0.5, Math.min(0.5, n));
    tile.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') rect = tile.getBoundingClientRect();
    });
    tile.addEventListener('pointermove', (e) => {
      if (!rect) return;
      px = clamp((e.clientX - rect.left) / rect.width - 0.5);
      py = clamp((e.clientY - rect.top) / rect.height - 0.5);
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        face.style.setProperty('--rx', `${(-py * 2 * MAX).toFixed(2)}deg`);
        face.style.setProperty('--ry', `${(px * 2 * MAX).toFixed(2)}deg`);
      });
    });
    tile.addEventListener('pointerleave', () => {
      rect = null;
      cancelAnimationFrame(frame);
      frame = 0;
      face.style.removeProperty('--rx');
      face.style.removeProperty('--ry');
    });
  }
}

// Galleries: a small VIEW label replaces the cursor over images and eases after the pointer.
function viewCursor() {
  const el = document.querySelector<HTMLElement>('.view-cursor');
  if (!el || !finePointer()) return;
  document.documentElement.classList.add('has-view');

  let x = 0, y = 0, tx = 0, ty = 0;
  let on = false;
  let raf = 0;

  const loop = () => {
    x += (tx - x) * 0.2;
    y += (ty - y) * 0.2;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    raf = on || Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(loop) : 0;
  };

  const update = (target: Element | null) => {
    const over = !!target?.closest('[data-view] .plate-frame');
    if (over && !on) {
      // Appear where the pointer is, then follow it.
      x = tx;
      y = ty;
    }
    if (over !== on) {
      on = over;
      el.classList.toggle('is-on', on);
    }
    if (on && !raf) raf = requestAnimationFrame(loop);
  };

  document.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      tx = e.clientX;
      ty = e.clientY;
      update(e.target as Element);
    },
    { passive: true },
  );
  // Scrolling moves images under a still pointer.
  let scrollFrame = 0;
  window.addEventListener(
    'scroll',
    () => {
      if (scrollFrame || (!on && !tx)) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        update(document.elementFromPoint(tx, ty));
      });
    },
    { passive: true },
  );
  document.documentElement.addEventListener('pointerleave', () => update(null));
}

// Galleries: each image opens larger in a native <dialog> (Esc, click anywhere, or Close to leave).
function lightbox() {
  const dlg = document.querySelector<HTMLDialogElement>('dialog.lightbox');
  if (!dlg || typeof dlg.showModal !== 'function') return;
  const stage = dlg.querySelector('.lightbox-stage')!;
  let opener: HTMLButtonElement | null = null;

  const open = (frame: Element, btn: HTMLButtonElement) => {
    // Same sources as the plate, re-picked for the full viewport.
    const pic = frame.querySelector('picture')!.cloneNode(true) as HTMLPictureElement;
    pic.querySelectorAll('source, img').forEach((el) => el.setAttribute('sizes', '100vw'));
    const img = pic.querySelector('img')!;
    img.loading = 'eager';
    img.removeAttribute('fetchpriority');
    stage.replaceChildren(pic);
    opener = btn;
    dlg.showModal();
  };

  for (const frame of document.querySelectorAll('[data-view] .plate-frame')) {
    const img = frame.querySelector('img');
    if (!img) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'plate-open';
    btn.setAttribute('aria-label', `${dlg.dataset.openLabel}: ${img.alt}`);
    btn.addEventListener('click', () => open(frame, btn));
    frame.append(btn);
  }

  dlg.addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => {
    stage.replaceChildren();
    opener?.focus({ preventScroll: true });
    opener = null;
  });
}

// The intro's code (and its photos) is fetched only once its stage enters the viewport, so nothing of it
// competes with the hero; until then the markup's final frame is the poster. Under reduced motion it is
// never fetched and that frame simply stays.
function intro() {
  const section = document.querySelector<HTMLElement>('[data-intro]');
  if (!section || reduceMotion() || !('IntersectionObserver' in window) || !('animate' in Element.prototype)) return;
  const near = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      near.disconnect();
      import('./intro').then((m) => m.initIntro(section));
    },
    { threshold: 0 },
  );
  near.observe(section.querySelector('.intro-stage')!);
}

export function initPage() {
  intro();
  reveals();
  reels();
  tilt();
  viewCursor();
  lightbox();
}
