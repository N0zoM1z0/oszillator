import type { TimingPointRaw } from '@oszillator/osu-parser';

export type ControlPoint = {
  time: number;
  beatLength: number;
  sliderVelocityMultiplier: number;
  sampleSet: number;
  sampleIndex: number;
  volume: number;
  meter: number;
};

export const buildControlPoints = (timingPoints: readonly TimingPointRaw[]): ControlPoint[] => {
  const sorted = [...timingPoints].sort((left, right) => left.time - right.time);
  const controlPoints: ControlPoint[] = [];
  let currentBeatLength = 500;
  let currentMeter = 4;

  for (const point of sorted) {
    if (point.uninherited) {
      currentBeatLength = point.beatLength;
      currentMeter = point.meter;
      controlPoints.push({
        time: point.time,
        beatLength: point.beatLength,
        sliderVelocityMultiplier: 1,
        sampleSet: point.sampleSet,
        sampleIndex: point.sampleIndex,
        volume: point.volume,
        meter: point.meter
      });
    } else {
      controlPoints.push({
        time: point.time,
        beatLength: currentBeatLength,
        sliderVelocityMultiplier: point.beatLength >= 0 ? 1 : Math.max(0.1, -100 / point.beatLength),
        sampleSet: point.sampleSet,
        sampleIndex: point.sampleIndex,
        volume: point.volume,
        meter: currentMeter
      });
    }
  }

  if (controlPoints.length === 0) {
    controlPoints.push({
      time: 0,
      beatLength: 500,
      sliderVelocityMultiplier: 1,
      sampleSet: 0,
      sampleIndex: 0,
      volume: 100,
      meter: 4
    });
  }

  return controlPoints;
};

export const getActiveControlPoint = (controlPoints: readonly ControlPoint[], time: number): ControlPoint => {
  let active = controlPoints[0] as ControlPoint;
  for (const point of controlPoints) {
    if (point.time > time) {
      break;
    }
    active = point;
  }

  return active;
};
