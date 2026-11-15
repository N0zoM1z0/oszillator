import { distanceVec2, lerpVec2, vec2, type Vec2 } from '@oszillator/core';

import { sampleBezierPath } from './bezier';
import { sampleCatmullPath } from './catmull';
import { samplePerfectCirclePath } from './perfect-circle';

export type SliderCurveType = 'L' | 'B' | 'P' | 'C';

export type SliderPath = {
  curveType: SliderCurveType;
  sampledPoints: Vec2[];
  cumulativeLengths: number[];
  totalLength: number;
  warnings: string[];
};

const buildCumulativeLengths = (points: readonly Vec2[]): number[] => {
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(cumulative[index - 1]! + distanceVec2(points[index - 1]!, points[index]!));
  }
  return cumulative;
};

const samplePath = (curveType: SliderCurveType, controlPoints: readonly Vec2[], warnings: string[]): Vec2[] => {
  if (controlPoints.length < 2) {
    warnings.push('degenerate-control-points');
    return controlPoints.length === 0 ? [vec2(0, 0)] : [...controlPoints];
  }

  switch (curveType) {
    case 'B':
      return sampleBezierPath(controlPoints);
    case 'C':
      return sampleCatmullPath(controlPoints);
    case 'P': {
      const arc = samplePerfectCirclePath(controlPoints);
      if (arc) return arc;
      if (controlPoints.length === 3) warnings.push('perfect-circle-fallback-bezier');
      return sampleBezierPath(controlPoints);
    }
    case 'L':
      return [...controlPoints];
  }
};

export const buildSliderPath = (curveType: SliderCurveType, controlPoints: readonly Vec2[]): SliderPath => {
  const warnings: string[] = [];
  const sampledPoints = samplePath(curveType, controlPoints, warnings);
  const cumulativeLengths = buildCumulativeLengths(sampledPoints);

  return {
    curveType,
    sampledPoints,
    cumulativeLengths,
    totalLength: cumulativeLengths[cumulativeLengths.length - 1] ?? 0,
    warnings
  };
};

/** Index of the first sampled point whose cumulative length is >= distance. */
const segmentEndIndex = (path: SliderPath, distance: number): number => {
  let low = 1;
  let high = path.cumulativeLengths.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (path.cumulativeLengths[middle]! < distance) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
};

const interpolateSegment = (path: SliderPath, endIndex: number, distance: number): Vec2 => {
  const previousDistance = path.cumulativeLengths[endIndex - 1]!;
  const span = path.cumulativeLengths[endIndex]! - previousDistance || 1;
  return lerpVec2(path.sampledPoints[endIndex - 1]!, path.sampledPoints[endIndex]!, (distance - previousDistance) / span);
};

/**
 * Position at an arc-length distance along the path. Distances beyond the
 * sampled path extend the final direction, matching osu! sliders whose pixel
 * length exceeds their control points.
 */
export const getSliderPositionAtDistance = (path: SliderPath, distance: number): Vec2 => {
  const first = path.sampledPoints[0];
  if (!first) {
    return vec2(0, 0);
  }
  if (distance <= 0 || path.sampledPoints.length === 1) {
    return first;
  }
  if (distance >= path.totalLength) {
    return extrapolateAfterPathEnd(path, distance);
  }
  return interpolateSegment(path, segmentEndIndex(path, distance), distance);
};

export const getSliderPositionAtProgress = (path: SliderPath, progress: number): Vec2 =>
  getSliderPositionAtDistance(path, path.totalLength * Math.min(Math.max(progress, 0), 1));

/** The sampled polyline trimmed (or extended) to exactly `distance`. */
export const getSliderPolylineUntilDistance = (path: SliderPath, distance: number): Vec2[] => {
  const first = path.sampledPoints[0];
  if (!first) {
    return [];
  }
  if (distance <= 0 || path.sampledPoints.length === 1) {
    return [first];
  }
  if (distance >= path.totalLength) {
    const points = [...path.sampledPoints];
    if (distance > path.totalLength) {
      points.push(extrapolateAfterPathEnd(path, distance));
    }
    return points;
  }

  const endIndex = segmentEndIndex(path, distance);
  const points = path.sampledPoints.slice(0, endIndex);
  points.push(path.cumulativeLengths[endIndex] === distance ? path.sampledPoints[endIndex]! : interpolateSegment(path, endIndex, distance));
  return points;
};

const extrapolateAfterPathEnd = (path: SliderPath, distance: number): Vec2 => {
  const last = path.sampledPoints[path.sampledPoints.length - 1]!;
  const overshoot = distance - path.totalLength;
  if (overshoot <= 0) {
    return last;
  }

  for (let index = path.sampledPoints.length - 2; index >= 0; index -= 1) {
    const previous = path.sampledPoints[index]!;
    const length = distanceVec2(previous, last);
    if (length > 0.001) {
      return vec2(last.x + ((last.x - previous.x) / length) * overshoot, last.y + ((last.y - previous.y) / length) * overshoot);
    }
  }
  return last;
};
