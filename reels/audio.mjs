// Audio for reels: what the voice looks like per frame (loudness + spectrum bars), and the
// sound effects and beat a style asks for, synthesised so no sample files are needed.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

export const RATE = 44100;

export function decode(file) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "f32le", "-ac", "1", "-ar", String(RATE), "-"], { maxBuffer: 1 << 30 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

/** Per video frame: level (0–1, for mouths and glows) and `bands` spectrum bars (0–1). */
export function analyse(samples, fps, frames, bands = 52) {
  const size = 2048;
  const window = Float32Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  // Log-spaced bands over the range a voice lives in.
  const edges = Array.from({ length: bands + 1 }, (_, i) => 90 * Math.pow(7000 / 90, i / bands));
  const bin = (hz) => Math.max(1, Math.round((hz * size) / RATE));
  const re = new Float32Array(size), im = new Float32Array(size);
  const level = new Float32Array(frames), bars = [];
  let held = new Float32Array(bands);
  for (let f = 0; f < frames; f++) {
    const centre = Math.round((f / fps) * RATE);
    let sum = 0;
    for (let i = 0; i < size; i++) {
      const s = samples[centre - size / 2 + i] ?? 0;
      sum += s * s;
      re[i] = s * window[i];
      im[i] = 0;
    }
    fft(re, im);
    level[f] = Math.min(1, Math.sqrt(sum / size) * 5.5);
    const now = new Float32Array(bands);
    for (let b = 0; b < bands; b++) {
      let peak = 0;
      for (let k = bin(edges[b]); k <= Math.max(bin(edges[b]), bin(edges[b + 1]) - 1); k++) peak = Math.max(peak, Math.hypot(re[k], im[k]));
      // dB → 0–1, a little tilt so the high bands still move.
      const db = 20 * Math.log10(peak / (size / 4) + 1e-9) + (b / bands) * 14;
      const v = Math.min(1, Math.max(0, (db + 62) / 52));
      // Fast up, slow down — reads as "bouncing" rather than flicker.
      now[b] = v > held[b] ? v : held[b] * 0.82 + v * 0.18;
    }
    held = now;
    bars.push(Array.from(now, (v) => +v.toFixed(3)));
  }
  return { level: Array.from(level, (v) => +v.toFixed(3)), bars };
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j];
        const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

// ---- synth -------------------------------------------------------------

const square = (p) => (p % 1 < 0.5 ? 1 : -1);
const triangle = (p) => 4 * Math.abs((p % 1) - 0.5) - 1;
let seed = 7;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

function tone(out, at, length, hz, gain, wave = square, slide = 0) {
  const start = Math.round(at * RATE), n = Math.round(length * RATE);
  let phase = 0;
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / n;
    phase += (hz + slide * t) / RATE;
    const env = Math.min(1, i / 60) * Math.pow(1 - t, 2);
    out[start + i] += wave(phase) * env * gain;
  }
}

const SOUNDS = {
  // 8-bit typing blip; `pitch` 0–1 varies it a little per letter.
  blip: (out, at, e) => tone(out, at, 0.035, 820 + (e.pitch ?? 0.5) * 420, 0.05),
  // Quest done: quick rising arpeggio.
  chime: (out, at) => [523, 659, 784, 1047].forEach((hz, i) => tone(out, at + i * 0.07, 0.22, hz, 0.11)),
  // Level up: longer fanfare with a triangle bass under it.
  levelup: (out, at) => {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((hz, i) => tone(out, at + i * 0.085, 0.3, hz, 0.12));
    tone(out, at, 0.7, 131, 0.16, triangle);
  },
  // Scene change: filtered noise sweep.
  whoosh: (out, at) => {
    const start = Math.round(at * RATE), n = Math.round(0.38 * RATE);
    let lp = 0;
    for (let i = 0; i < n && start + i < out.length; i++) {
      const t = i / n, k = 0.04 + 0.5 * Math.sin(Math.PI * t);
      lp += k * (noise() - lp);
      out[start + i] += lp * Math.sin(Math.PI * t) * 0.32;
    }
  },
  // Card pop: short falling sine.
  pop: (out, at) => tone(out, at, 0.09, 900, 0.16, (p) => Math.sin(2 * Math.PI * p), -500),
  // Cursor tap: a short, dry click.
  click: (out, at) => {
    const start = Math.round(at * RATE);
    for (let i = 0; i < 0.025 * RATE && start + i < out.length; i++) out[start + i] += (noise() * 0.6 + Math.sin(i / 3)) * Math.exp(-i / 90) * 0.22;
  },
  // A counter digit rolling over.
  tick: (out, at) => tone(out, at, 0.018, 2400, 0.05, (p) => Math.sin(2 * Math.PI * p)),
  // Breaking-news sting under the first frame.
  sting: (out, at) => {
    tone(out, at, 0.5, 220, 0.12, triangle);
    tone(out, at + 0.02, 0.45, 330, 0.08, (p) => Math.sin(2 * Math.PI * p));
    SOUNDS.whoosh(out, at);
  },
};

