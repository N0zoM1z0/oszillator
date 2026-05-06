import { createParseWarning, type ParseWarning } from './warnings';

export type SectionLine = {
  lineNumber: number;
  text: string;
  raw: string;
};

export type GroupedSections = Record<string, SectionLine[]>;

export const stripBom = (text: string): string => text.replace(/^\uFEFF/, '');

export const normalizeNewlines = (text: string): string => text.replace(/\r\n?/g, '\n');

export const groupSections = (lines: readonly string[]): { sections: GroupedSections; warnings: ParseWarning[] } => {
  const sections: GroupedSections = {};
  const warnings: ParseWarning[] = [];
  let currentSection = '__preamble';

  sections[currentSection] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const raw = lines[index] as string;
    const text = raw.trim();

    if (text === '' || text.startsWith('//')) {
      continue;
    }

    const headerMatch = /^\[(.+)\]$/.exec(text);
    if (headerMatch) {
      currentSection = headerMatch[1] as string;
      sections[currentSection] ??= [];
      continue;
    }

    if (text.startsWith('[') && !text.endsWith(']')) {
      warnings.push(createParseWarning('section.malformed', `Malformed section header: ${text}`, index + 1));
      continue;
    }

    const sectionLines = (sections[currentSection] ??= []);
    sectionLines.push({
      lineNumber: index + 1,
      raw,
      text
    });
  }

  return { sections, warnings };
};

export const splitKeyValueLine = (line: SectionLine): { key: string; value: string } | null => {
  const separator = line.text.indexOf(':');
  if (separator === -1) {
    return null;
  }

  return {
    key: line.text.slice(0, separator).trim(),
    value: line.text.slice(separator + 1).trim()
  };
};

export const parseInteger = (value: string): number | null => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseFloatNumber = (value: string): number | null => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};
