import { distanceVec2, type Vec2 } from '@oszillator/core';

export const sampleLinearPath = (controlPoints: readonly Vec2[]): Vec2[] => [...controlPoints];

export const computePolylineLength = (points: readonly Vec2[]): number => {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += distanceVec2(points[index - 1] as Vec2, points[index] as Vec2);
  }

  return length;
};
