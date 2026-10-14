import { publicUrl } from "./public-url";

type Mixer = {
  ctx: AudioContext;
  master: GainNode;
  sfx: GainNode;
};

let mixer: Mixer | null = null;
let muted = false;

function ensure(): Mixer | null {
  if (typeof window === "undefined") return null;
  const legacy = globalThis as { webkitAudioContext?: typeof AudioContext };
  const AC = globalThis.AudioContext ?? legacy.webkitAudioContext;
  if (!AC) return null;
  if (!mixer) {
    const ctx = new AC();
    const master = ctx.createGain();
    const sfx = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    sfx.gain.value = 0.8;
    sfx.connect(master);
    master.connect(ctx.destination);
    mixer = { ctx, master, sfx };
  }
  if (mixer.ctx.state === "suspended") void mixer.ctx.resume();
  return mixer;
}

const VERY_NICE = publicUrl("/sfx/very-nice.mp3");
const WHAT = publicUrl("/sfx/what.mp3");

const clips = new Map<string, AudioBuffer>();
const clipLoads = new Map<string, Promise<AudioBuffer | null>>();

function loadClip(url: string): Promise<AudioBuffer | null> {
  const ready = clips.get(url);
  if (ready) return Promise.resolve(ready);
  const pending = clipLoads.get(url);
  if (pending) return pending;
  const mix = ensure();
  if (!mix) return Promise.resolve(null);
  const job = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`clip ${res.status}`);
      return res.arrayBuffer();
    })
    .then((bytes) => mix.ctx.decodeAudioData(bytes))
    .then((buffer) => {
      clips.set(url, buffer);
      return buffer;
    })
    .catch(() => null);
  clipLoads.set(url, job);
  return job;
}

function playClip(url: string): void {
  const mix = ensure();
  if (!mix || muted) return;
  const start = (buffer: AudioBuffer) => {
    if (muted) return;
    const src = mix.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(mix.sfx);
    src.start();
    src.onended = () => src.disconnect();
  };
  const ready = clips.get(url);
  if (ready) {
    start(ready);
    return;
  }
  void loadClip(url).then((buffer) => {
    if (buffer) start(buffer);
  });
}

export function unlockAudio(): void {
  ensure();
  void loadClip(VERY_NICE);
  void loadClip(WHAT);
}

export function setMuted(next: boolean): void {
  muted = next;
  if (!mixer) return;
  mixer.master.gain.setTargetAtTime(next ? 0 : 1, mixer.ctx.currentTime, 0.02);
}

export function resumeAudio(): void {
  if (mixer && mixer.ctx.state === "suspended") void mixer.ctx.resume();
}

function tone(
  bus: GainNode,
  ctx: AudioContext,
  freq: number,
  when: number,
  duration: number,
  gain: number,
  type: OscillatorType = "sine",
): void {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), when + 0.018);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(amp);
  amp.connect(bus);
  osc.start(when);
  osc.stop(when + duration + 0.03);
  osc.onended = () => {
    osc.disconnect();
    amp.disconnect();
  };
}

function play(notes: Array<[number, number, number, OscillatorType?]>, stagger = 0.09): void {
  const mix = ensure();
  if (!mix || muted) return;
  const now = mix.ctx.currentTime + 0.01;
  notes.forEach(([freq, dur, gain, type], index) => {
    tone(mix.sfx, mix.ctx, freq, now + index * stagger, dur, gain, type ?? "sine");
  });
}

export function playStart(): void {
  play([
    [392, 0.14, 0.12],
    [494, 0.14, 0.12],
    [587, 0.22, 0.14],
  ]);
}

export function playPlace(index: number): void {
  const freq = 440 * 2 ** ((index % 8) / 12);
  play([[freq, 0.12, 0.1, "triangle"]], 0);
}

export function playSuccess(): void {
  playClip(VERY_NICE);
}

export function playMiss(): void {
  playClip(WHAT);
}

export function playMilestone(): void {
  play([
    [523, 0.12, 0.12],
    [659, 0.12, 0.12],
    [784, 0.12, 0.13],
    [1046, 0.28, 0.14],
  ]);
}

export function playTick(): void {
  play([[880, 0.05, 0.05, "square"]], 0);
}