Object.assign(SOUNDS, {
  // Variety-show boing: a sine that wobbles down.
  boing: (out, at) => {
    const start = Math.round(at * RATE), n = Math.round(0.42 * RATE);
    let phase = 0;
    for (let i = 0; i < n && start + i < out.length; i++) {
      const t = i / n;
      phase += (260 + 220 * Math.exp(-t * 4) * (1 + 0.35 * Math.sin(t * 60))) / RATE;
      out[start + i] += Math.sin(2 * Math.PI * phase) * Math.min(1, i / 80) * Math.pow(1 - t, 1.6) * 0.16;
    }
  },
  // A bright bell ding.
  ding: (out, at) => {
    tone(out, at, 0.7, 1568, 0.07, (p) => Math.sin(2 * Math.PI * p));
    tone(out, at, 0.5, 2349, 0.035, (p) => Math.sin(2 * Math.PI * p));
  },
  // A marker scribble: short bursts of band-limited noise.
  scribble: (out, at) => {
    const start = Math.round(at * RATE), n = Math.round(0.32 * RATE);
    let lp = 0;
    for (let i = 0; i < n && start + i < out.length; i++) {
      const t = i / n;
      lp += 0.35 * (noise() - lp);
      out[start + i] += lp * (0.5 + 0.5 * Math.sin(t * 70)) * Math.sin(Math.PI * t) * 0.12;
    }
  },
});

/** A slow airy pad for the aurora reel: soft chords that swell and fade, 8 seconds each. */
export function pad(length) {
  const out = new Float32Array(Math.ceil(length * RATE));
  const chords = [[220, 277.2, 329.6, 415.3], [196, 246.9, 293.7, 370], [174.6, 220, 261.6, 329.6], [196, 246.9, 311.1, 392]];
  const bar = 8;
  for (let b = 0; b * bar < length; b++) {
    const start = Math.round(b * bar * RATE), n = Math.round((bar + 2) * RATE);
    chords[b % chords.length].forEach((hz, j) => {
      for (let i = 0; i < n && start + i < out.length; i++) {
        const t = i / RATE, env = Math.sin(Math.PI * Math.min(1, i / n)) ** 2;
        out[start + i] += (Math.sin(2 * Math.PI * hz * t) + 0.3 * Math.sin(2 * Math.PI * hz * 2.001 * t)) * env * 0.07 * (1 + 0.2 * Math.sin(t * 0.7 + j));
      }
    });
  }
  return out;
}

/** Mixes events [{t, kind, ...}] into a mono track of `length` seconds. */
export function effects(events, length) {
  const out = new Float32Array(Math.ceil(length * RATE));
  for (const e of events) SOUNDS[e.kind]?.(out, e.t, e);
  return out;
}

/** A light news beat: kick, off-beat hats and a soft bass pulse, `bpm` beats per minute. */
export function beat(length, bpm = 104) {
  const out = new Float32Array(Math.ceil(length * RATE));
  const step = 60 / bpm;
  const bass = [110, 110, 87.3, 98];
  for (let b = 0, t = 0; t < length; b++, t = b * step) {
    // Kick: sine dropping from 120 Hz.
    const start = Math.round(t * RATE);
    for (let i = 0, phase = 0; i < 0.22 * RATE && start + i < out.length; i++) {
      phase += (48 + 90 * Math.exp(-i / 900)) / RATE;
      out[start + i] += Math.sin(2 * Math.PI * phase) * Math.exp(-i / 3500) * (b % 2 ? 0.25 : 0.4);
    }
    // Hat on the "and".
    const hat = Math.round((t + step / 2) * RATE);
    for (let i = 0; i < 0.04 * RATE && hat + i < out.length; i++) out[hat + i] += noise() * Math.exp(-i / 260) * 0.07;
    if (b % 2 === 0) tone(out, t, step * 1.8, bass[Math.floor(b / 4) % 4], 0.05, triangle);
  }
  return out;
}

export function writeWav(file, samples) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  writeFileSync(file, b);
}
