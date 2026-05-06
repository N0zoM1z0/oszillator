import type { PreparedObject } from '@oszillator/ruleset-std';

export const clampRenderValue = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export const includeActiveLongObjectStartIndex = (
  objects: readonly PreparedObject[],
  startIndex: number,
  cutoffTimeMs: number
): number => {
  let earliestActiveIndex = startIndex;
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    const previous = objects[index];
    if (previous && previous.endTimeMs >= cutoffTimeMs) {
      earliestActiveIndex = index;
    }
  }
  return earliestActiveIndex;
};

export const objectRenderAlpha = (
  object: Pick<PreparedObject, 'startTimeMs' | 'endTimeMs'>,
  gameTimeMs: number,
  preemptMs: number,
  fadeInMs: number
): number => {
  if (gameTimeMs > object.endTimeMs + 220) {
    return 0;
  }

  const appearTimeMs = object.startTimeMs - preemptMs;
  const fadeInProgress =
    gameTimeMs < object.startTimeMs ? clampRenderValue((gameTimeMs - appearTimeMs) / Math.max(1, fadeInMs), 0, 1) : 1;
  const fadeOutProgress = gameTimeMs <= object.endTimeMs ? 1 : clampRenderValue(1 - (gameTimeMs - object.endTimeMs) / 220, 0, 1);
  return fadeInProgress * fadeOutProgress;
};

export const approachCircleRadius = (startTimeMs: number, gameTimeMs: number, radius: number, preemptMs: number): number => {
  const timeUntilHitMs = Math.max(startTimeMs - gameTimeMs, 0);
  const progress = clampRenderValue(1 - timeUntilHitMs / Math.max(1, preemptMs), 0, 1);
  return radius * (1 + (1 - progress) * 2.7);
};
