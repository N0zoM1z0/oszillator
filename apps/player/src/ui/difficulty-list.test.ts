import { describe, expect, it } from 'vitest';

import { parseOsu } from '@oszillator/osu-parser';
import type { BeatmapManifestEntry } from '@oszillator/osz-loader';

import { sortBeatmaps } from './difficulty-list';

const entry = (artist: string, title: string, version: string, overallDifficulty: number): BeatmapManifestEntry => ({
  normalizedPath: `${title}-${version}.osu`,
  parsed: parseOsu(`osu file format v14
[Metadata]
Artist: ${artist}
Title: ${title}
Version: ${version}
[Difficulty]
OverallDifficulty: ${overallDifficulty}
ApproachRate: ${overallDifficulty}
`),
  audioPath: null,
  backgroundPath: null,
  videoPath: null,
  customSamplePaths: [],
  supported: true
});

describe('sortBeatmaps', () => {
  it('groups difficulties by song and orders each song from easiest to hardest', () => {
    const sorted = sortBeatmaps([
      entry('B Artist', 'Song', 'Insane', 8),
      entry('A Artist', 'Song', 'Hard', 6),
      entry('B Artist', 'Song', 'Easy', 2),
      entry('A Artist', 'Song', 'Normal', 4)
    ]);

    expect(sorted.map((beatmap) => `${beatmap.parsed.metadata.artist}/${beatmap.parsed.metadata.version}`)).toEqual([
      'A Artist/Normal',
      'A Artist/Hard',
      'B Artist/Easy',
      'B Artist/Insane'
    ]);
  });
});
