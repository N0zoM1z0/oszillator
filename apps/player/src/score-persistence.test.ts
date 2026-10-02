import { describe, expect, it, vi } from 'vitest';
import type { LocalScoreRecord } from '@oszillator/storage';

import { RunScorePersistence } from './score-persistence';

const score: LocalScoreRecord = {
  id: 'one-run',
  difficultyId: 'map.osu',
  playedAt: 0,
  score: 300,
  accuracy: 1,
  maxCombo: 1,
  counts: { great: 1, ok: 0, meh: 0, miss: 0 }
};

describe('score persistence per run', () => {
  it('writes one score even when storage remains pending across repeated completion checks', async () => {
    let release!: () => void;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const persistence = new RunScorePersistence(save);
    const pending = persistence.saveOnce(score);
    for (let frame = 0; frame < 30; frame += 1) {
      expect(persistence.saveOnce(score)).toBeNull();
    }
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    release();
    await pending;
    expect(persistence.canSave).toBe(false);
  });

  it('keeps restarted runs independent of a previous pending completion', async () => {
    const releases: Array<() => void> = [];
    const saved: LocalScoreRecord[] = [];
    const persistence = new RunScorePersistence((record) => {
      saved.push(record);
      return new Promise<void>((resolve) => {
        releases.push(resolve);
      });
    });
    const first = persistence.saveOnce(score);
    persistence.startRun();
    const secondScore = { ...score, id: 'next-run', difficultyId: 'next.osu' };
    const second = persistence.saveOnce(secondScore);
    await Promise.resolve();
    releases[0]!();
    await first;
    expect(persistence.saveOnce(secondScore)).toBeNull();
    releases[1]!();
    await second;
    expect(saved).toEqual([score, secondScore]);
  });

  it('reports failure once and allows a new attempt only for a new run', async () => {
    const save = vi.fn().mockRejectedValue(new Error('disk unavailable'));
    const persistence = new RunScorePersistence(save);
    await expect(persistence.saveOnce(score)).rejects.toThrow('disk unavailable');
    expect(persistence.saveOnce(score)).toBeNull();
    persistence.startRun();
    await expect(persistence.saveOnce(score)).rejects.toThrow('disk unavailable');
    expect(save).toHaveBeenCalledTimes(2);
  });
});
