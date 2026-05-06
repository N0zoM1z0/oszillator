import { describe, expect, it } from 'vitest';

import { vec2 } from '@oszillator/core';

import { buildSliderPath, getSliderPolylineUntilDistance, getSliderPositionAtDistance, getSliderPositionAtProgress } from './path';

describe('buildSliderPath', () => {
  it('samples linear paths deterministically', () => {
    const path = buildSliderPath('L', [vec2(0, 0), vec2(100, 0), vec2(100, 100)]);

    expect(path.totalLength).toBeCloseTo(200);
    expect(getSliderPositionAtDistance(path, 50)).toEqual({ x: 50, y: 0 });
  });

  it('trims rendered polylines to the osu pixel length', () => {
    const path = buildSliderPath('L', [vec2(0, 0), vec2(100, 0), vec2(200, 0)]);

    expect(getSliderPolylineUntilDistance(path, 150)).toEqual([vec2(0, 0), vec2(100, 0), vec2(150, 0)]);
  });

  it('extends rendered polylines when osu pixel length exceeds sampled path length', () => {
    const path = buildSliderPath('L', [vec2(0, 0), vec2(100, 0)]);

    expect(getSliderPositionAtDistance(path, 150)).toEqual({ x: 150, y: 0 });
    expect(getSliderPolylineUntilDistance(path, 150)).toEqual([vec2(0, 0), vec2(100, 0), vec2(150, 0)]);
  });

  it('samples bezier paths', () => {
    const path = buildSliderPath('B', [vec2(0, 0), vec2(50, 100), vec2(100, 0)]);

    expect(path.sampledPoints).toHaveLength(97);
    expect(getSliderPositionAtProgress(path, 0.5).y).toBeGreaterThan(40);
  });

  it('falls back safely for degenerate perfect circles', () => {
    const path = buildSliderPath('P', [vec2(0, 0), vec2(50, 0), vec2(100, 0)]);

    expect(path.warnings).toContain('perfect-circle-fallback-linear');
    expect(path.sampledPoints[0]).toEqual({ x: 0, y: 0 });
  });

  it('supports catmull curves without throwing', () => {
    const path = buildSliderPath('C', [vec2(0, 0), vec2(30, 20), vec2(60, 0), vec2(90, 40)]);

    expect(path.sampledPoints.length).toBeGreaterThan(20);
  });
});
