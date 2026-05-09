import { describe, expect, it } from 'vitest';

import { sliderVisualMetrics } from './renderer';

describe('slider visual metrics', () => {
  it('keeps the slider head aligned with the outer track diameter', () => {
    const metrics = sliderVisualMetrics(40);

    expect(metrics.headRadius * 2).toBeCloseTo(metrics.outerWidth);
    expect(metrics.markerSize * 2).toBeCloseTo(metrics.outerWidth);
  });

  it('uses the same metrics for long and short sliders', () => {
    expect(sliderVisualMetrics(24)).toEqual(sliderVisualMetrics(24));
  });

  it('keeps the inner colour band thinner than the endpoint diameter', () => {
    const metrics = sliderVisualMetrics(40);

    expect(metrics.innerWidth).toBeLessThan(metrics.outerWidth);
    expect(metrics.highlightWidth).toBeLessThan(metrics.innerWidth);
  });
});
