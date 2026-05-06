import { parseColoursSection, type ColoursSection } from './sections/colours';
import { parseDifficultySection, type DifficultySection } from './sections/difficulty';
import { parseEventsSection, type EventsSection } from './sections/events';
import { parseGeneralSection, type GeneralSection } from './sections/general';
import { parseHitObjectsSection, type RawHitObject } from './sections/hit-objects';
import { parseMetadataSection, type MetadataSection } from './sections/metadata';
import { parseTimingPointsSection, type TimingPointRaw } from './sections/timing-points';
import { groupSections, normalizeNewlines, stripBom, type GroupedSections } from './sections';
import type { ParseWarning } from './warnings';

export type ParsedOsuFile = {
  formatVersion: number;
  general: GeneralSection;
  metadata: MetadataSection;
  difficulty: DifficultySection;
  events: EventsSection;
  timingPoints: TimingPointRaw[];
  colours: ColoursSection;
  hitObjects: RawHitObject[];
  rawSections: GroupedSections;
  warnings: ParseWarning[];
};

const parseFormatVersion = (header: string): number => {
  const match = /^osu file format v(\d+)$/i.exec(header.trim());
  if (!match) {
    throw new Error('Missing or invalid osu format header');
  }

  return Number.parseInt(match[1] as string, 10);
};

export const parseOsu = (text: string): ParsedOsuFile => {
  const normalized = normalizeNewlines(stripBom(text));
  const lines = normalized.split('\n');
  const formatVersion = parseFormatVersion(lines[0] ?? '');
  const grouped = groupSections(lines);
  const warnings = [...grouped.warnings];

  const general = parseGeneralSection(grouped.sections.General ?? [], warnings);
  const metadata = parseMetadataSection(grouped.sections.Metadata ?? [], warnings);
  const difficulty = parseDifficultySection(grouped.sections.Difficulty ?? [], warnings);
  const events = parseEventsSection(grouped.sections.Events ?? [], warnings);
  const timingPoints = parseTimingPointsSection(grouped.sections.TimingPoints ?? [], warnings);
  const colours = parseColoursSection(grouped.sections.Colours ?? [], warnings);
  const hitObjects = parseHitObjectsSection(grouped.sections.HitObjects ?? [], warnings);

  return {
    formatVersion,
    general,
    metadata,
    difficulty,
    events,
    timingPoints,
    colours,
    hitObjects,
    rawSections: grouped.sections,
    warnings
  };
};
