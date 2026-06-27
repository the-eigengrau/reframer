/**
 * generate-audio.ts
 *
 * Programmatically generates all WAV files for Reframer's retro Game Boy
 * audio system. Uses raw PCM synthesis — no external audio dependencies.
 *
 * Outputs 44100Hz 16-bit mono WAV files to assets/audio/.
 *
 * Run: npx tsx scripts/generate-audio.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_DIR = join(__dirname, '..', 'assets', 'audio');

const SAMPLE_RATE = 44100;
const MAX_AMP = 0.25; // headroom — lower to match Game Boy output levels

// ─── WAV Writing ─────────────────────────────────────────────────────────────

function writeWav(filePath: string, samples: Float64Array): void {
  const numSamples = samples.length;
  const bitsPerSample = 16;
  const byteRate = SAMPLE_RATE * (bitsPerSample / 8);
  const dataSize = numSamples * (bitsPerSample / 8);
  const fileSize = 44 + dataSize;

  const buffer = Buffer.alloc(fileSize);
  let offset = 0;

  // RIFF header
  buffer.write('RIFF', offset); offset += 4;
  buffer.writeUInt32LE(fileSize - 8, offset); offset += 4;
  buffer.write('WAVE', offset); offset += 4;

  // fmt sub-chunk
  buffer.write('fmt ', offset); offset += 4;
  buffer.writeUInt32LE(16, offset); offset += 4;         // sub-chunk size
  buffer.writeUInt16LE(1, offset); offset += 2;          // PCM format
  buffer.writeUInt16LE(1, offset); offset += 2;          // mono
  buffer.writeUInt32LE(SAMPLE_RATE, offset); offset += 4;
  buffer.writeUInt32LE(byteRate, offset); offset += 4;
  buffer.writeUInt16LE(bitsPerSample / 8, offset); offset += 2; // block align
  buffer.writeUInt16LE(bitsPerSample, offset); offset += 2;

  // data sub-chunk
  buffer.write('data', offset); offset += 4;
  buffer.writeUInt32LE(dataSize, offset); offset += 4;

  // PCM samples — soft clip via tanh for natural Game Boy-style saturation
  for (let i = 0; i < numSamples; i++) {
    const softClipped = Math.tanh(samples[i] * 1.2);
    const int16 = Math.round(softClipped * 32767);
    buffer.writeInt16LE(int16, offset);
    offset += 2;
  }

  writeFileSync(filePath, buffer);
}

// ─── Oscillators ─────────────────────────────────────────────────────────────

/** Square wave with configurable duty cycle (Game Boy style — 50% is warmest) */
function squareWave(phase: number, duty = 0.5): number {
  const t = phase - Math.floor(phase);
  return t < duty ? 1 : -1;
}

/** White noise (unused — kept for reference) */
function noise(): number {
  return Math.random() * 2 - 1;
}

/** Game Boy-style 15-bit LFSR noise generator */
let lfsrState = 0x7FFF;
function gbNoise(): number {
  const bit = ((lfsrState >> 0) ^ (lfsrState >> 1)) & 1;
  lfsrState = (lfsrState >> 1) | (bit << 14);
  return bit ? 1 : -1;
}
function resetLfsr(): void {
  lfsrState = 0x7FFF;
}

// ─── ADSR Envelope ───────────────────────────────────────────────────────────

interface ADSR {
  attack: number;   // seconds
  decay: number;
  sustain: number;  // level 0-1
  release: number;
}

function envelope(t: number, duration: number, adsr: ADSR): number {
  const { attack, decay, sustain, release } = adsr;
  const releaseStart = duration - release;

  if (t < attack) {
    return t / attack;
  } else if (t < attack + decay) {
    return 1 - ((1 - sustain) * (t - attack) / decay);
  } else if (t < releaseStart) {
    return sustain;
  } else if (t < duration) {
    return sustain * (1 - (t - releaseStart) / release);
  }
  return 0;
}

// ─── Note Helpers ────────────────────────────────────────────────────────────

