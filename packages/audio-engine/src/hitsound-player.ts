export type HitsoundKind = 'normal' | 'whistle' | 'finish' | 'clap';

export class HitsoundPlayer {
  constructor(private readonly context: AudioContext) {}

  play(kind: HitsoundKind = 'normal', whenSeconds = this.context.currentTime): void {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const frequency = kind === 'finish' ? 880 : kind === 'whistle' ? 660 : kind === 'clap' ? 440 : 520;

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, whenSeconds);
    gain.gain.setValueAtTime(0.001, whenSeconds);
    gain.gain.exponentialRampToValueAtTime(0.08, whenSeconds + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, whenSeconds + 0.08);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(whenSeconds);
    oscillator.stop(whenSeconds + 0.09);
  }
}
