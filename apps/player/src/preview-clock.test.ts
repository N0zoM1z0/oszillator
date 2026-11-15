import { describe, expect, it } from 'vitest';

import { PreviewClock } from './preview-clock';

describe('preview clock', () => {
  it('advances only while running and resumes from where it stopped', () => {
    let now = 1000;
    const clock = new PreviewClock(() => now);

    expect(clock.timeMs()).toBe(0);
    clock.start(0);
    now += 500;
    expect(clock.timeMs()).toBe(500);
    clock.stop();
    now += 2000;
    expect(clock.active).toBe(false);
    expect(clock.timeMs()).toBe(500);
    clock.start();
    now += 250;
    expect(clock.timeMs()).toBe(750);
  });

  it('clamps negative start times and resets to zero', () => {
    const clock = new PreviewClock(() => 0);
    clock.start(-200);
    expect(clock.timeMs()).toBe(0);
    clock.stop(1200);
    clock.reset();
    expect(clock.timeMs()).toBe(0);
    expect(clock.active).toBe(false);
  });
});
