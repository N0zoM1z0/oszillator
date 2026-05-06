import { describe, expect, it } from 'vitest';

import { vec2 } from './math/vec2';
import {
  computePlayfieldTransform,
  playfieldToScreen,
  screenToPlayfield,
  PLAYFIELD_WIDTH
} from './playfield/playfield';
import { lowerBound, queryVisibleTimeRange, upperBound } from './search/binary-search';

describe('playfield transforms', () => {
  it('fits the playfield inside the viewport and preserves round trips', () => {
    const transform = computePlayfieldTransform({ width: 1280, height: 720 });
    const screenPosition = playfieldToScreen(transform, vec2(PLAYFIELD_WIDTH / 2, 192));
    const playfieldPosition = screenToPlayfield(transform, screenPosition);

    expect(transform.width).toBeLessThanOrEqual(1280);
    expect(transform.height).toBeLessThanOrEqual(720);
    expect(playfieldPosition.x).toBeCloseTo(256);
    expect(playfieldPosition.y).toBeCloseTo(192);
  });
});

describe('binary search helpers', () => {
  const objects = [{ time: 100 }, { time: 200 }, { time: 300 }, { time: 400 }];

  it('finds lower and upper bounds', () => {
    expect(lowerBound(objects, 250, (item) => item.time)).toBe(2);
    expect(upperBound(objects, 300, (item) => item.time)).toBe(3);
  });

  it('returns a visible range window', () => {
    expect(queryVisibleTimeRange(objects, 150, 350, (item) => item.time)).toEqual({
      startIndex: 1,
      endIndex: 3
    });
  });
});
