import { describe, expect, it } from 'vitest';

import { objectDepthStyle, sliderVisualMetrics } from './renderer';

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

  it('keeps object depth free of extra luminance changes', () => {
    const early = objectDepthStyle({ startTimeMs: 2000 }, 900, 1200);
    const near = objectDepthStyle({ startTimeMs: 2000 }, 1950, 1200);

    expect(early.alpha).toBe(1);
    expect(near.alpha).toBe(1);
    expect(early.ringAlpha).toBe(1);
    expect(near.ringAlpha).toBe(1);
    expect(early.shadowAlpha).toBe(near.shadowAlpha);
    expect(early.edgeWidth).toBe(near.edgeWidth);
    expect(near.scale).toBeGreaterThan(early.scale);
  });
});
