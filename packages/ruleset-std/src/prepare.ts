import type { Vec2 } from '@oszillator/core';
import { distanceVec2, PLAYFIELD_HEIGHT, vec2 } from '@oszillator/core';
import type { DifficultySection, ParsedOsuFile, RawCircle, RawHitObject, RawSlider, RawSpinner } from '@oszillator/osu-parser';
import { buildSliderPath, getSliderPolylineUntilDistance, getSliderPositionAtDistance, type SliderPath } from '@oszillator/slider-geometry';

import { buildControlPoints, getActiveControlPoint, type ControlPoint } from './control-points';
import { deriveDifficulty, type DerivedDifficulty } from './difficulty';
import { gameplayModTimeRate, type GameplayMod, type PrepareBeatmapOptions } from './mods';

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
  comboIndex: number;
  stackOffset: Vec2;
};

export type PreparedSlider = {
  id: string;
  kind: 'slider';
  startTimeMs: number;
  endTimeMs: number;
  position: Vec2;
  radius: number;
  newCombo: boolean;
  comboIndex: number;
  stackOffset: Vec2;
  repeatCount: number;
  pixelLength: number;
  path: SliderPath;
  trackPoints: Vec2[];
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
  comboIndex: number;
  stackOffset: Vec2;
};

export type PreparedObject = PreparedCircle | PreparedSlider | PreparedSpinner;

export type PreparedBeatmap = {
  formatVersion: number;
  metadata: ParsedOsuFile['metadata'];
  general: ParsedOsuFile['general'];
  events: ParsedOsuFile['events'];
  colours: ParsedOsuFile['colours'];
  mods: readonly GameplayMod[];
  timeRate: number;
  difficulty: DerivedDifficulty;
  controlPoints: ControlPoint[];
  objects: PreparedObject[];
  warnings: string[];
};

const toId = (kind: PreparedObject['kind'], lineNumber: number): string => `${kind}:${lineNumber}`;

const prepareCircle = (raw: RawCircle, radius: number, comboIndex: number): PreparedCircle => ({
  id: toId('circle', raw.lineNumber),
  kind: 'circle',
  startTimeMs: raw.time,
  endTimeMs: raw.time,
  position: vec2(raw.x, raw.y),
  radius,
  newCombo: raw.newCombo,
  comboIndex,
  stackOffset: vec2(0, 0)
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
  derivedDifficulty: DerivedDifficulty,
  comboIndex: number
): PreparedSlider => {
  const path = buildSliderPath(raw.curveType, raw.controlPoints);
  const { spanDurationMs, checkpoints, velocity } = createSliderCheckpoints(raw, path, controlPoint, derivedDifficulty);
  const trackPoints = getSliderPolylineUntilDistance(path, raw.pixelLength);
  return {
    id: toId('slider', raw.lineNumber),
    kind: 'slider',
    startTimeMs: raw.time,
    endTimeMs: raw.time + spanDurationMs * raw.repeatCount,
    position: vec2(raw.x, raw.y),
    radius: derivedDifficulty.circleRadius,
    newCombo: raw.newCombo,
    comboIndex,
    stackOffset: vec2(0, 0),
    repeatCount: raw.repeatCount,
    pixelLength: raw.pixelLength,
    path,
    trackPoints,
    velocity,
    spanDurationMs,
    checkpoints,
    followRadius: derivedDifficulty.circleRadius * 2.4
  };
};

const prepareSpinner = (raw: RawSpinner, radius: number, comboIndex: number): PreparedSpinner => ({
  id: toId('spinner', raw.lineNumber),
  kind: 'spinner',
  startTimeMs: raw.time,
  endTimeMs: raw.endTime,
  position: vec2(256, 192),
  radius,
  newCombo: raw.newCombo,
  comboIndex,
  stackOffset: vec2(0, 0)
});

const isStackableObject = (object: PreparedObject): object is PreparedCircle | PreparedSlider =>
  object.kind === 'circle' || object.kind === 'slider';

const applyVisualStacking = (
  objects: PreparedObject[],
  difficulty: DerivedDifficulty,
  stackLeniency: number
): void => {
  const stackHeights = new Array<number>(objects.length).fill(0);
  const stackDistance = difficulty.circleRadius * 0.62;
  const stackTimeMs = difficulty.preemptMs * stackLeniency;
  const stackOffsetUnit = Math.min(8, Math.max(3, difficulty.circleRadius * 0.18));

  for (let index = 0; index < objects.length; index += 1) {
    const object = objects[index]!;
    if (!isStackableObject(object)) {
      continue;
    }

    for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
      const previous = objects[previousIndex]!;
      if (object.startTimeMs - previous.startTimeMs > stackTimeMs) {
        break;
      }
      if (!isStackableObject(previous)) {
        continue;
      }
      if (distanceVec2(object.position, previous.position) > stackDistance) {
        continue;
      }

      stackHeights[index] = Math.max(stackHeights[index]!, stackHeights[previousIndex]! + 1);
    }
  }

  for (let index = 0; index < objects.length; index += 1) {
    const height = stackHeights[index]!;
    if (height <= 0) {
      continue;
    }

    objects[index]!.stackOffset = vec2(-height * stackOffsetUnit, -height * stackOffsetUnit);
  }
};

