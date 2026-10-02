import type { LocalScoreRecord } from '@oszillator/storage';

// Each run gets one attempt. An old asynchronous completion cannot unlock the
// next run, and a failing dependency cannot trigger a new write every frame.
export class RunScorePersistence {
  private attempted = false;

  constructor(private readonly save: (score: LocalScoreRecord) => Promise<void>) {}

  get canSave(): boolean {
    return !this.attempted;
  }

  startRun(): void {
    this.attempted = false;
  }

  saveOnce(score: LocalScoreRecord): Promise<void> | null {
    if (this.attempted) {
      return null;
    }
    this.attempted = true;
    return Promise.resolve().then(() => this.save(score));
  }
}
