import type { Vec2 } from '@oszillator/core';
import { vec2 } from '@oszillator/core';
import type { ParsedOsuFile, RawCircle, RawSlider, RawSpinner } from '@oszillator/osu-parser';
import { buildSliderPath, getSliderPositionAtDistance, type SliderPath } from '@oszillator/slider-geometry';

import { buildControlPoints, getActiveControlPoint, type ControlPoint } from './control-points';
import { deriveDifficulty, type DerivedDifficulty } from './difficulty';

export type SliderCheckpoint = {
  time: number;
  position: Vec2;
  kind: 'tick' | 'repeat' | 'tail';
};

export type PreparedCircle = {
  id: string;
  kind: 'circle';
  startTimeMs: number;
  endTimeMs: number;
  position: Vec2;
  radius: number;
  newCombo: boolean;
};

export type PreparedSlider = {
  id: string;
  kind: 'slider';
  startTimeMs: number;
  endTimeMs: number;
  position: Vec2;
  radius: number;
  newCombo: boolean;
  repeatCount: number;
  pixelLength: number;
  path: SliderPath;
  velocity: number;
  spanDurationMs: number;
  checkpoints: SliderCheckpoint[];
  followRadius: number;
};

export type PreparedSpinner = {
  id: string;
  kind: 'spinner';
  startTimeMs: number;
  endTimeMs: number;
  position: Vec2;
  radius: number;
  newCombo: boolean;
};

export type PreparedObject = PreparedCircle | PreparedSlider | PreparedSpinner;

export type PreparedBeatmap = {
  formatVersion: number;
  metadata: ParsedOsuFile['metadata'];
  general: ParsedOsuFile['general'];
  events: ParsedOsuFile['events'];
  colours: ParsedOsuFile['colours'];
  difficulty: DerivedDifficulty;
  controlPoints: ControlPoint[];
  objects: PreparedObject[];
  warnings: string[];
};

const toId = (kind: PreparedObject['kind'], lineNumber: number): string => `${kind}:${lineNumber}`;

const prepareCircle = (raw: RawCircle, radius: number): PreparedCircle => ({
  id: toId('circle', raw.lineNumber),
  kind: 'circle',
  startTimeMs: raw.time,
  endTimeMs: raw.time,
  position: vec2(raw.x, raw.y),
  radius,
  newCombo: raw.newCombo
});

const createSliderCheckpoints = (
  raw: RawSlider,
  path: SliderPath,
  controlPoint: ControlPoint,
  derivedDifficulty: DerivedDifficulty
): { spanDurationMs: number; checkpoints: SliderCheckpoint[]; velocity: number } => {
  const velocity = 100 * derivedDifficulty.sliderMultiplier * controlPoint.sliderVelocityMultiplier;
  const spanDurationMs = raw.pixelLength <= 0 ? 0 : (raw.pixelLength / velocity) * controlPoint.beatLength;
  const checkpoints: SliderCheckpoint[] = [];
  const tickDistance = velocity * (controlPoint.beatLength / 1000) / Math.max(derivedDifficulty.sliderTickRate, 1);

  for (let repeatIndex = 0; repeatIndex < raw.repeatCount; repeatIndex += 1) {
    const reverse = repeatIndex % 2 === 1;
    const spanOffset = spanDurationMs * repeatIndex;

    if (tickDistance > 0 && raw.pixelLength > 0) {
      for (let distance = tickDistance; distance < raw.pixelLength - 1; distance += tickDistance) {
        const progress = distance / raw.pixelLength;
        const position = getSliderPositionAtDistance(path, reverse ? raw.pixelLength - distance : distance);
        checkpoints.push({
          time: raw.time + spanOffset + spanDurationMs * progress,
          position,
          kind: 'tick'
        });
      }
    }

    const endpointDistance = reverse ? 0 : raw.pixelLength;
    checkpoints.push({
      time: raw.time + spanOffset + spanDurationMs,
      position: getSliderPositionAtDistance(path, endpointDistance),
      kind: repeatIndex === raw.repeatCount - 1 ? 'tail' : 'repeat'
    });
  }

  return {
    spanDurationMs,
    checkpoints,
    velocity
  };
};

const prepareSlider = (
  raw: RawSlider,
  controlPoint: ControlPoint,
  derivedDifficulty: DerivedDifficulty
): PreparedSlider => {
  const path = buildSliderPath(raw.curveType, raw.controlPoints);
  const { spanDurationMs, checkpoints, velocity } = createSliderCheckpoints(raw, path, controlPoint, derivedDifficulty);
  return {
    id: toId('slider', raw.lineNumber),
    kind: 'slider',
    startTimeMs: raw.time,
    endTimeMs: raw.time + spanDurationMs * raw.repeatCount,
    position: vec2(raw.x, raw.y),
    radius: derivedDifficulty.circleRadius,
    newCombo: raw.newCombo,
    repeatCount: raw.repeatCount,
    pixelLength: raw.pixelLength,
    path,
    velocity,
    spanDurationMs,
    checkpoints,
    followRadius: derivedDifficulty.circleRadius * 2.4
  };
};

const prepareSpinner = (raw: RawSpinner, radius: number): PreparedSpinner => ({
  id: toId('spinner', raw.lineNumber),
  kind: 'spinner',
  startTimeMs: raw.time,
  endTimeMs: raw.endTime,
  position: vec2(256, 192),
  radius,
  newCombo: raw.newCombo
});

export const prepareBeatmap = (parsed: ParsedOsuFile): PreparedBeatmap => {
  const difficulty = deriveDifficulty(parsed.difficulty);
  const controlPoints = buildControlPoints(parsed.timingPoints);
  const warnings = parsed.warnings.map((warning) => warning.message);
  const objects: PreparedObject[] = [];

  for (const raw of parsed.hitObjects) {
    if (raw.kind === 'unsupported') {
      warnings.push(`Unsupported hit object ignored at line ${raw.lineNumber}`);
      continue;
    }

    if (raw.kind === 'circle') {
      objects.push(prepareCircle(raw, difficulty.circleRadius));
      continue;
    }

    if (raw.kind === 'slider') {
      const controlPoint = getActiveControlPoint(controlPoints, raw.time);
      objects.push(prepareSlider(raw, controlPoint, difficulty));
      continue;
    }

    objects.push(prepareSpinner(raw, difficulty.circleRadius));
  }

  objects.sort((left, right) => left.startTimeMs - right.startTimeMs);

  return {
    formatVersion: parsed.formatVersion,
    metadata: parsed.metadata,
    general: parsed.general,
    events: parsed.events,
    colours: parsed.colours,
    difficulty,
    controlPoints,
    objects,
    warnings
  };
};
