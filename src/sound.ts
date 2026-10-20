// Alert chimes made with the Web Audio API — no audio files (PRD v2.5 §1).

type AC = typeof AudioContext;
let ctx: AudioContext | undefined;

function audio(): AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const C = (window as unknown as { AudioContext?: AC; webkitAudioContext?: AC }).AudioContext ?? (window as unknown as { webkitAudioContext?: AC }).webkitAudioContext;
  if (!C) return undefined;
  try {
    ctx ??= new C();
  } catch {
    return undefined;
  }
  return ctx;
}

/** Call from a click (sign-in counts): browsers only allow sound after the user has interacted. */
export function unlockAudio() {
  const c = audio();
  if (!c) return;
  void c.resume?.().catch(() => undefined);
  // A silent blip makes Safari treat the context as unlocked.
  const g = c.createGain();
  g.gain.value = 0;
  const o = c.createOscillator();
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + 0.01);
}

export const soundBlocked = () => {
  const c = audio();
  return !c || c.state !== 'running';
};

function tone(c: AudioContext, freq: number, at: number, dur: number, vol: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.05);
}

/** SOS: an urgent two-tone chime (twice). Critical: one softer chime. Returns false when the browser blocks sound. */
export function chime(kind: 'sos' | 'critical'): boolean {
  const c = audio();
  if (!c || c.state !== 'running') return false;
  const t = c.currentTime + 0.02;
  if (kind === 'sos') {
    for (let k = 0; k < 2; k++) {
      tone(c, 988, t + k * 0.5, 0.22, 0.35);
      tone(c, 740, t + k * 0.5 + 0.24, 0.24, 0.35);
    }
  } else tone(c, 660, t, 0.6, 0.18);
  return true;
}
