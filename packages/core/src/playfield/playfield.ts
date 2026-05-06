import { vec2, type Vec2 } from '../math/vec2';

export const PLAYFIELD_WIDTH = 512;
export const PLAYFIELD_HEIGHT = 384;
export const PLAYFIELD_CENTER = vec2(PLAYFIELD_WIDTH / 2, PLAYFIELD_HEIGHT / 2);

export type ScreenRect = {
  width: number;
  height: number;
  playfieldPadding?: number;
  insetTop?: number;
  insetRight?: number;
  insetBottom?: number;
  insetLeft?: number;
};

export type PlayfieldTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  playfieldPadding: number;
  outerOffsetX: number;
  outerOffsetY: number;
  outerWidth: number;
  outerHeight: number;
};

export const computePlayfieldTransform = (screen: ScreenRect): PlayfieldTransform => {
  const playfieldPadding = screen.playfieldPadding ?? 0;
  const insetTop = screen.insetTop ?? 0;
  const insetRight = screen.insetRight ?? 0;
  const insetBottom = screen.insetBottom ?? 0;
  const insetLeft = screen.insetLeft ?? 0;
  const availableWidth = Math.max(1, screen.width - insetLeft - insetRight);
  const availableHeight = Math.max(1, screen.height - insetTop - insetBottom);
  const outerPlayfieldWidth = PLAYFIELD_WIDTH + playfieldPadding * 2;
  const outerPlayfieldHeight = PLAYFIELD_HEIGHT + playfieldPadding * 2;
  const scale = Math.min(availableWidth / outerPlayfieldWidth, availableHeight / outerPlayfieldHeight);
  const width = PLAYFIELD_WIDTH * scale;
  const height = PLAYFIELD_HEIGHT * scale;
  const outerWidth = outerPlayfieldWidth * scale;
  const outerHeight = outerPlayfieldHeight * scale;
  const outerOffsetX = insetLeft + (availableWidth - outerWidth) / 2;
  const outerOffsetY = insetTop + (availableHeight - outerHeight) / 2;

  return {
    scale,
    width,
    height,
    playfieldPadding,
    outerOffsetX,
    outerOffsetY,
    outerWidth,
    outerHeight,
    offsetX: outerOffsetX + playfieldPadding * scale,
    offsetY: outerOffsetY + playfieldPadding * scale
  };
};

export const playfieldToScreen = (transform: PlayfieldTransform, position: Vec2): Vec2 =>
  vec2(transform.offsetX + position.x * transform.scale, transform.offsetY + position.y * transform.scale);

export const screenToPlayfield = (transform: PlayfieldTransform, position: Vec2): Vec2 =>
  vec2((position.x - transform.offsetX) / transform.scale, (position.y - transform.offsetY) / transform.scale);

export const isPointInPlayfield = (position: Vec2): boolean =>
  position.x >= 0 && position.x <= PLAYFIELD_WIDTH && position.y >= 0 && position.y <= PLAYFIELD_HEIGHT;