/** Convert MIDI note to frequency */
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Note name to MIDI mapping (octave 4 = middle)
const NOTE_MAP: Record<string, number> = {
  'C3': 48, 'D3': 50, 'E3': 52, 'F3': 53, 'G3': 55, 'A3': 57, 'B3': 59,
  'C4': 60, 'D4': 62, 'E4': 64, 'F4': 65, 'G4': 67, 'A4': 69, 'B4': 71,
  'C5': 72, 'D5': 74, 'E5': 76, 'F5': 77, 'G5': 79, 'A5': 81, 'B5': 83,
  'C6': 84,
  // Sharps/flats
  'Eb3': 51, 'Bb3': 58,
  'Eb4': 63, 'Bb4': 70, 'Ab4': 68, 'F#4': 66,
  'Eb5': 75, 'Bb5': 82, 'Ab5': 80, 'F#5': 78,
};

function noteFreq(name: string): number {
  const midi = NOTE_MAP[name];
  if (midi === undefined) throw new Error(`Unknown note: ${name}`);
  return midiToFreq(midi);
}

// ─── Synthesis Helpers ───────────────────────────────────────────────────────

interface ToneParams {
  freq: number;
  duration: number;
  duty?: number;
  volume?: number;
  adsr?: ADSR;
  vibrato?: { rate: number; depth: number };
  filterCutoff?: number;
}

function synthesizeTone(params: ToneParams): Float64Array {
  const {
    freq, duration,
    duty = 0.5,
    volume = MAX_AMP,
    adsr = { attack: 0.005, decay: 0.02, sustain: 0.7, release: 0.02 },
    vibrato,
    filterCutoff = 4000,
  } = params;

  const numSamples = Math.ceil(duration * SAMPLE_RATE);
  const samples = new Float64Array(numSamples);
  let phase = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    let currentFreq = freq;

    if (vibrato) {
      currentFreq += vibrato.depth * Math.sin(2 * Math.PI * vibrato.rate * t);
    }

    const env = envelope(t, duration, adsr);
    samples[i] = squareWave(phase, duty) * env * volume;
    phase += currentFreq / SAMPLE_RATE;
  }

  // Game Boy processing chain: bit-crush → 2-pass low-pass filter
  return gbProcess(samples, filterCutoff);
}

function synthesizeNoise(duration: number, volume: number, adsr: ADSR): Float64Array {
  resetLfsr(); // deterministic LFSR output per call
  const numSamples = Math.ceil(duration * SAMPLE_RATE);
  const samples = new Float64Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, duration, adsr);
    samples[i] = gbNoise() * env * volume;
  }

  // Game Boy processing chain: bit-crush → 2-pass low-pass (3500Hz for noise)
  return gbProcess(samples, 3500);
}

// ─── Game Boy Post-Processing ─────────────────────────────────────────────

/** 1-pole IIR low-pass filter — simulates Game Boy speaker rolloff */
function lowPassFilter(samples: Float64Array, cutoff: number): Float64Array {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / SAMPLE_RATE;
  const alpha = dt / (rc + dt);
  const out = new Float64Array(samples.length);
  out[0] = samples[0];
  for (let i = 1; i < samples.length; i++) {
    out[i] = out[i - 1] + alpha * (samples[i] - out[i - 1]);
  }
  return out;
}

/** Bit-crush — quantize to N-bit depth (Game Boy DAC = 4-bit = 16 levels) */
function bitCrush(samples: Float64Array, bits = 4): Float64Array {
  const levels = Math.pow(2, bits);
  const out = new Float64Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    out[i] = Math.round(samples[i] * levels) / levels;
  }
  return out;
}

/** Apply the full Game Boy processing chain: bit-crush → 2-pass low-pass */
function gbProcess(samples: Float64Array, cutoff: number): Float64Array {
  let result = bitCrush(samples, 4);
  result = lowPassFilter(result, cutoff);
  result = lowPassFilter(result, cutoff); // 2-pass = -12dB/octave
  return result;
}

function concatenate(...arrays: Float64Array[]): Float64Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Float64Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function mix(a: Float64Array, b: Float64Array): Float64Array {
  const length = Math.max(a.length, b.length);
  const result = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    const va = i < a.length ? a[i] : 0;
    const vb = i < b.length ? b[i] : 0;
    result[i] = va + vb;
  }
  return result;
}

