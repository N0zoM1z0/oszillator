export type Vec2 = {
  x: number;
  y: number;
};

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });

export const addVec2 = (left: Vec2, right: Vec2): Vec2 => ({
  x: left.x + right.x,
  y: left.y + right.y
});

export const subtractVec2 = (left: Vec2, right: Vec2): Vec2 => ({
  x: left.x - right.x,
  y: left.y - right.y
});

export const scaleVec2 = (value: Vec2, scalar: number): Vec2 => ({
  x: value.x * scalar,
  y: value.y * scalar
});

export const dotVec2 = (left: Vec2, right: Vec2): number => left.x * right.x + left.y * right.y;

export const lengthSquaredVec2 = (value: Vec2): number => dotVec2(value, value);

export const lengthVec2 = (value: Vec2): number => Math.sqrt(lengthSquaredVec2(value));

export const distanceSquaredVec2 = (left: Vec2, right: Vec2): number =>
  lengthSquaredVec2(subtractVec2(left, right));

export const distanceVec2 = (left: Vec2, right: Vec2): number => Math.sqrt(distanceSquaredVec2(left, right));

export const lerpVec2 = (start: Vec2, end: Vec2, progress: number): Vec2 => ({
  x: start.x + (end.x - start.x) * progress,
  y: start.y + (end.y - start.y) * progress
});

export const normalizeVec2 = (value: Vec2): Vec2 => {
  const length = lengthVec2(value);
  if (length === 0) {
    return vec2(0, 0);
  }

  return scaleVec2(value, 1 / length);
};

export const almostEqualVec2 = (left: Vec2, right: Vec2, epsilon = 1e-6): boolean =>
  Math.abs(left.x - right.x) <= epsilon && Math.abs(left.y - right.y) <= epsilon;
