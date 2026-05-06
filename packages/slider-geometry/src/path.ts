import { distanceVec2, lerpVec2, normalizeVec2, scaleVec2, addVec2, type Vec2 } from '@oszillator/core';

import { sampleBezierPath } from './bezier';
import { sampleCatmullPath } from './catmull';
import { computePolylineLength, sampleLinearPath } from './linear';
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
    cumulative.push((cumulative[index - 1] as number) + distanceVec2(points[index - 1] as Vec2, points[index] as Vec2));
  }
  return cumulative;
};

export const buildSliderPath = (curveType: SliderCurveType, controlPoints: readonly Vec2[]): SliderPath => {
  const warnings: string[] = [];
  let sampledPoints: Vec2[];

  if (controlPoints.length < 2) {
    warnings.push('degenerate-control-points');
    sampledPoints = controlPoints.length === 0 ? [{ x: 0, y: 0 }] : [...controlPoints];
  } else if (curveType === 'B') {
    sampledPoints = sampleBezierPath(controlPoints);
  } else if (curveType === 'P') {
    sampledPoints = samplePerfectCirclePath(controlPoints) ?? sampleLinearPath(controlPoints);
    if (sampledPoints.length === controlPoints.length) {
      warnings.push('perfect-circle-fallback-linear');
    }
  } else if (curveType === 'C') {
    sampledPoints = sampleCatmullPath(controlPoints);
  } else {
    sampledPoints = sampleLinearPath(controlPoints);
  }

  const cumulativeLengths = buildCumulativeLengths(sampledPoints);
  const totalLength =
    curveType === 'L' ? computePolylineLength(sampledPoints) : cumulativeLengths[cumulativeLengths.length - 1] ?? 0;

  return {
    curveType,
    sampledPoints,
    cumulativeLengths,
    totalLength,
    warnings
  };
};

export const getSliderPositionAtDistance = (path: SliderPath, distance: number): Vec2 => {
  if (path.sampledPoints.length === 0) {
    return { x: 0, y: 0 };
  }

  if (distance <= 0) {
    return path.sampledPoints[0] as Vec2;
  }

  if (distance >= path.totalLength) {
    return extrapolateAfterPathEnd(path, distance);
  }

  for (let index = 1; index < path.cumulativeLengths.length; index += 1) {
    const previousDistance = path.cumulativeLengths[index - 1] as number;
    const nextDistance = path.cumulativeLengths[index] as number;
    if (distance <= nextDistance) {
      const span = nextDistance - previousDistance || 1;
      return lerpVec2(
        path.sampledPoints[index - 1] as Vec2,
        path.sampledPoints[index] as Vec2,
        (distance - previousDistance) / span
      );
    }
  }

  return path.sampledPoints[path.sampledPoints.length - 1] as Vec2;
};

export const getSliderPositionAtProgress = (path: SliderPath, progress: number): Vec2 =>
  getSliderPositionAtDistance(path, path.totalLength * Math.min(Math.max(progress, 0), 1));

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

  const points: Vec2[] = [first];
  for (let index = 1; index < path.sampledPoints.length; index += 1) {
    const previousDistance = path.cumulativeLengths[index - 1] as number;
    const nextDistance = path.cumulativeLengths[index] as number;
    const point = path.sampledPoints[index] as Vec2;

    if (nextDistance < distance) {
      points.push(point);
      continue;
    }

    if (nextDistance === distance) {
      points.push(point);
    } else {
      const previousPoint = path.sampledPoints[index - 1] as Vec2;
      const span = nextDistance - previousDistance || 1;
      points.push(lerpVec2(previousPoint, point, (distance - previousDistance) / span));
    }
    break;
  }

  return points;
};

const extrapolateAfterPathEnd = (path: SliderPath, distance: number): Vec2 => {
  const last = path.sampledPoints[path.sampledPoints.length - 1];
  if (!last || path.sampledPoints.length < 2 || distance <= path.totalLength) {
    return last ?? { x: 0, y: 0 };
  }

  for (let index = path.sampledPoints.length - 2; index >= 0; index -= 1) {
    const previous = path.sampledPoints[index] as Vec2;
    if (distanceVec2(previous, last) > 0.001) {
      return addVec2(last, scaleVec2(normalizeVec2({ x: last.x - previous.x, y: last.y - previous.y }), distance - path.totalLength));
    }
  }

  return last;
};
