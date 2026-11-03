// Synthesized cues (no audio files). Every cue has a visual equivalent in the UI.
const PREF_KEY = 'shift-tab:sound';
let ctx: AudioContext | null = null;
let enabled = localStorage.getItem(PREF_KEY) !== 'off';

function play(notes: number[], step: number, type: OscillatorType, volume: number) {
  if (!enabled || typeof AudioContext === 'undefined') return;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  notes.forEach((freq, i) => {
    const start = ctx!.currentTime + i * step;
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + step * 0.95);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(start);
    osc.stop(start + step);
  });
}

export const sound = {
  get enabled() {
    return enabled;
  },
  setEnabled(on: boolean) {
    enabled = on;
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
  },
  focus: () => play([1046], 0.035, 'sine', 0.035),
  barrier: () => play([233, 196], 0.11, 'triangle', 0.07),
  pass: () => play([523, 659, 784], 0.08, 'sine', 0.06),
  fail: () => play([330, 262], 0.12, 'triangle', 0.06),
  merge: () => play([523, 659, 784, 1046], 0.11, 'sine', 0.07),
};
