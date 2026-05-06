import { addVec2, distanceVec2, lerpVec2, scaleVec2, subtractVec2, vec2, type Vec2 } from '@oszillator/core';

const perpendicular = (value: Vec2): Vec2 => vec2(-value.y, value.x);

export const samplePerfectCirclePath = (
  controlPoints: readonly Vec2[],
  segments = 96
): Vec2[] | null => {
  if (controlPoints.length < 3) {
    return null;
  }

  const [a, b, c] = controlPoints;
  const midAB = lerpVec2(a as Vec2, b as Vec2, 0.5);
  const midBC = lerpVec2(b as Vec2, c as Vec2, 0.5);
  const dirAB = subtractVec2(b as Vec2, a as Vec2);
  const dirBC = subtractVec2(c as Vec2, b as Vec2);
  const det = dirAB.x * dirBC.y - dirAB.y * dirBC.x;

  if (Math.abs(det) < 1e-6) {
    return null;
  }

  const perpAB = perpendicular(dirAB);
  const perpBC = perpendicular(dirBC);
  const t =
    ((midBC.x - midAB.x) * perpBC.y - (midBC.y - midAB.y) * perpBC.x) /
    (perpAB.x * perpBC.y - perpAB.y * perpBC.x);
  const center = addVec2(midAB, scaleVec2(perpAB, t));
  const radius = distanceVec2(center, a as Vec2);

  if (radius === 0) {
    return null;
  }

  const angleA = Math.atan2((a as Vec2).y - center.y, (a as Vec2).x - center.x);
  const angleB = Math.atan2((b as Vec2).y - center.y, (b as Vec2).x - center.x);
  const angleC = Math.atan2((c as Vec2).y - center.y, (c as Vec2).x - center.x);
  const direction = ((angleB - angleA + Math.PI * 3) % (Math.PI * 2)) < ((angleC - angleA + Math.PI * 3) % (Math.PI * 2))
    ? 1
    : -1;

  let sweep = angleC - angleA;
  if (direction > 0 && sweep < 0) {
    sweep += Math.PI * 2;
  }
  if (direction < 0 && sweep > 0) {
    sweep -= Math.PI * 2;
  }

  const points: Vec2[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = angleA + (sweep * index) / segments;
    points.push(vec2(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius));
  }

  return points;
};
