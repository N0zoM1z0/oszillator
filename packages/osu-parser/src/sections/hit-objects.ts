import { vec2, type Vec2 } from '@oszillator/core';

import { parseFloatNumber, parseInteger, type SectionLine } from '../sections';
import { createParseWarning, type ParseWarning } from '../warnings';

export type HitSample = {
  normalSet: number;
  additionSet: number;
  index: number;
  volume: number;
  filename: string | null;
};

export type HitObjectBase = {
  lineNumber: number;
  x: number;
  y: number;
  time: number;
  typeFlags: number;
  hitSound: number;
  newCombo: boolean;
  comboOffset: number;
  hitSample: HitSample | null;
};

export type RawCircle = HitObjectBase & {
  kind: 'circle';
};

export type RawSlider = HitObjectBase & {
  kind: 'slider';
  curveType: 'L' | 'B' | 'P' | 'C';
  controlPoints: Vec2[];
  repeatCount: number;
  pixelLength: number;
  edgeSounds: number[];
  edgeSets: string[];
};

export type RawSpinner = HitObjectBase & {
  kind: 'spinner';
  endTime: number;
};

export type RawUnsupportedObject = HitObjectBase & {
  kind: 'unsupported';
  unsupportedKind: 'hold' | 'unknown';
  rawParams: string[];
};

export type RawHitObject = RawCircle | RawSlider | RawSpinner | RawUnsupportedObject;

const parseHitSample = (raw: string | undefined): HitSample | null => {
  if (!raw) {
    return null;
  }

  const [normalSet, additionSet, index, volume, filename] = raw.split(':');

  return {
    normalSet: parseInteger(normalSet ?? '') ?? 0,
    additionSet: parseInteger(additionSet ?? '') ?? 0,
    index: parseInteger(index ?? '') ?? 0,
    volume: parseInteger(volume ?? '') ?? 0,
    filename: filename?.trim() || null
  };
};

const parseSliderControlPoints = (value: string, start: Vec2): { curveType: RawSlider['curveType']; controlPoints: Vec2[] } => {
  const [curveTypeRaw, ...pointParts] = value.split('|');
  const curveType = (curveTypeRaw?.trim().toUpperCase() || 'L') as RawSlider['curveType'];
  const points = [start];

  for (const pointPart of pointParts) {
    const [xValue, yValue] = pointPart.split(':').map((part) => parseFloatNumber(part.trim()));
    if (xValue !== undefined && yValue !== undefined && xValue !== null && yValue !== null) {
      points.push(vec2(xValue, yValue));
    }
  }

  return {
    curveType: ['L', 'B', 'P', 'C'].includes(curveType) ? curveType : 'L',
    controlPoints: points
  };
};

export const parseHitObjectsSection = (lines: readonly SectionLine[], warnings: ParseWarning[]): RawHitObject[] => {
  const objects: RawHitObject[] = [];

  for (const line of lines) {
    const parts = line.text.split(',').map((part) => part.trim());
    if (parts.length < 5) {
      warnings.push(createParseWarning('hitobjects.malformed-line', `Malformed HitObjects line: ${line.text}`, line.lineNumber));
      continue;
    }

    const x = parseFloatNumber(parts[0] ?? '');
    const y = parseFloatNumber(parts[1] ?? '');
    const time = parseFloatNumber(parts[2] ?? '');
    const typeFlags = parseInteger(parts[3] ?? '');
    const hitSound = parseInteger(parts[4] ?? '');

    if (x === null || y === null || time === null || typeFlags === null || hitSound === null) {
      warnings.push(createParseWarning('hitobjects.invalid-number', `Invalid HitObjects line: ${line.text}`, line.lineNumber));
      continue;
    }

    const base: HitObjectBase = {
      lineNumber: line.lineNumber,
      x,
      y,
      time,
      typeFlags,
      hitSound,
      newCombo: (typeFlags & 4) !== 0,
      comboOffset: (typeFlags >> 4) & 0b111,
      hitSample: null
    };

    if ((typeFlags & 1) !== 0) {
      base.hitSample = parseHitSample(parts[5]);
      objects.push({ ...base, kind: 'circle' });
      continue;
    }

    if ((typeFlags & 2) !== 0) {
      const sliderDefinition = parts[5];
      if (!sliderDefinition) {
        warnings.push(createParseWarning('hitobjects.slider-missing-params', `Missing slider params: ${line.text}`, line.lineNumber));
        continue;
      }

      const { curveType, controlPoints } = parseSliderControlPoints(sliderDefinition, vec2(x, y));
      const repeatCount = Math.max(parseInteger(parts[6] ?? '') ?? 1, 1);
      const pixelLength = parseFloatNumber(parts[7] ?? '') ?? 0;
      const edgeSounds = (parts[8] ?? '')
        .split('|')
        .filter(Boolean)
        .map((value) => parseInteger(value) ?? 0);
      const edgeSets = (parts[9] ?? '').split('|').filter(Boolean);
      base.hitSample = parseHitSample(parts[10]);

      objects.push({
        ...base,
        kind: 'slider',
        curveType,
        controlPoints,
        repeatCount,
        pixelLength,
        edgeSounds,
        edgeSets
      });
      continue;
    }

    if ((typeFlags & 8) !== 0) {
      const endTime = parseFloatNumber(parts[5] ?? '');
      if (endTime === null) {
        warnings.push(createParseWarning('hitobjects.spinner-missing-end', `Invalid spinner: ${line.text}`, line.lineNumber));
        continue;
      }

      base.hitSample = parseHitSample(parts[6]);
      objects.push({ ...base, kind: 'spinner', endTime });
      continue;
    }

    const unsupportedKind = (typeFlags & 128) !== 0 ? 'hold' : 'unknown';
    base.hitSample = parseHitSample(parts[parts.length - 1]);
    warnings.push(
      createParseWarning('hitobjects.unsupported-kind', `Unsupported hit object kind: ${line.text}`, line.lineNumber)
    );
    objects.push({
      ...base,
      kind: 'unsupported',
      unsupportedKind,
      rawParams: parts.slice(5)
    });
  }

  return objects;
};
