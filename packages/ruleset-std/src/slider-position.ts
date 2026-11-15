import type { Vec2 } from '@oszillator/core';
import { getSliderPositionAtDistance } from '@oszillator/slider-geometry';

import type { PreparedSlider } from './prepare';

/** Distance travelled along the slider path at `timeMs`, accounting for repeats. */
export const sliderDistanceAt = (slider: PreparedSlider, timeMs: number): number => {
  if (slider.spanDurationMs <= 0) {
    return 0;
  }

  const elapsed = Math.min(Math.max(timeMs - slider.startTimeMs, 0), slider.endTimeMs - slider.startTimeMs);
  const spanIndex = Math.min(slider.repeatCount - 1, Math.floor(elapsed / slider.spanDurationMs));
  const spanProgress = Math.min(Math.max((elapsed - spanIndex * slider.spanDurationMs) / slider.spanDurationMs, 0), 1);
  return slider.pixelLength * (spanIndex % 2 === 1 ? 1 - spanProgress : spanProgress);
};

/** Slider ball position at `timeMs` (clamped to the slider's lifetime). */
export const sliderBallPositionAt = (slider: PreparedSlider, timeMs: number): Vec2 =>
  getSliderPositionAtDistance(slider.path, sliderDistanceAt(slider, timeMs));
