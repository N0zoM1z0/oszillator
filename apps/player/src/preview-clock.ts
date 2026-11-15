/**
 * Wall-clock timeline for the showcase preview. Browsers may refuse to start
 * audio before a user gesture, so the bundled showcase keeps animating on this
 * clock until real (authoritative) audio playback takes over.
 */
export class PreviewClock {
  private running = false;

  private startedAtMs = 0;

  private startTimeMs = 0;

  constructor(private readonly now: () => number = () => performance.now()) {}

  get active(): boolean {
    return this.running;
  }

  timeMs(): number {
    return this.running ? this.startTimeMs + this.now() - this.startedAtMs : this.startTimeMs;
  }

  start(timeMs = this.startTimeMs): void {
    this.running = true;
    this.startedAtMs = this.now();
    this.startTimeMs = Math.max(timeMs, 0);
  }

  stop(timeMs = this.timeMs()): void {
    this.running = false;
    this.startTimeMs = Math.max(timeMs, 0);
  }

  reset(): void {
    this.running = false;
    this.startTimeMs = 0;
  }
}