const clampDifficulty = (value: number): number => Math.min(Math.max(value, 0), 10);

const applyHardRockDifficulty = (difficulty: DifficultySection): DifficultySection => ({
  ...difficulty,
  circleSize: clampDifficulty(difficulty.circleSize * 1.3),
  approachRate: clampDifficulty(difficulty.approachRate * 1.4),
  overallDifficulty: clampDifficulty(difficulty.overallDifficulty * 1.4),
  hpDrainRate: clampDifficulty(difficulty.hpDrainRate * 1.4)
});

const flipY = (y: number): number => PLAYFIELD_HEIGHT - y;

const applyHardRockObject = (raw: RawHitObject): RawHitObject => {
  if (raw.kind === 'slider') {
    return {
      ...raw,
      y: flipY(raw.y),
      controlPoints: raw.controlPoints.map((point) => vec2(point.x, flipY(point.y)))
    };
  }

  if (raw.kind === 'spinner') {
    return raw;
  }

  return {
    ...raw,
    y: flipY(raw.y)
  };
};

export const prepareBeatmap = (parsed: ParsedOsuFile, options: PrepareBeatmapOptions = {}): PreparedBeatmap => {
  const mods = [...(options.mods ?? [])];
  const hasHardRock = mods.includes('HR');
  const difficulty = deriveDifficulty(hasHardRock ? applyHardRockDifficulty(parsed.difficulty) : parsed.difficulty);
  const controlPoints = buildControlPoints(parsed.timingPoints);
  const warnings = parsed.warnings.map((warning) => warning.message);
  const objects: PreparedObject[] = [];
  let comboIndex = 0;
  let hasAcceptedObject = false;

  for (const originalRaw of parsed.hitObjects) {
    const raw = hasHardRock ? applyHardRockObject(originalRaw) : originalRaw;
    if (raw.kind === 'unsupported') {
      warnings.push(`Unsupported hit object ignored at line ${raw.lineNumber}`);
      continue;
    }

    if (hasAcceptedObject && raw.newCombo) {
      comboIndex += 1 + raw.comboOffset;
    }
    hasAcceptedObject = true;

    if (raw.kind === 'circle') {
      objects.push(prepareCircle(raw, difficulty.circleRadius, comboIndex));
      continue;
    }

    if (raw.kind === 'slider') {
      const controlPoint = getActiveControlPoint(controlPoints, raw.time);
      objects.push(prepareSlider(raw, controlPoint, difficulty, comboIndex));
      continue;
    }

    objects.push(prepareSpinner(raw, difficulty.circleRadius, comboIndex));
  }

  objects.sort((left, right) => left.startTimeMs - right.startTimeMs);
  applyVisualStacking(objects, difficulty, parsed.general.stackLeniency);

  return {
    formatVersion: parsed.formatVersion,
    metadata: parsed.metadata,
    general: parsed.general,
    events: parsed.events,
    colours: parsed.colours,
    mods,
    timeRate: gameplayModTimeRate(mods),
    difficulty,
    controlPoints,
    objects,
    warnings
  };
};
