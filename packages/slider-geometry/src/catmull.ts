import { vec2, type Vec2 } from '@oszillator/core';

const sampleCatmullRom = (p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 => {
  const t2 = t * t;
  const t3 = t2 * t;

  return vec2(
    0.5 *
      ((2 * p1.x) +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    0.5 *
      ((2 * p1.y) +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
  );
};

export const sampleCatmullPath = (controlPoints: readonly Vec2[], segmentResolution = 24): Vec2[] => {
  if (controlPoints.length < 2) {
    return [...controlPoints];
  }

  const points: Vec2[] = [];
  for (let index = 0; index < controlPoints.length - 1; index += 1) {
    const p0 = controlPoints[Math.max(0, index - 1)] as Vec2;
    const p1 = controlPoints[index] as Vec2;
    const p2 = controlPoints[index + 1] as Vec2;
    const p3 = controlPoints[Math.min(controlPoints.length - 1, index + 2)] as Vec2;

    for (let step = 0; step < segmentResolution; step += 1) {
      points.push(sampleCatmullRom(p0, p1, p2, p3, step / segmentResolution));
    }
  }

  points.push(controlPoints[controlPoints.length - 1] as Vec2);
  return points;
};