function silence(duration: number): Float64Array {
  return new Float64Array(Math.ceil(duration * SAMPLE_RATE));
}

// ─── Seikilos Epitaph ────────────────────────────────────────────────────────
//
// The Seikilos Epitaph (~1st century AD) — the oldest surviving complete
// musical composition. Found engraved on a tombstone near Aidin, Turkey.
//
// Original notation uses Ancient Greek musical symbols in the Phrygian
// tonos. This arrangement uses a simplified transcription rendered as
// an 8-bit chiptune with Game Boy-style square waves.
//
// Melody transcription based on the standard scholarly reconstruction:
// "Hoson zes, phainou..." (While you live, shine...)

function generateSeikilos(): Float64Array {
  // Short jingle based on the opening phrase of the Seikilos Epitaph
  // "Hoson zes, phainou" — While you live, shine
  const Q = 0.38;   // quarter note (slightly faster for a jingle)
  const H = Q * 2;  // half note
  const E = Q / 2;  // eighth note

  // Just the iconic opening line — enough to be recognizable
  const melody: [string, number][] = [
    ['E4', Q], ['F4', E], ['G4', E], ['A4', Q], ['G4', Q],
    ['A4', E], ['G4', E], ['F4', Q], ['E4', H],
  ];

  const noteAdsr: ADSR = { attack: 0.015, decay: 0.05, sustain: 0.6, release: 0.06 };
  const parts: Float64Array[] = [];

  for (const [note, dur] of melody) {
    const freq = noteFreq(note);
    const tone = synthesizeTone({
      freq,
      duration: dur * 0.95,  // tighter gap between notes
      duty: 0.50,
      volume: 0.18,
      adsr: noteAdsr,
    });
    const gap = silence(dur * 0.05);
    parts.push(tone, gap);
  }

  return concatenate(...parts);
}

// ─── Sound Effects ───────────────────────────────────────────────────────────

function generateMenuSelect(): Float64Array {
  // Short square wave blip — 500Hz, fast attack/decay
  return synthesizeTone({
    freq: 500,
    duration: 0.05,
    duty: 0.25,
    volume: 0.15,
    adsr: { attack: 0.005, decay: 0.03, sustain: 0.3, release: 0.015 },
  });
}

function generateStepComplete(): Float64Array {
  // Ascending 3-note arpeggio: C-E-G (octave 4)
  const adsr: ADSR = { attack: 0.008, decay: 0.03, sustain: 0.5, release: 0.03 };
  const dur = 0.065;
  return concatenate(
    synthesizeTone({ freq: noteFreq('C4'), duration: dur, duty: 0.25, volume: 0.15, adsr }),
    synthesizeTone({ freq: noteFreq('E4'), duration: dur, duty: 0.25, volume: 0.15, adsr }),
    synthesizeTone({ freq: noteFreq('G4'), duration: dur, duty: 0.25, volume: 0.15, adsr }),
  );
}

function generateAIReady(): Float64Array {
  // Two-tone chime: E-G (octave 4)
  const adsr: ADSR = { attack: 0.008, decay: 0.08, sustain: 0.4, release: 0.08 };
  return concatenate(
    synthesizeTone({ freq: noteFreq('E4'), duration: 0.15, duty: 0.25, volume: 0.15, adsr }),
    synthesizeTone({ freq: noteFreq('G4'), duration: 0.15, duty: 0.25, volume: 0.15, adsr }),
  );
}

function generateLevelUp(): Float64Array {
  // Ascending scale C-E-G-C' with vibrato on the final note
  const adsr: ADSR = { attack: 0.010, decay: 0.04, sustain: 0.6, release: 0.05 };
  const dur = 0.18;
  return concatenate(
    synthesizeTone({ freq: noteFreq('C4'), duration: dur, duty: 0.50, volume: 0.20, adsr }),
    synthesizeTone({ freq: noteFreq('E4'), duration: dur, duty: 0.50, volume: 0.20, adsr }),
    synthesizeTone({ freq: noteFreq('G4'), duration: dur, duty: 0.50, volume: 0.20, adsr }),
    synthesizeTone({
      freq: noteFreq('C5'), duration: dur * 1.5, duty: 0.50, volume: 0.22, adsr,
      vibrato: { rate: 6, depth: 8 },
    }),
  );
}

