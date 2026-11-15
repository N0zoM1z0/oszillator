export type Vec2 = {
  x: number;
  y: number;
};

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });

export const distanceVec2 = (left: Vec2, right: Vec2): number => Math.hypot(left.x - right.x, left.y - right.y);

export const lerpVec2 = (start: Vec2, end: Vec2, progress: number): Vec2 => ({
  x: start.x + (end.x - start.x) * progress,
  y: start.y + (end.y - start.y) * progress
});
