import { parseInteger, splitKeyValueLine, type SectionLine } from '../sections';
import { createParseWarning, type ParseWarning } from '../warnings';

export type ColourEntry = {
  name: string;
  rgb: [number, number, number];
};

export type ColoursSection = {
  combos: ColourEntry[];
  sliderTrackOverride: [number, number, number] | null;
  sliderBorder: [number, number, number] | null;
};

const parseRgb = (value: string): [number, number, number] | null => {
  const parts = value.split(',').map((part) => parseInteger(part.trim()));
  if (parts.length < 3 || parts[0] === null || parts[1] === null || parts[2] === null) {
    return null;
  }

  const red = parts[0];
  const green = parts[1];
  const blue = parts[2];
  if (red === undefined || green === undefined || blue === undefined) {
    return null;
  }

  return [red, green, blue];
};

export const parseColoursSection = (lines: readonly SectionLine[], warnings: ParseWarning[]): ColoursSection => {
  const colours: ColoursSection = {
    combos: [],
    sliderTrackOverride: null,
    sliderBorder: null
  };

  for (const line of lines) {
    const entry = splitKeyValueLine(line);
    if (!entry) {
      warnings.push(createParseWarning('colours.malformed-line', `Malformed Colours line: ${line.text}`, line.lineNumber));
      continue;
    }

    const rgb = parseRgb(entry.value);
    if (!rgb) {
      warnings.push(createParseWarning('colours.invalid-rgb', `Invalid colour line: ${line.text}`, line.lineNumber));
      continue;
    }

    if (entry.key.startsWith('Combo')) {
      colours.combos.push({ name: entry.key, rgb });
      continue;
    }

    if (entry.key === 'SliderTrackOverride') {
      colours.sliderTrackOverride = rgb;
      continue;
    }

    if (entry.key === 'SliderBorder') {
      colours.sliderBorder = rgb;
    }
  }

  return colours;
};
