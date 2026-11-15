import type { PreparedObject } from '@oszillator/ruleset-std';

import { clamp } from './visuals';

const runningMaxEndTimes = new WeakMap<readonly PreparedObject[], Float64Array>();

/** maxEnd[i] = latest endTimeMs among objects[0..i]; non-decreasing, cached per beatmap. */
const maxEndTimesFor = (objects: readonly PreparedObject[]): Float64Array => {
  let maxEnd = runningMaxEndTimes.get(objects);
  if (!maxEnd || maxEnd.length !== objects.length) {
    maxEnd = new Float64Array(objects.length);
    let latest = -Infinity;
    for (let index = 0; index < objects.length; index += 1) {
      latest = Math.max(latest, objects[index]!.endTimeMs);
      maxEnd[index] = latest;
    }
    runningMaxEndTimes.set(objects, maxEnd);
  }
  return maxEnd;
};

/**
 * Objects are sorted by start time, but a long slider or spinner that started
 * well before the visible window can still be on screen. Returns the earliest
 * index before `startIndex` whose object ends at or after `cutoffTimeMs`
 * (or `startIndex` if there is none), in O(log n).
 */
export const includeActiveLongObjectStartIndex = (objects: readonly PreparedObject[], startIndex: number, cutoffTimeMs: number): number => {
  const maxEnd = maxEndTimesFor(objects);
  let low = 0;
  let high = Math.min(startIndex, objects.length);
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (maxEnd[middle]! < cutoffTimeMs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
};

export const objectRenderAlpha = (
  object: Pick<PreparedObject, 'startTimeMs' | 'endTimeMs'>,
  gameTimeMs: number,
  preemptMs: number,
  fadeInMs: number,
  hidden = false
): number => {
  if (gameTimeMs > object.endTimeMs + 220) {
    return 0;
  }

  const appearTimeMs = object.startTimeMs - preemptMs;
  const fadeInProgress = clamp((gameTimeMs - appearTimeMs) / Math.max(1, fadeInMs), 0, 1);
  if (hidden) {
    const fadeOutStartMs = appearTimeMs + fadeInMs;
    const fadeOutEndMs = object.startTimeMs - preemptMs * 0.28;
    const fadeOutProgress = clamp(1 - (gameTimeMs - fadeOutStartMs) / Math.max(1, fadeOutEndMs - fadeOutStartMs), 0, 1);
    return fadeInProgress * fadeOutProgress;
  }

  const fadeOutProgress = gameTimeMs <= object.endTimeMs ? 1 : clamp(1 - (gameTimeMs - object.endTimeMs) / 220, 0, 1);
  return fadeInProgress * fadeOutProgress;
};

export const approachCircleRadius = (startTimeMs: number, gameTimeMs: number, radius: number, preemptMs: number): number => {
  const timeUntilHitMs = Math.max(startTimeMs - gameTimeMs, 0);
  const progress = clamp(1 - timeUntilHitMs / Math.max(1, preemptMs), 0, 1);
  return radius * (1 + (1 - progress) * 2.7);
};
