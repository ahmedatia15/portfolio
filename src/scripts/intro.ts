// The 18-second intro. Loaded only when its section nears the viewport (see page.ts), never under
// reduced motion: then the CSS default, the final frame, simply stays.
//
// Web Animations API: no library to download, and every animation exposes currentTime, so one shared
// clock pauses, replays and seeks the whole thing frame by frame (the MP4 export relies on seek).
// Each element gets one animation spanning the full 18 s with keyframes at absolute times; typing is
// the one thing driven per frame, by writing growing substrings of the line.

import { buildCues, renderWav, schedule } from './intro-sound';

const D = 18; // seconds

const OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'; // strong ease-out: arrivals
const IN = 'cubic-bezier(0.7, 0, 0.84, 0)'; // quick ease-in: exits
const IRIS = 'cubic-bezier(0.5, 0, 0.15, 1)';
const PUSH = 'cubic-bezier(0.7, 0, 0.2, 1)';
const CUT = 0.001; // a hard cut is two keyframes this far apart

type Frame = [t: number, props: Keyframe, easing?: string];

// Typing windows (seconds) for each typed line, in DOM order.
const TYPE_WINDOWS: [number, number][] = [
  [0.25, 0.85], // Hi
  [1.75, 3.0], // I'm Ahmed Atia
  [11.7, 12.9], // And I measure what works.
];

export interface IntroController {
  duration: number;
  seek(seconds: number): void;
  play(): void;
  pause(): void;
  /** The sound effects as a base64 WAV (for the MP4 export). */
  renderAudio(): Promise<string>;
}

