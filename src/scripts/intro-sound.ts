// Sound effects for the intro, synthesised with the Web Audio API: no audio files to download, and the
// same code renders the soundtrack for the MP4 export (OfflineAudioContext), so both sound identical.
// Noise uses a seeded generator, so every render is the same.

export type Cue =
  | { t: number; kind: 'tick' | 'thump' | 'pop' | 'shutter' | 'click' | 'hit' }
  | { t: number; kind: 'whoosh' | 'rise' | 'ratchet' | 'hum'; dur: number };

// Timeline cues in seconds; they mirror the keyframes in intro.ts. Typing ticks are added from the text.
export function buildCues(typeTicks: number[]): Cue[] {
  const cues: Cue[] = typeTicks.map((t) => ({ t, kind: 'tick' }));
  for (const t of [1.5, 7.5, 11.5, 16.5]) cues.push({ t, kind: 'thump' }); // background cuts
  for (const t of [4.0, 4.85, 5.7, 6.55]) cues.push({ t, kind: 'pop' }); // verbs
  cues.push(
    { t: 7.6, kind: 'hum', dur: 0.6 }, // ring draws in
    { t: 8.3, kind: 'ratchet', dur: 0.7 }, // blades open
    { t: 8.98, kind: 'shutter' },
    { t: 9.0, kind: 'whoosh', dur: 0.75 }, // push through
    { t: 9.9, kind: 'shutter' },
    { t: 10.45, kind: 'shutter' },
    { t: 11.0, kind: 'shutter' },
    { t: 12.3, kind: 'rise', dur: 1.8 }, // growth line
    { t: 14.6, kind: 'click' },
    { t: 15.0, kind: 'click' },
    { t: 16.6, kind: 'whoosh', dur: 0.5 }, // monogram strokes in
    { t: 17.35, kind: 'hit' }, // fills
    { t: 17.45, kind: 'click' }, // crossbars land
  );
  return cues.sort((a, b) => a.t - b.t);
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number, seed: number) {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < d.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    d[i] = (s / 4294967296) * 2 - 1;
  }
  return buf;
}

// Schedule every cue after `from` (timeline seconds) so that timeline time `from` lands at ctx time `at`.
export function schedule(ctx: BaseAudioContext, out: AudioNode, cues: Cue[], from: number, at: number) {
  const noise = noiseBuffer(ctx, 1, 7);
  const env = (g: GainNode, when: number, peak: number, attack: number, decay: number) => {
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  };
  const noiseHit = (when: number, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number, offset = 0) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    env(g, when, peak, 0.002, decay);
    src.connect(f).connect(g).connect(out);
    src.start(when, offset);
    src.stop(when + decay + 0.05);
  };
  const tone = (when: number, type: OscillatorType, f0: number, f1: number, peak: number, attack: number, decay: number) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, when);
    o.frequency.exponentialRampToValueAtTime(f1, when + attack + decay);
    const g = ctx.createGain();
    env(g, when, peak, attack, decay);
    o.connect(g).connect(out);
    o.start(when);
    o.stop(when + attack + decay + 0.05);
  };

  cues.forEach((c, i) => {
    if (c.t < from) return;
    const w = at + (c.t - from);
    switch (c.kind) {
      case 'tick': // a soft key
        noiseHit(w, 'bandpass', 3200 + (i % 3) * 300, 1.4, 0.16, 0.025, (i * 0.037) % 0.9);
        break;
      case 'thump': // a cut
        tone(w, 'sine', 120, 42, 0.42, 0.004, 0.22);
        noiseHit(w, 'lowpass', 900, 0.7, 0.05, 0.08);
        break;
      case 'pop':
        tone(w, 'sine', 720, 430, 0.18, 0.003, 0.09);
        break;
      case 'shutter': // two-part camera shutter
        noiseHit(w, 'highpass', 2200, 0.8, 0.32, 0.018, 0.1);
        tone(w, 'square', 180, 90, 0.05, 0.001, 0.03);
        noiseHit(w + 0.055, 'highpass', 1800, 0.8, 0.24, 0.03, 0.3);
        break;
      case 'click':
        noiseHit(w, 'bandpass', 5200, 2, 0.2, 0.012, 0.5);
        break;
      case 'hum': // the ring drawing in
        tone(w, 'triangle', 196, 262, 0.05, c.dur * 0.6, c.dur * 0.4);
        break;
      case 'ratchet': // aperture blades
        for (let k = 0, n = 9; k < n; k++) noiseHit(w + (k / n) * c.dur, 'bandpass', 2600 + k * 90, 3, 0.11, 0.012, (k * 0.071) % 0.9);
        break;
      case 'whoosh': {
        const src = ctx.createBufferSource();
        src.buffer = noise;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 0.9;
        f.frequency.setValueAtTime(300, w);
        f.frequency.exponentialRampToValueAtTime(2600, w + c.dur * 0.7);
        f.frequency.exponentialRampToValueAtTime(900, w + c.dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, w);
        g.gain.exponentialRampToValueAtTime(0.22, w + c.dur * 0.55);
        g.gain.exponentialRampToValueAtTime(0.0001, w + c.dur);
        src.connect(f).connect(g).connect(out);
        src.start(w, 0.2);
        src.stop(w + c.dur + 0.05);
        break;
      }
      case 'rise':
        tone(w, 'sine', 330, 660, 0.06, c.dur * 0.8, c.dur * 0.2);
        break;
      case 'hit': // warm open chord as the monogram fills
        for (const [f, p] of [[98, 0.2], [147, 0.12], [196, 0.1], [294, 0.06]] as const) tone(w, 'sine', f, f * 0.995, p, 0.01, 1.4);
        tone(w, 'sine', 110, 45, 0.3, 0.004, 0.25);
        break;
    }
  });
}

// The whole 18 s soundtrack as a 16-bit stereo WAV, for the MP4 export.
export async function renderWav(cues: Cue[], seconds: number, rate = 48000) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
  const master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  schedule(ctx, master, cues, 0, 0);
  const buf = await ctx.startRendering();
  const n = buf.length;
  const data = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o: number, s: string) => [...s].forEach((ch, i) => data.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF'); data.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 2, true);
  data.setUint32(24, rate, true); data.setUint32(28, rate * 4, true); data.setUint16(32, 4, true); data.setUint16(34, 16, true);
  str(36, 'data'); data.setUint32(40, n * 4, true);
  const l = buf.getChannelData(0), r = buf.getChannelData(1);
  for (let i = 0; i < n; i++) {
    data.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l[i])) * 32767, true);
    data.setInt16(46 + i * 4, Math.max(-1, Math.min(1, r[i])) * 32767, true);
  }
  return new Uint8Array(data.buffer);
}
