import { describe, expect, it } from 'vitest';

import { sliderVisualMetrics } from './renderer';

describe('slider visual metrics', () => {
  it('scales down short slider tails and tracks to avoid overlapping endpoint lobes', () => {
    const metrics = sliderVisualMetrics(36, 40);

    expect(metrics.isCompact).toBe(true);
    expect(metrics.endpointScale).toBeLessThan(0.6);
    expect(metrics.outerWidth).toBeLessThan(40);
  });

  it('keeps normal sliders at full endpoint scale', () => {
    const metrics = sliderVisualMetrics(180, 40);

    expect(metrics.isCompact).toBe(false);
    expect(metrics.endpointScale).toBe(1);
    expect(metrics.outerWidth).toBeCloseTo(62);
  });
});
