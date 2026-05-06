import { vec2, type Vec2 } from '../math/vec2';

export const PLAYFIELD_WIDTH = 512;
export const PLAYFIELD_HEIGHT = 384;
export const PLAYFIELD_CENTER = vec2(PLAYFIELD_WIDTH / 2, PLAYFIELD_HEIGHT / 2);

export type ScreenRect = {
  width: number;
  height: number;
};

export type PlayfieldTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

export const computePlayfieldTransform = (screen: ScreenRect): PlayfieldTransform => {
  const scale = Math.min(screen.width / PLAYFIELD_WIDTH, screen.height / PLAYFIELD_HEIGHT);
  const width = PLAYFIELD_WIDTH * scale;
  const height = PLAYFIELD_HEIGHT * scale;

  return {
    scale,
    width,
    height,
    offsetX: (screen.width - width) / 2,
    offsetY: (screen.height - height) / 2
  };
};

export const playfieldToScreen = (transform: PlayfieldTransform, position: Vec2): Vec2 =>
  vec2(transform.offsetX + position.x * transform.scale, transform.offsetY + position.y * transform.scale);

export const screenToPlayfield = (transform: PlayfieldTransform, position: Vec2): Vec2 =>
  vec2((position.x - transform.offsetX) / transform.scale, (position.y - transform.offsetY) / transform.scale);

export const isPointInPlayfield = (position: Vec2): boolean =>
  position.x >= 0 && position.x <= PLAYFIELD_WIDTH && position.y >= 0 && position.y <= PLAYFIELD_HEIGHT;
