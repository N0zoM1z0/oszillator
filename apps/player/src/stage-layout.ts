import type { ScreenRect } from '@oszillator/core';

/** Extra osu!pixels of dimmed frame drawn around the 512x384 playfield. */
export const PLAYFIELD_PADDING_OSU = 72;

/** Screen-pixel insets that keep the playfield clear of the stage edges. */
export const STAGE_INSET = {
  top: 28,
  right: 28,
  bottom: 18,
  left: 28
} as const;

export const BACKGROUND_DIM = 0.7;

export type StageSettings = Required<ScreenRect> & { backgroundDim: number };

export const stageSettingsForSize = (width: number, height: number): StageSettings => ({
  width: Math.max(width, 320),
  height: Math.max(height, 240),
  playfieldPadding: PLAYFIELD_PADDING_OSU,
  insetTop: STAGE_INSET.top,
  insetRight: STAGE_INSET.right,
  insetBottom: STAGE_INSET.bottom,
  insetLeft: STAGE_INSET.left,
  backgroundDim: BACKGROUND_DIM
});