export function initIntro(section: HTMLElement) {
  const stage = section.querySelector<HTMLElement>('.intro-stage')!;
  // The aperture photos ship as <template>s; they are only fetched once the intro is running.
  stage.querySelectorAll<HTMLTemplateElement>('.in-photo > template').forEach((tpl) => tpl.replaceWith(tpl.content));
  const k = (name: string) => stage.querySelector<HTMLElement>(`[data-k="${name}"]`)!;
  const anims: Animation[] = [];

  const track = (el: Element, frames: Frame[]) => {
    const keyframes = frames.map(([t, props, easing]) => ({ ...props, offset: t / D, easing: easing ?? 'linear' }));
    const a = el.animate(keyframes, { duration: D * 1000, fill: 'both' });
    a.pause();
    anims.push(a);
  };

  // Visible from `on` to `off`, with hard cuts at both ends.
  const shown = (el: Element, on: number, off = D) => {
    const f: Frame[] = [[0, { opacity: 0 }], [on, { opacity: 0 }], [on + CUT, { opacity: 1 }]];
    if (off < D) f.push([off, { opacity: 1 }], [off + CUT, { opacity: 0 }]);
    f.push([D, { opacity: off < D ? 0 : 1 }]);
    track(el, f);
  };

  // ---- Backgrounds: charcoal and off-white alternate as cuts.
  track(k('bg'), [
    [0, { opacity: 0 }], [1.5, { opacity: 0 }], [1.5 + CUT, { opacity: 1 }],
    [7.5, { opacity: 1 }], [7.5 + CUT, { opacity: 0 }],
    [11.5, { opacity: 0 }], [11.5 + CUT, { opacity: 1 }],
    [16.5, { opacity: 1 }], [16.5 + CUT, { opacity: 0 }], [D, { opacity: 0 }],
  ]);

  // ---- 1. Hi (0 to 1.5)
  shown(k('hi'), 0, 1.5);
  shown(k('caret1'), 0.15, 1.5);

  // ---- 2. Name (1.5 to 4.0). TODO: silhouette, once Portfolio/09-Profile/ has the photo.
  shown(k('caret2'), 1.6, 3.3);
  track(k('name'), [
    [0, { opacity: 0, transform: 'none' }], [1.5, { opacity: 0, transform: 'none' }],
    [1.5 + CUT, { opacity: 1, transform: 'none' }], [3.82, { opacity: 1, transform: 'none' }, IN],
    [4.0, { opacity: 0, transform: 'translateY(-14%)' }], [D, { opacity: 0, transform: 'translateY(-14%)' }],
  ]);

  // ---- 3. Verbs (4.0 to 7.5): one every 0.85 s, an amber dot marking each change.
  shown(k('verbs'), 4.0, 7.5);
  const starts = [4.0, 4.85, 5.7, 6.55];
  starts.forEach((s, n) => {
    const next = starts[n + 1];
    const f: Frame[] = [
      [0, { opacity: 0, transform: 'translateY(45%)' }],
      [s, { opacity: 0, transform: 'translateY(45%)' }, OUT],
      [s + 0.28, { opacity: 1, transform: 'none' }],
    ];
    if (next) f.push([next - 0.13, { opacity: 1, transform: 'none' }, IN], [next, { opacity: 0, transform: 'translateY(-45%)' }]);
    f.push([D, next ? { opacity: 0, transform: 'translateY(-45%)' } : { opacity: 1, transform: 'none' }]);
    track(k(`verb${n}`), f);
  });
  track(k('dot'), [
    [0, { transform: 'scale(0)' }],
    ...starts.flatMap((s): Frame[] => [[s, { transform: 'scale(0.25)' }, OUT], [s + 0.26, { transform: 'scale(1)' }]]),
    [D, { transform: 'scale(1)' }],
  ]);

  // ---- 4. Aperture draws in closed (7.5 to 8.3), blades rotate open (8.3 to 9.0)
  shown(k('lensWrap'), 7.5, 11.5);
  track(k('ring'), [[0, { strokeDashoffset: 1 }], [7.6, { strokeDashoffset: 1 }, OUT], [8.15, { strokeDashoffset: 0 }], [9.35, { strokeDashoffset: 0, opacity: 1 }], [9.6, { strokeDashoffset: 0, opacity: 0 }], [D, { strokeDashoffset: 0, opacity: 0 }]]);
  stage.querySelectorAll('.in-blade').forEach((b) => {
    track(b, [
      [0, { opacity: 0, transform: 'rotate(0deg)' }],
      [7.9, { opacity: 0, transform: 'rotate(0deg)' }, OUT],
      [8.15, { opacity: 1, transform: 'rotate(0deg)' }],
      [8.3, { opacity: 1, transform: 'rotate(0deg)' }, IRIS],
      [9.0, { opacity: 1, transform: 'rotate(-40deg)' }],
      [9.35, { opacity: 1, transform: 'rotate(-40deg)' }],
      [9.6, { opacity: 0, transform: 'rotate(-40deg)' }],
      [D, { opacity: 0, transform: 'rotate(-40deg)' }],
    ]);
  });

  // ---- 5. Push through the opening (9.0 to 9.7), then four photos cut every 0.6 s
  track(k('lens'), [
    [0, { transform: 'scale(1)' }], [9.0, { transform: 'scale(1)' }, PUSH],
    [9.7, { transform: 'scale(2.1)' }], [11.5, { transform: 'scale(2.22)' }], [D, { transform: 'scale(2.22)' }],
  ]);
  shown(k('photo0'), 8.15, 9.9);
  shown(k('photo1'), 9.9, 10.45);
  shown(k('photo2'), 10.45, 11.0);
  shown(k('photo3'), 11.0, 11.5);

  // ---- 6. "And I measure what works." with a rising line (11.5 to 14.5)
  shown(k('measure'), 11.5, 14.5);
  shown(k('caret3'), 11.6, 13.3);
  track(k('growth'), [[0, { strokeDashoffset: 1 }], [12.3, { strokeDashoffset: 1 }, 'cubic-bezier(0.33, 0, 0.2, 1)'], [14.1, { strokeDashoffset: 0 }], [D, { strokeDashoffset: 0 }]]);

  // ---- 7. Title, then the question (14.5 to 16.5)
  shown(k('titleScene'), 14.5, 16.5);
  const rise = (el: Element, at: number) =>
    track(el, [[0, { opacity: 0, transform: 'translateY(35%)' }], [at, { opacity: 0, transform: 'translateY(35%)' }, OUT], [at + 0.38, { opacity: 1, transform: 'none' }], [D, { opacity: 1, transform: 'none' }]]);
  rise(k('role'), 14.6);
  rise(k('ask'), 15.0);

  // ---- 8. Monogram strokes in, fills, crossbars land; hold (16.5 to 18)
  shown(k('end'), 16.5);
  track(k('aa'), [
    [0, { strokeDashoffset: 1, strokeWidth: 1.2 }], [16.6, { strokeDashoffset: 1, strokeWidth: 1.2 }, OUT],
    [17.1, { strokeDashoffset: 0, strokeWidth: 1.2 }, OUT], [17.38, { strokeDashoffset: 0, strokeWidth: 6.5 }], [D, { strokeDashoffset: 0, strokeWidth: 6.5 }],
  ]);
  track(k('bars'), [[0, { opacity: 0, transform: 'translateY(-9px)' }], [17.32, { opacity: 0, transform: 'translateY(-9px)' }, OUT], [17.58, { opacity: 1, transform: 'none' }], [D, { opacity: 1, transform: 'none' }]]);
  track(k('final'), [[0, { opacity: 0, transform: 'translateY(30%)' }], [17.5, { opacity: 0, transform: 'translateY(30%)' }, OUT], [17.95, { opacity: 1, transform: 'none' }], [D, { opacity: 1, transform: 'none' }]]);

  // ---- Typing: growing substrings of whole grapheme clusters, so Arabic letters stay joined and
  // marks (shadda, tanween) never separate from their letter.
  const segmenter = 'Segmenter' in Intl ? new Intl.Segmenter(document.documentElement.lang, { granularity: 'grapheme' }) : null;
  const typed = [...stage.querySelectorAll<HTMLElement>('[data-type]')].map((el, n) => {
    const text = el.dataset.type!;
    const parts = segmenter ? [...segmenter.segment(text)].map((s) => s.segment) : [...text];
    return { el, parts, win: TYPE_WINDOWS[n], shown: -1 };
  });
  const renderTyping = (t: number) => {
    for (const ty of typed) {
      const [a, b] = ty.win;
      const n = t < a ? 0 : t >= b ? ty.parts.length : Math.min(ty.parts.length, Math.floor(((t - a) / (b - a)) * ty.parts.length) + 1);
      if (n !== ty.shown) {
        ty.el.textContent = ty.parts.slice(0, n).join('');
        ty.shown = n;
      }
    }
  };

  // ---- Sound: off until the visitor turns it on (browsers block sound that starts by itself, and the
  // site never plays sound without a click). Effects are scheduled from the current frame on play,
  // and dropped on pause or seek.
  const typeTicks = typed.flatMap((ty) => {
    const [a, b] = ty.win;
    return ty.parts.map((p, i) => (p.trim() ? a + (i * (b - a)) / ty.parts.length : -1)).filter((t) => t >= 0);
  });
  const cues = buildCues(typeTicks);
  let soundOn = false;
  let actx: AudioContext | null = null;
  let bus: GainNode | null = null;
  const stopAudio = () => {
    bus?.disconnect();
    bus = null;
  };
  const startAudio = () => {
    stopAudio();
    if (!soundOn || !actx || clock.playState !== 'running') return;
    bus = actx.createGain();
    bus.gain.value = 0.8;
    bus.connect(actx.destination);
    schedule(actx, bus, cues, now(), actx.currentTime + 0.03);
  };

  // ---- The clock
  const clock = anims[0];
  const now = () => Number(clock.currentTime ?? 0) / 1000;
  let raf = 0;
  const loop = () => {
    renderTyping(now());
    raf = clock.playState === 'running' ? requestAnimationFrame(loop) : 0;
  };

  const controls = section.querySelector<HTMLElement>('.intro-controls')!;
  const toggle = controls.querySelector<HTMLButtonElement>('[data-intro-toggle]')!;
  const replay = controls.querySelector<HTMLButtonElement>('[data-intro-replay]')!;
  const sound = controls.querySelector<HTMLButtonElement>('[data-intro-sound]')!;

  const setPaused = (paused: boolean) => {
    section.classList.toggle('is-paused', paused);
    toggle.setAttribute('aria-label', paused ? toggle.dataset.labelPlay! : toggle.dataset.labelPause!);
  };
  // A pause or seek before the first play (the visitor, or the MP4 export) cancels the autoplay.
  let started = false;
  let io: IntersectionObserver | null = null;
  const takeOver = () => {
    started = true;
    io?.disconnect();
  };

  const seek = (s: number) => {
    const ms = Math.max(0, Math.min(D, s)) * 1000;
    for (const a of anims) a.currentTime = ms;
    renderTyping(ms / 1000);
    startAudio();
  };
  const play = () => {
    if (now() >= D) seek(0);
    for (const a of anims) a.play();
    controls.hidden = false;
    toggle.hidden = false;
    replay.hidden = true;
    setPaused(false);
    if (!raf) raf = requestAnimationFrame(loop);
    startAudio();
  };
  const pause = () => {
    for (const a of anims) a.pause();
    stopAudio();
    setPaused(true);
    renderTyping(now());
  };

  clock.addEventListener('finish', () => {
    renderTyping(D);
    toggle.hidden = true;
    replay.hidden = false;
    setPaused(false);
  });

  toggle.addEventListener('click', () => (clock.playState === 'running' ? pause() : play()));
  sound.addEventListener('click', () => {
    soundOn = !soundOn;
    if (soundOn && !actx) actx = new AudioContext();
    if (soundOn) actx!.resume().then(startAudio);
    else stopAudio();
    section.classList.toggle('has-sound', soundOn);
    sound.setAttribute('aria-pressed', String(soundOn));
    sound.setAttribute('aria-label', soundOn ? sound.dataset.labelOff! : sound.dataset.labelOn!);
  });
  replay.addEventListener('click', () => {
    seek(0);
    play();
  });

  // Same timeline in both layouts: CSS re-lays the stage out (16:9 / 9:16); redraw the current frame.
  window.matchMedia('(max-width: 39.99em)').addEventListener('change', () => renderTyping(now()));

  // Until it plays, the stage keeps the finished frame (monogram and line) as its poster.
  seek(D);

  // Plays once, when at least half the stage is in view.
  io = new IntersectionObserver(
    (entries) => {
      if (started || !entries.some((e) => e.isIntersecting)) return;
      takeOver();
      seek(0);
      play();
    },
    { threshold: 0.5 },
  );
  io.observe(stage);

  const controller: IntroController = {
    duration: D,
    seek: (s) => (takeOver(), seek(s)),
    play: () => (takeOver(), play()),
    pause: () => (takeOver(), pause()),
    renderAudio: async () => {
      const wav = await renderWav(cues, D);
      let bin = '';
      for (let i = 0; i < wav.length; i += 0x8000) bin += String.fromCharCode(...wav.subarray(i, i + 0x8000));
      return btoa(bin);
    },
  };
  (section as HTMLElement & { intro?: IntroController }).intro = controller;
  return controller;
}
