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

  it('emphasizes objects as they approach hit time without moving them', () => {
    const early = objectDepthStyle({ startTimeMs: 2000 }, 900, 1200);
    const near = objectDepthStyle({ startTimeMs: 2000 }, 1950, 1200);

    expect(near.alpha).toBeGreaterThan(early.alpha);
    expect(near.scale).toBeGreaterThan(early.scale);
    expect(near.ringAlpha).toBeGreaterThan(early.ringAlpha);
    expect(near.shadowAlpha).toBeGreaterThan(early.shadowAlpha);
  });
});
