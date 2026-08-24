// F26 — Rest Countdown Focus and Audio Cue.
//
// Browser audio lives here, isolated from the pure rest-cue state transition so
// the state machine can be tested without Web Audio. All calls are best-effort:
// an unsupported, suspended, denied, or throwing audio capability must never
// affect the workout mutation or expose a raw browser error.

type AudioContextConstructor = new () => AudioContext;

interface AudioWindow {
  AudioContext?: AudioContextConstructor;
  webkitAudioContext?: AudioContextConstructor;
}

function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as AudioWindow;
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

let audioContext: AudioContext | null = null;

// A warm descending two-note chime: two sine pitches below 700 Hz with a soft
// attack and release. Sine avoids the harsh square-wave character the spec
// prohibits, and the pitches stay below 700 Hz.
const FIRST_TONE_HZ = 523.25;
const SECOND_TONE_HZ = 392.0;
const TONE_DURATION = 0.38;
const OVERLAP = 0.1;

function scheduleTone(ctx: AudioContext, start: number, frequency: number, duration: number): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const peak = 0.16;
  const attack = 0.03;
  const release = 0.1;

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  gain.gain.setValueAtTime(peak, start + Math.max(attack, duration - release));
  gain.gain.linearRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);
}

function ensureContext(): AudioContext | null {
  try {
    const Ctx = getAudioContextConstructor();
    if (!Ctx) return null;
    if (!audioContext) audioContext = new Ctx();
    return audioContext;
  } catch {
    return null;
  }
}

function resumeContext(ctx: AudioContext): void {
  try {
    const result = ctx.resume();
    // Attach a rejection handler so an asynchronous resume failure cannot
    // become an unhandled promise rejection. There is no retry loop and no
    // user-facing error; preparation is silent and playback is best-effort.
    result?.catch(() => {});
  } catch {
    // Resume may throw synchronously in some implementations. Stay silent.
  }
}

export function prepareRestAudio(): void {
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    resumeContext(ctx);
  }
}

export function playRestCue(): void {
  const ctx = ensureContext();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") resumeContext(ctx);
    const now = ctx.currentTime;
    scheduleTone(ctx, now, FIRST_TONE_HZ, TONE_DURATION);
    scheduleTone(ctx, now + TONE_DURATION - OVERLAP, SECOND_TONE_HZ, TONE_DURATION);
  } catch {
    // Playback failure must never affect the workout flow.
  }
}
