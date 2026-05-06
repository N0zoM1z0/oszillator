import { parseInteger, splitKeyValueLine, type SectionLine } from '../sections';
import { createParseWarning, type ParseWarning } from '../warnings';

export type MetadataSection = {
  title: string;
  titleUnicode: string;
  artist: string;
  artistUnicode: string;
  creator: string;
  version: string;
  source: string;
  tags: string[];
  beatmapId: number | null;
  beatmapSetId: number | null;
  extras: Record<string, string>;
};

export const parseMetadataSection = (lines: readonly SectionLine[], warnings: ParseWarning[]): MetadataSection => {
  const metadata: MetadataSection = {
    title: '',
    titleUnicode: '',
    artist: '',
    artistUnicode: '',
    creator: '',
    version: '',
    source: '',
    tags: [],
    beatmapId: null,
    beatmapSetId: null,
    extras: {}
  };

  for (const line of lines) {
    const entry = splitKeyValueLine(line);
    if (!entry) {
      warnings.push(createParseWarning('metadata.malformed-line', `Malformed Metadata line: ${line.text}`, line.lineNumber));
      continue;
    }

    const { key, value } = entry;
    metadata.extras[key] = value;

    switch (key) {
      case 'Title':
        metadata.title = value;
        break;
      case 'TitleUnicode':
        metadata.titleUnicode = value;
        break;
      case 'Artist':
        metadata.artist = value;
        break;
      case 'ArtistUnicode':
        metadata.artistUnicode = value;
        break;
      case 'Creator':
        metadata.creator = value;
        break;
      case 'Version':
        metadata.version = value;
        break;
      case 'Source':
        metadata.source = value;
        break;
      case 'Tags':
        metadata.tags = value.split(/\s+/).filter(Boolean);
        break;
      case 'BeatmapID':
        metadata.beatmapId = parseInteger(value);
        break;
      case 'BeatmapSetID':
        metadata.beatmapSetId = parseInteger(value);
        break;
      default:
        break;
    }
  }

  return metadata;
};
