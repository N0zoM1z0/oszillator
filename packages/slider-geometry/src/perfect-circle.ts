import { vec2, type Vec2 } from '@oszillator/core';

const ARC_TOLERANCE_OSU_PX = 0.1;
const MAX_ARC_SAMPLES = 256;

/**
 * Samples the circular arc that starts at `a`, passes through `b` and ends at
 * `c`. Returns null for collinear or coincident points, which osu! renders as
 * a bezier curve instead.
 */
export const samplePerfectCirclePath = (controlPoints: readonly Vec2[]): Vec2[] | null => {
  if (controlPoints.length !== 3) {
    return null;
  }

  const [a, b, c] = controlPoints as [Vec2, Vec2, Vec2];
  const denominator = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(denominator) < 1e-3) {
    return null;
  }

  const aSquared = a.x * a.x + a.y * a.y;
  const bSquared = b.x * b.x + b.y * b.y;
  const cSquared = c.x * c.x + c.y * c.y;
  const centerX = (aSquared * (b.y - c.y) + bSquared * (c.y - a.y) + cSquared * (a.y - b.y)) / denominator;
  const centerY = (aSquared * (c.x - b.x) + bSquared * (a.x - c.x) + cSquared * (b.x - a.x)) / denominator;
  const radius = Math.hypot(a.x - centerX, a.y - centerY);

  // The sign of the turn a -> b -> c decides whether the arc sweeps with
  // increasing or decreasing angle; it must always pass through `b`.
  const turn = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const startAngle = Math.atan2(a.y - centerY, a.x - centerX);
  let endAngle = Math.atan2(c.y - centerY, c.x - centerX);
  if (turn > 0) {
    while (endAngle < startAngle) endAngle += Math.PI * 2;
  } else {
    while (endAngle > startAngle) endAngle -= Math.PI * 2;
  }

  const sweep = endAngle - startAngle;
  const step = radius <= ARC_TOLERANCE_OSU_PX ? Math.PI : 2 * Math.acos(1 - ARC_TOLERANCE_OSU_PX / radius);
  const samples = Math.min(MAX_ARC_SAMPLES, Math.max(2, Math.ceil(Math.abs(sweep) / step)));

  const points: Vec2[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const angle = startAngle + (sweep * index) / samples;
    points.push(vec2(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius));
  }
  return points;
};
