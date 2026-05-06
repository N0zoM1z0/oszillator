import { describe, expect, it } from 'vitest';

import { objectVisualColour } from './renderer';

describe('renderer colour mode', () => {
  const palette = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255]
  ] as const;

  it('uses one static object colour when dynamic colours are disabled', () => {
    expect(objectVisualColour(palette, 0, false, 0)).toEqual([56, 189, 248]);
    expect(objectVisualColour(palette, 1, false, 500)).toEqual([56, 189, 248]);
    expect(objectVisualColour(palette, 2, false, 1000)).toEqual([56, 189, 248]);
  });

  it('uses combo palette colours when dynamic colours are enabled', () => {
    expect(objectVisualColour(palette, 0, true, 0)).not.toEqual(objectVisualColour(palette, 1, true, 0));
  });
});
