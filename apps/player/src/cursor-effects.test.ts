import { describe, expect, it } from 'vitest';

import { CursorEffects } from './cursor-effects';

describe('cursor effects', () => {
  it('emits smoke only while active and expires it on game time', () => {
    const effects = new CursorEffects();
    effects.update(0, 0, { x: 10, y: 10 });
    expect(effects.smokePuffs).toHaveLength(0);

    effects.smokeActive = true;
    for (let timeMs = 0; timeMs <= 420; timeMs += 42) effects.update(timeMs, timeMs, { x: timeMs, y: 10 });
    expect(effects.smokePuffs).toHaveLength(11);

    effects.smokeActive = false;
    effects.update(2000, 2000, { x: 0, y: 0 });
    expect(effects.smokePuffs).toHaveLength(0);
  });

  it('keeps a bounded trail of recent cursor positions', () => {
    const effects = new CursorEffects();
    for (let timeMs = 0; timeMs < 200; timeMs += 4) effects.update(0, timeMs, { x: timeMs, y: 0 });
    expect(effects.cursorTrail.length).toBeLessThanOrEqual(28);
    expect(effects.cursorTrail.at(-1)?.x).toBeGreaterThan(180);

    // A stationary cursor adds no points and the old ones fade out.
    effects.update(0, 1000, { x: effects.cursorTrail.at(-1)!.x, y: 0 });
    expect(effects.cursorTrail).toHaveLength(0);
  });
});
