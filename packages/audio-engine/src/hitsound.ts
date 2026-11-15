/** Plays a short synthesized click. Beatmap hitsound samples are not used yet. */
export const playHitsound = (context: AudioContext): void => {
  const when = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(520, when);
  gain.gain.setValueAtTime(0.001, when);
  gain.gain.exponentialRampToValueAtTime(0.08, when + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(when);
  oscillator.stop(when + 0.09);
};
