// Tiny synthesized sounds for puzzle feedback; no audio files to load.
let ctx: AudioContext | undefined;
function tone(freq: number, start: number, length: number, type: OscillatorType, volume: number) {
  if (!ctx) return;
  const osc = ctx.createOscillator(),
    gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + length + 0.02);
}
/** 'good': a rising chime. 'bad': a low thunk. 'done': a short fanfare. */
export function sfx(kind: 'good' | 'bad' | 'done' | 'click') {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    return;
  }
  tone(kind === 'bad' ? 140 : 320, 0, 0.08, 'square', 0.05);
  if (kind === 'good') {
    tone(660, 0.07, 0.18, 'triangle', 0.08);
    tone(880, 0.15, 0.25, 'triangle', 0.07);
  } else if (kind === 'bad') tone(98, 0.06, 0.3, 'sawtooth', 0.05);
  else if (kind === 'done')
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.08 + i * 0.1, 0.3, 'triangle', 0.08));
}
