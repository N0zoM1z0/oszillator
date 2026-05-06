import { parseFloatNumber, parseInteger, splitKeyValueLine, type SectionLine } from '../sections';
import { createParseWarning, type ParseWarning } from '../warnings';

export type GeneralSection = {
  audioFilename: string | null;
  audioLeadIn: number;
  previewTime: number;
  countdown: number;
  sampleSet: string | null;
  stackLeniency: number;
  mode: number;
  extras: Record<string, string>;
};

export const parseGeneralSection = (lines: readonly SectionLine[], warnings: ParseWarning[]): GeneralSection => {
  const general: GeneralSection = {
    audioFilename: null,
    audioLeadIn: 0,
    previewTime: -1,
    countdown: 0,
    sampleSet: null,
    stackLeniency: 0.7,
    mode: 0,
    extras: {}
  };

  for (const line of lines) {
    const entry = splitKeyValueLine(line);
    if (!entry) {
      warnings.push(createParseWarning('general.malformed-line', `Malformed General line: ${line.text}`, line.lineNumber));
      continue;
    }

    const { key, value } = entry;
    general.extras[key] = value;

    switch (key) {
      case 'AudioFilename':
        general.audioFilename = value;
        break;
      case 'AudioLeadIn':
        general.audioLeadIn = parseInteger(value) ?? general.audioLeadIn;
        break;
      case 'PreviewTime':
        general.previewTime = parseInteger(value) ?? general.previewTime;
        break;
      case 'Countdown':
        general.countdown = parseInteger(value) ?? general.countdown;
        break;
      case 'SampleSet':
        general.sampleSet = value;
        break;
      case 'StackLeniency':
        general.stackLeniency = parseFloatNumber(value) ?? general.stackLeniency;
        break;
      case 'Mode':
        general.mode = parseInteger(value) ?? general.mode;
        break;
      default:
        break;
    }
  }

  return general;
};
