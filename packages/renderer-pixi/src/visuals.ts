// Pixi-free visual helpers. Colours are packed 0xRRGGBB numbers so per-frame
// colour maths allocates nothing.

export type Rgb = readonly [number, number, number];

export const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export const rgbToNumber = (rgb: Rgb): number => (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];

export const WHITE = 0xffffff;
export const DEFAULT_COMBO_COLOURS: readonly number[] = [0xff6888, 0x5bd5ff, 0xffda64, 0x89ff9a, 0xbe84ff];
export const STATIC_OBJECT_COLOUR = 0x38bdf8;
export const STATIC_CURSOR_COLOUR = 0x38bdf8;

const mixChannel = (from: number, to: number, progress: number): number =>
  clamp(Math.round(from + (to - from) * progress), 0, 255);

/** Linear blend between two packed colours, rounding each channel. */
export const mixColour = (from: number, to: number, progress: number): number =>
  (mixChannel((from >> 16) & 0xff, (to >> 16) & 0xff, progress) << 16) |
  (mixChannel((from >> 8) & 0xff, (to >> 8) & 0xff, progress) << 8) |
  mixChannel(from & 0xff, to & 0xff, progress);

const colourAt = (palette: readonly number[], index: number): number =>
  palette[Math.abs(index) % palette.length] ?? DEFAULT_COMBO_COLOURS[0]!;

export const cyclePalette = (palette: readonly number[], visualTimeMs: number): number => {
  const cycle = visualTimeMs / 720;
  const index = Math.floor(cycle);
  return mixColour(colourAt(palette, index), colourAt(palette, index + 1), cycle - index);
};

/** Combo colour (gently pulsing) in dynamic mode, one calm colour otherwise. */
export const objectVisualColour = (palette: readonly number[], comboIndex: number, dynamicColours: boolean, gameTimeMs: number): number =>
  dynamicColours ? mixColour(colourAt(palette, comboIndex), WHITE, ((Math.sin(gameTimeMs / 180) + 1) / 2) * 0.22) : STATIC_OBJECT_COLOUR;

export const easeOutCubic = (value: number): number => 1 - (1 - value) ** 3;
export const smoothstep = (value: number): number => value * value * (3 - 2 * value);

export const JUDGED_OBJECT_FADE_MS = 320;
export const SMOKE_LIFETIME_MS = 900;
export const CURSOR_TRAIL_LIFETIME_MS = 260;

/** A smoke or cursor-trail sample in playfield coordinates. */
export type EffectPoint = {
  x: number;
  y: number;
  createdAtMs: number;
};

export type SliderVisualMetrics = {
  outerWidth: number;
  innerWidth: number;
  highlightWidth: number;
  headRadius: number;
  markerSize: number;
};

export const sliderVisualMetrics = (radius: number): SliderVisualMetrics => {
  const outerWidth = Math.max(10, radius * 1.88);
  return {
    outerWidth,
    innerWidth: Math.max(6, radius * 1.22),
    highlightWidth: Math.max(2, radius * 0.12),
    headRadius: outerWidth / 2,
    markerSize: outerWidth / 2
  };
};

/** Objects grow from 97% to full size as they approach, a subtle depth cue. */
export const approachDepthScale = (startTimeMs: number, gameTimeMs: number, preemptMs: number): number =>
  0.97 + smoothstep(clamp(1 - (startTimeMs - gameTimeMs) / Math.max(1, preemptMs), 0, 1)) * 0.03;
