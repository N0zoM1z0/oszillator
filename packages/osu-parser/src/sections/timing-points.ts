import { parseFloatNumber, parseInteger, type SectionLine } from '../sections';
import { createParseWarning, type ParseWarning } from '../warnings';

export type TimingPointRaw = {
  time: number;
  beatLength: number;
  meter: number;
  sampleSet: number;
  sampleIndex: number;
  volume: number;
  uninherited: boolean;
  effects: number;
  lineNumber: number;
};

export const parseTimingPointsSection = (
  lines: readonly SectionLine[],
  warnings: ParseWarning[]
): TimingPointRaw[] => {
  const timingPoints: TimingPointRaw[] = [];

  for (const line of lines) {
    const parts = line.text.split(',').map((part) => part.trim());
    if (parts.length < 2) {
      warnings.push(
        createParseWarning('timing-points.malformed-line', `Malformed TimingPoints line: ${line.text}`, line.lineNumber)
      );
      continue;
    }

    const time = parseFloatNumber(parts[0] ?? '');
    const beatLength = parseFloatNumber(parts[1] ?? '');
    if (time === null || beatLength === null) {
      warnings.push(
        createParseWarning('timing-points.invalid-number', `Invalid TimingPoints line: ${line.text}`, line.lineNumber)
      );
      continue;
    }

    timingPoints.push({
      time,
      beatLength,
      meter: parseInteger(parts[2] ?? '') ?? 4,
      sampleSet: parseInteger(parts[3] ?? '') ?? 0,
      sampleIndex: parseInteger(parts[4] ?? '') ?? 0,
      volume: parseInteger(parts[5] ?? '') ?? 100,
      uninherited: (parseInteger(parts[6] ?? '') ?? 1) > 0,
      effects: parseInteger(parts[7] ?? '') ?? 0,
      lineNumber: line.lineNumber
    });
  }

  return timingPoints;
};
