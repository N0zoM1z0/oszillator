import { lerpVec2, type Vec2 } from '@oszillator/core';

const deCasteljau = (points: readonly Vec2[], progress: number): Vec2 => {
  let working = [...points];

  while (working.length > 1) {
    const next: Vec2[] = [];
    for (let index = 1; index < working.length; index += 1) {
      next.push(lerpVec2(working[index - 1] as Vec2, working[index] as Vec2, progress));
    }
    working = next;
  }

  return working[0] as Vec2;
};

export const sampleBezierPath = (controlPoints: readonly Vec2[], segments = 96): Vec2[] => {
  const points: Vec2[] = [];
  for (let index = 0; index <= segments; index += 1) {
    points.push(deCasteljau(controlPoints, index / segments));
  }

  return points;
};
