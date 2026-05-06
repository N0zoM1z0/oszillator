import { describe, expect, it } from 'vitest';

import { computePlayfieldTransform } from './playfield-transform';

describe('renderer playfield transform', () => {
  it('keeps 512x384 aspect ratio centered', () => {
    const transform = computePlayfieldTransform({ width: 1000, height: 500 });

    expect(transform.width / transform.height).toBeCloseTo(512 / 384);
    expect(transform.offsetX).toBeGreaterThan(0);
  });
});
