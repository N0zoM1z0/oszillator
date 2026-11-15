import { distanceVec2, vec2, type Vec2 } from '@oszillator/core';

const MAX_SEGMENT_SAMPLES = 96;
const SAMPLE_SPACING_OSU_PX = 4;

/**
 * osu! encodes multi-segment bezier sliders by repeating a control point
 * ("red anchor"). Each run between anchors is an independent bezier curve.
 */
export const splitBezierSegments = (controlPoints: readonly Vec2[]): Vec2[][] => {
  const segments: Vec2[][] = [];
  let current: Vec2[] = [];

  for (const point of controlPoints) {
    const previous = current[current.length - 1];
    if (previous && previous.x === point.x && previous.y === point.y) {
      if (current.length > 1) {
        segments.push(current);
      }
      current = [point];
      continue;
    }
    current.push(point);
  }

  if (current.length > 1) {
    segments.push(current);
  }
  return segments;
};

const controlPolygonLength = (points: readonly Vec2[]): number => {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += distanceVec2(points[index - 1]!, points[index]!);
  }
  return length;
};

const deCasteljau = (points: readonly Vec2[], scratchX: Float64Array, scratchY: Float64Array, progress: number): Vec2 => {
  for (let index = 0; index < points.length; index += 1) {
    scratchX[index] = points[index]!.x;
    scratchY[index] = points[index]!.y;
  }
  for (let size = points.length - 1; size > 0; size -= 1) {
    for (let index = 0; index < size; index += 1) {
      scratchX[index] = scratchX[index]! + (scratchX[index + 1]! - scratchX[index]!) * progress;
      scratchY[index] = scratchY[index]! + (scratchY[index + 1]! - scratchY[index]!) * progress;
    }
  }
  return vec2(scratchX[0]!, scratchY[0]!);
};

const sampleBezierSegment = (segment: readonly Vec2[], output: Vec2[]): void => {
  if (segment.length === 2) {
    output.push(segment[1]!);
    return;
  }

  const samples = Math.min(MAX_SEGMENT_SAMPLES, Math.max(2, Math.ceil(controlPolygonLength(segment) / SAMPLE_SPACING_OSU_PX)));
  const scratchX = new Float64Array(segment.length);
  const scratchY = new Float64Array(segment.length);
  for (let index = 1; index <= samples; index += 1) {
    output.push(deCasteljau(segment, scratchX, scratchY, index / samples));
  }
};

/** Samples a (possibly multi-segment) osu! bezier path into a polyline. */
export const sampleBezierPath = (controlPoints: readonly Vec2[]): Vec2[] => {
  const segments = splitBezierSegments(controlPoints);
  const first = segments[0]?.[0] ?? controlPoints[0];
  if (!first) {
    return [];
  }

  const points: Vec2[] = [first];
  for (const segment of segments) {
    sampleBezierSegment(segment, points);
  }
  return points;
};
