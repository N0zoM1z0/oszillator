import { parseInteger, type SectionLine } from '../sections';
import { createParseWarning, type ParseWarning } from '../warnings';

export type BreakPeriod = {
  startTime: number;
  endTime: number;
};

export type EventsSection = {
  backgroundFilename: string | null;
  breaks: BreakPeriod[];
};

const stripQuotes = (value: string): string => value.replace(/^"(.*)"$/, '$1');

export const parseEventsSection = (lines: readonly SectionLine[], warnings: ParseWarning[]): EventsSection => {
  const events: EventsSection = {
    backgroundFilename: null,
    breaks: []
  };

  for (const line of lines) {
    const parts = line.text.split(',').map((part) => part.trim());
    const eventType = parts[0];

    if (!eventType) {
      continue;
    }

    if (eventType === '0' || eventType === 'Background') {
      const filename = parts[2];
      if (filename) {
        events.backgroundFilename = stripQuotes(filename);
      }
      continue;
    }

    if (eventType === '2' || eventType === 'Break') {
      const startTime = parseInteger(parts[1] ?? '');
      const endTime = parseInteger(parts[2] ?? '');
      if (startTime === null || endTime === null) {
        warnings.push(createParseWarning('events.invalid-break', `Invalid break line: ${line.text}`, line.lineNumber));
        continue;
      }

      events.breaks.push({ startTime, endTime });
      continue;
    }

    if (eventType === 'Video' || eventType === '1' || eventType === 'Storyboard') {
      warnings.push(
        createParseWarning('events.unsupported', `Ignoring unsupported event line: ${line.text}`, line.lineNumber)
      );
    }
  }

  return events;
};