function generateThunder(): Float64Array {
  // LFSR noise burst with heavy decay — Game Boy thunder crack
  return synthesizeNoise(0.5, 0.12, {
    attack: 0.015,
    decay: 0.15,
    sustain: 0.10,
    release: 0.35,
  });
}

function generateClearing(): Float64Array {
  // Soft descending tone + noise fade
  const adsr: ADSR = { attack: 0.01, decay: 0.15, sustain: 0.3, release: 0.15 };
  const tone = synthesizeTone({
    freq: noteFreq('G4'), duration: 0.4, duty: 0.5, volume: 0.12, adsr,
  });
  const noisePart = synthesizeNoise(0.4, 0.06, {
    attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.2,
  });
  return mix(tone, noisePart);
}

function generateSunny(): Float64Array {
  // Warm ascending major arpeggio: C-E-G-C' (octave 4)
  const adsr: ADSR = { attack: 0.008, decay: 0.05, sustain: 0.5, release: 0.05 };
  const dur = 0.12;
  return concatenate(
    synthesizeTone({ freq: noteFreq('C4'), duration: dur, duty: 0.25, volume: 0.15, adsr }),
    synthesizeTone({ freq: noteFreq('E4'), duration: dur, duty: 0.25, volume: 0.15, adsr }),
    synthesizeTone({ freq: noteFreq('G4'), duration: dur, duty: 0.25, volume: 0.15, adsr }),
    synthesizeTone({ freq: noteFreq('C5'), duration: dur * 1.3, duty: 0.25, volume: 0.17, adsr }),
  );
}

function generateError(): Float64Array {
  // Descending two-tone: E-C
  const adsr: ADSR = { attack: 0.008, decay: 0.04, sustain: 0.4, release: 0.03 };
  return concatenate(
    synthesizeTone({ freq: noteFreq('E4'), duration: 0.1, duty: 0.5, volume: 0.15, adsr }),
    synthesizeTone({ freq: noteFreq('C4'), duration: 0.1, duty: 0.5, volume: 0.15, adsr }),
  );
}

function generateFarewell(): Float64Array {
  // Gentle descending three-note: G-E-C
  const adsr: ADSR = { attack: 0.012, decay: 0.06, sustain: 0.4, release: 0.08 };
  const dur = 0.1;
  return concatenate(
    synthesizeTone({ freq: noteFreq('G4'), duration: dur, duty: 0.50, volume: 0.12, adsr }),
    synthesizeTone({ freq: noteFreq('E4'), duration: dur, duty: 0.50, volume: 0.12, adsr }),
    synthesizeTone({ freq: noteFreq('C4'), duration: dur * 1.2, duty: 0.50, volume: 0.10, adsr }),
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const sounds: [string, () => Float64Array][] = [
    ['seikilos', generateSeikilos],
    ['menu-select', generateMenuSelect],
    ['step-complete', generateStepComplete],
    ['ai-ready', generateAIReady],
    ['level-up', generateLevelUp],
    ['thunder', generateThunder],
    ['clearing', generateClearing],
    ['sunny', generateSunny],
    ['error', generateError],
    ['farewell', generateFarewell],
  ];

  console.log('Generating audio files...\n');

  let totalSize = 0;

  for (const [name, generate] of sounds) {
    const samples = generate();
    const filePath = join(OUTPUT_DIR, `${name}.wav`);
    writeWav(filePath, samples);

    const sizeKB = (44 + samples.length * 2) / 1024;
    totalSize += sizeKB;
    const durationMs = Math.round((samples.length / SAMPLE_RATE) * 1000);

    console.log(`  ${name}.wav  ${durationMs}ms  ${sizeKB.toFixed(1)}KB`);
  }

  console.log(`\nTotal: ${totalSize.toFixed(1)}KB → ${OUTPUT_DIR}`);
}

main();
