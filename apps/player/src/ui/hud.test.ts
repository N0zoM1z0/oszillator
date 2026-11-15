import { describe, expect, it } from 'vitest';

import type { PreparedObject } from '@oszillator/ruleset-std';

import { formatOffset, offsetChartPercent, waitProgressAt } from './hud';

const circle = (startTimeMs: number, endTimeMs = startTimeMs): PreparedObject => ({
  id: `circle:${startTimeMs}`,
  kind: 'circle',
  startTimeMs,
  endTimeMs,
  position: { x: 0, y: 0 },
  radius: 30,
  newCombo: false,
  comboIndex: 0
});

describe('hud helpers', () => {
  it('formats signed hit offsets', () => {
    expect(formatOffset(12.4)).toBe('+12ms');
    expect(formatOffset(-8.6)).toBe('-9ms');
    expect(formatOffset(0)).toBe('0ms');
  });

  it('places offsets on the chart and pins outliers to the edges', () => {
    expect(offsetChartPercent(0)).toBe(50);
    expect(offsetChartPercent(-160)).toBe(0);
    expect(offsetChartPercent(80)).toBe(75);
    expect(offsetChartPercent(9000)).toBe(100);
  });

  it('counts down only through long gaps between objects', () => {
    const objects = [circle(1000), circle(1500, 2000), circle(7000)];

    expect(waitProgressAt(objects, 500)).toBeNull(); // 1000 ms lead-in is too short
    expect(waitProgressAt(objects, 1800)).toBeNull(); // inside the slider
    expect(waitProgressAt(objects, 2000)).toBe(1);
    expect(waitProgressAt(objects, 4500)).toBeCloseTo(0.5);
    expect(waitProgressAt(objects, 7000)).toBeNull(); // nothing left to wait for
    expect(waitProgressAt([circle(4000)], 1000)).toBeCloseTo(0.75);
  });
});
