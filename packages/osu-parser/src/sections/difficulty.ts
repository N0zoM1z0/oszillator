import { parseFloatNumber, splitKeyValueLine, type SectionLine } from '../sections';
import { createParseWarning, type ParseWarning } from '../warnings';

export type DifficultySection = {
  hpDrainRate: number;
  circleSize: number;
  overallDifficulty: number;
  approachRate: number;
  sliderMultiplier: number;
  sliderTickRate: number;
  extras: Record<string, string>;
};

export const parseDifficultySection = (lines: readonly SectionLine[], warnings: ParseWarning[]): DifficultySection => {
  const difficulty: DifficultySection = {
    hpDrainRate: 5,
    circleSize: 5,
    overallDifficulty: 5,
    approachRate: Number.NaN,
    sliderMultiplier: 1.4,
    sliderTickRate: 1,
    extras: {}
  };

  for (const line of lines) {
    const entry = splitKeyValueLine(line);
    if (!entry) {
      warnings.push(createParseWarning('difficulty.malformed-line', `Malformed Difficulty line: ${line.text}`, line.lineNumber));
      continue;
    }

    const { key, value } = entry;
    difficulty.extras[key] = value;

    switch (key) {
      case 'HPDrainRate':
        difficulty.hpDrainRate = parseFloatNumber(value) ?? difficulty.hpDrainRate;
        break;
      case 'CircleSize':
        difficulty.circleSize = parseFloatNumber(value) ?? difficulty.circleSize;
        break;
      case 'OverallDifficulty':
        difficulty.overallDifficulty = parseFloatNumber(value) ?? difficulty.overallDifficulty;
        break;
      case 'ApproachRate':
        difficulty.approachRate = parseFloatNumber(value) ?? difficulty.approachRate;
        break;
      case 'SliderMultiplier':
        difficulty.sliderMultiplier = parseFloatNumber(value) ?? difficulty.sliderMultiplier;
        break;
      case 'SliderTickRate':
        difficulty.sliderTickRate = parseFloatNumber(value) ?? difficulty.sliderTickRate;
        break;
      default:
        break;
    }
  }

  if (Number.isNaN(difficulty.approachRate)) {
    difficulty.approachRate = difficulty.overallDifficulty;
    warnings.push(
      createParseWarning(
        'difficulty.approach-rate-fallback',
        'ApproachRate missing; falling back to OverallDifficulty'
      )
    );
  }

  return difficulty;
};
