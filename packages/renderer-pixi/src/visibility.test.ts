import { describe, expect, it } from 'vitest';

import type { PreparedObject } from '@oszillator/ruleset-std';

import { approachCircleRadius, includeActiveLongObjectStartIndex, objectRenderAlpha } from './visibility';

const object = (id: string, startTimeMs: number, endTimeMs = startTimeMs): PreparedObject => ({
  id,
  kind: 'circle',
  startTimeMs,
  endTimeMs,
  position: { x: 256, y: 192 },
  radius: 36,
  newCombo: false,
  comboIndex: 0
});

describe('renderer visibility helpers', () => {
  it('keeps long active objects visible even when ended objects sit after them', () => {
    const objects = [object('long-slider', 1000, 7000), object('ended-circle', 2000), object('future-circle', 6000)];

    expect(includeActiveLongObjectStartIndex(objects, 2, 4800)).toBe(0);
  });

  it('uses AR fade timing instead of showing objects immediately at constant alpha', () => {
    const circle = object('circle', 2000);

    expect(objectRenderAlpha(circle, 800, 1200, 800)).toBe(0);
    expect(objectRenderAlpha(circle, 1200, 1200, 800)).toBeCloseTo(0.5);
    expect(objectRenderAlpha(circle, 2000, 1200, 800)).toBe(1);
  });

  it('fades hidden objects out before their hit time', () => {
    const circle = object('hidden-circle', 1000);

    expect(objectRenderAlpha(circle, 600, 600, 200, true)).toBeGreaterThan(0);
    expect(objectRenderAlpha(circle, 900, 600, 200, true)).toBe(0);
    expect(objectRenderAlpha(circle, 1000, 600, 200, true)).toBe(0);
    expect(objectRenderAlpha(circle, 1100, 600, 200, true)).toBe(0);
  });

  it('shrinks approach circles toward the hit circle radius', () => {
    expect(approachCircleRadius(2000, 800, 40, 1200)).toBeCloseTo(148);
    expect(approachCircleRadius(2000, 2000, 40, 1200)).toBe(40);
  });
});

describe('active long object lookup', () => {
  it('matches a linear scan for every start index and cutoff', () => {
    const objects = [object('a', 0, 500), object('spinner', 100, 5000), object('b', 200), object('c', 300, 900), object('d', 6000)];
    const linear = (startIndex: number, cutoff: number): number => {
      let earliest = startIndex;
      for (let index = startIndex - 1; index >= 0; index -= 1) {
        if (objects[index]!.endTimeMs >= cutoff) earliest = index;
      }
      return earliest;
    };

    for (let startIndex = 0; startIndex <= objects.length; startIndex += 1) {
      for (const cutoff of [-1, 0, 150, 499, 500, 501, 900, 4999, 5000, 5001, 7000]) {
        expect(includeActiveLongObjectStartIndex(objects, startIndex, cutoff)).toBe(linear(startIndex, cutoff));
      }
    }
  });
});
