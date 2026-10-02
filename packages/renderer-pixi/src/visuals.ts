import type { PreparedObject } from '@oszillator/ruleset-std';

export type Rgb = readonly [number, number, number];

export const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);
export const DEFAULT_COMBO_COLOURS: readonly Rgb[] = [
  [255, 104, 136],
  [91, 213, 255],
  [255, 218, 100],
  [137, 255, 154],
  [190, 132, 255]
];
export const STATIC_OBJECT_COLOUR: Rgb = [56, 189, 248];
export const STATIC_CURSOR_COLOUR: Rgb = [56, 189, 248];
export const rgbToNumber = (rgb: Rgb): number => (rgb[0] << 16) + (rgb[1] << 8) + rgb[2];
const clampColorChannel = (value: number): number => Math.min(Math.max(Math.round(value), 0), 255);
export const mixRgb = (from: Rgb, to: Rgb, progress: number): Rgb => [
  clampColorChannel(from[0] + (to[0] - from[0]) * progress),
  clampColorChannel(from[1] + (to[1] - from[1]) * progress),
  clampColorChannel(from[2] + (to[2] - from[2]) * progress)
];
const pulseRgb = (base: Rgb, visualTimeMs: number, amount: number): Rgb =>
  mixRgb(base, [255, 255, 255], ((Math.sin(visualTimeMs / 180) + 1) / 2) * amount);
const colourAt = (palette: readonly Rgb[], index: number): Rgb => palette[Math.abs(index) % palette.length] ?? DEFAULT_COMBO_COLOURS[0]!;
export const cyclePalette = (palette: readonly Rgb[], visualTimeMs: number): Rgb => {
  const cycle = visualTimeMs / 720;
  const index = Math.floor(cycle);
  return mixRgb(colourAt(palette, index), colourAt(palette, index + 1), cycle - index);
};
export const easeOutCubic = (value: number): number => 1 - (1 - value) ** 3;
export const smoothstep = (value: number): number => value * value * (3 - 2 * value);
export const JUDGED_OBJECT_FADE_MS = 320;

export const objectVisualColour = (palette: readonly Rgb[], comboIndex: number, dynamicColours: boolean, gameTimeMs: number): Rgb =>
  dynamicColours ? pulseRgb(colourAt(palette, comboIndex), gameTimeMs, 0.22) : STATIC_OBJECT_COLOUR;

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

export type ObjectDepthStyle = {
  alpha: number;
  scale: number;
  ringAlpha: number;
  shadowAlpha: number;
  edgeWidth: number;
};
export const objectDepthStyle = (object: Pick<PreparedObject, 'startTimeMs'>, gameTimeMs: number, preemptMs: number): ObjectDepthStyle => {
  const progress = clamp(1 - (object.startTimeMs - gameTimeMs) / Math.max(1, preemptMs), 0, 1);
  return {
    alpha: 1,
    scale: 0.97 + smoothstep(progress) * 0.03,
    ringAlpha: 1,
    shadowAlpha: 0.2,
    edgeWidth: 1
  };
};
