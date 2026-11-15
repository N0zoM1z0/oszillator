import { describe, expect, it } from 'vitest';

import { vec2 } from '@oszillator/core';

import { splitBezierSegments } from './bezier';
import { buildSliderPath, getSliderPolylineUntilDistance, getSliderPositionAtDistance, getSliderPositionAtProgress } from './path';

describe('buildSliderPath', () => {
  it('samples linear paths deterministically', () => {
    const path = buildSliderPath('L', [vec2(0, 0), vec2(100, 0), vec2(100, 100)]);

    expect(path.totalLength).toBeCloseTo(200);
    expect(getSliderPositionAtDistance(path, 50)).toEqual({ x: 50, y: 0 });
    expect(getSliderPositionAtDistance(path, 150)).toEqual({ x: 100, y: 50 });
  });

  it('trims rendered polylines to the osu pixel length', () => {
    const path = buildSliderPath('L', [vec2(0, 0), vec2(100, 0), vec2(200, 0)]);

    expect(getSliderPolylineUntilDistance(path, 150)).toEqual([vec2(0, 0), vec2(100, 0), vec2(150, 0)]);
    expect(getSliderPolylineUntilDistance(path, 100)).toEqual([vec2(0, 0), vec2(100, 0)]);
  });

  it('extends rendered polylines when osu pixel length exceeds sampled path length', () => {
    const path = buildSliderPath('L', [vec2(0, 0), vec2(100, 0)]);

    expect(getSliderPositionAtDistance(path, 150)).toEqual({ x: 150, y: 0 });
    expect(getSliderPolylineUntilDistance(path, 150)).toEqual([vec2(0, 0), vec2(100, 0), vec2(150, 0)]);
  });

  it('samples bezier paths through their endpoints', () => {
    const path = buildSliderPath('B', [vec2(0, 0), vec2(50, 100), vec2(100, 0)]);

    expect(path.sampledPoints[0]).toEqual({ x: 0, y: 0 });
    expect(path.sampledPoints.at(-1)).toEqual({ x: 100, y: 0 });
    expect(getSliderPositionAtProgress(path, 0.5).x).toBeCloseTo(50);
    expect(getSliderPositionAtProgress(path, 0.5).y).toBeCloseTo(50, 0);
  });

  it('splits bezier paths at repeated red-anchor control points', () => {
    const controlPoints = [vec2(0, 0), vec2(100, 0), vec2(100, 0), vec2(100, 100)];
    const path = buildSliderPath('B', controlPoints);

    expect(splitBezierSegments(controlPoints)).toEqual([
      [vec2(0, 0), vec2(100, 0)],
      [vec2(100, 0), vec2(100, 100)]
    ]);
    // Regression: the anchors used to be blended into one cubic curve (~180px).
    expect(path.totalLength).toBeCloseTo(200);
    expect(getSliderPositionAtDistance(path, 100)).toEqual({ x: 100, y: 0 });
    expect(getSliderPositionAtDistance(path, 150)).toEqual({ x: 100, y: 50 });
  });

  it('keeps curved bezier segments independent across red anchors', () => {
    const path = buildSliderPath('B', [vec2(0, 0), vec2(50, 50), vec2(100, 0), vec2(100, 0), vec2(150, -50), vec2(200, 0)]);

    expect(path.sampledPoints).toContainEqual({ x: 100, y: 0 });
    const midpoint = getSliderPositionAtProgress(path, 0.25);
    expect(midpoint.x).toBeCloseTo(50, 0);
    expect(midpoint.y).toBeCloseTo(25, 0);
  });

  it.each([
    ['downward', vec2(100, 100)],
    ['upward', vec2(100, -100)]
  ])('draws %s perfect-circle arcs through their middle control point', (_label, middle) => {
    const path = buildSliderPath('P', [vec2(0, 0), middle, vec2(200, 0)]);

    // Regression: one orientation used to sweep the opposite half circle.
    expect(path.totalLength).toBeCloseTo(Math.PI * 100, 0);
    const halfway = getSliderPositionAtProgress(path, 0.5);
    expect(halfway.x).toBeCloseTo(middle.x, 1);
    expect(halfway.y).toBeCloseTo(middle.y, 1);
  });

  it('draws major perfect-circle arcs the long way round', () => {
    const path = buildSliderPath('P', [vec2(0, 0), vec2(100, 0), vec2(100, 100)]);
    const radius = Math.SQRT2 * 50;

    expect(path.totalLength).toBeCloseTo(Math.PI * radius, 0);
    expect(path.sampledPoints.every((point) => Math.abs(Math.hypot(point.x - 50, point.y - 50) - radius) < 1e-6)).toBe(true);
  });

  it('falls back to bezier for degenerate perfect circles', () => {
    const path = buildSliderPath('P', [vec2(0, 0), vec2(50, 0), vec2(100, 0)]);

    expect(path.warnings).toContain('perfect-circle-fallback-bezier');
    expect(path.sampledPoints[0]).toEqual({ x: 0, y: 0 });
    expect(path.totalLength).toBeCloseTo(100);
  });

  it('treats perfect-circle sliders without exactly three points as bezier', () => {
    const path = buildSliderPath('P', [vec2(0, 0), vec2(100, 0), vec2(100, 0), vec2(100, 100)]);

    expect(path.warnings).toEqual([]);
    expect(path.totalLength).toBeCloseTo(200);
  });

  it('supports catmull curves without throwing', () => {
    const path = buildSliderPath('C', [vec2(0, 0), vec2(30, 20), vec2(60, 0), vec2(90, 40)]);

    expect(path.sampledPoints.length).toBeGreaterThan(20);
    expect(path.sampledPoints.at(-1)).toEqual({ x: 90, y: 40 });
  });
});
