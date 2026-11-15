import { describe, expect, it } from 'vitest';

import { mixColour, objectVisualColour } from './visuals';

describe('renderer colour mode', () => {
  const palette = [0xff0000, 0x00ff00, 0x0000ff];

  it('uses one static object colour when dynamic colours are disabled', () => {
    expect(objectVisualColour(palette, 0, false, 0)).toBe(0x38bdf8);
    expect(objectVisualColour(palette, 1, false, 500)).toBe(0x38bdf8);
    expect(objectVisualColour(palette, 2, false, 1000)).toBe(0x38bdf8);
  });

  it('uses combo palette colours when dynamic colours are enabled', () => {
    expect(objectVisualColour(palette, 0, true, 0)).not.toBe(objectVisualColour(palette, 1, true, 0));
  });

  it('blends packed colours channel by channel', () => {
    expect(mixColour(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mixColour(0x38bdf8, 0x38bdf8, 0.3)).toBe(0x38bdf8);
    expect(mixColour(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
  });
});
