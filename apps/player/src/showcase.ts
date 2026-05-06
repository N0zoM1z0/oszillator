import { parseOsu } from '@oszillator/osu-parser';
import type { BeatmapManifestEntry, OszArchiveManifest } from '@oszillator/osz-loader';

const SHOWCASE_PATH = '__generated__/make-a-move-endless-fear-showcase.osu';

const sourceStats = {
  title: 'Make a Move (Speed Up Ver.)',
  artist: 'Icon For Hire',
  creator: 'Sotarks',
  version: 'Endless Fear',
  beatmapSetId: 765778,
  beatmapId: 1627148,
  firstObjectMs: 9319,
  lastObjectMs: 48719,
  objectCount: 206,
  sliderCount: 55,
  beatLength: 296.238,
  hpDrainRate: 5.2,
  circleSize: 4,
  overallDifficulty: 9.4,
  approachRate: 9.5,
  sliderMultiplier: 2.02,
  sliderTickRate: 1
} as const;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const seededNoise = (seed: number): number => {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
};

const objectPosition = (index: number): { x: number; y: number } => {
  const angle = index * 2.399963 + seededNoise(index) * 0.7;
  const radius = 96 + seededNoise(index + 41) * 118;
  return {
    x: Math.round(clamp(256 + Math.cos(angle) * radius + Math.sin(index * 0.31) * 58, 56, 456)),
    y: Math.round(clamp(192 + Math.sin(angle) * radius + Math.cos(index * 0.27) * 42, 48, 336))
  };
};

const sliderEnd = (index: number, start: { x: number; y: number }): { x: number; y: number } => {
  const angle = index * 1.137 + Math.PI * 0.35;
  const length = 92 + seededNoise(index + 97) * 86;
  return {
    x: Math.round(clamp(start.x + Math.cos(angle) * length, 54, 458)),
    y: Math.round(clamp(start.y + Math.sin(angle) * length, 46, 338))
  };
};

const isSliderIndex = (index: number): boolean => index % 4 === 1 || (index % 17 === 0 && index > 0);

const buildHitObjects = (): string => {
  const lines: string[] = [];
  const durationMs = sourceStats.lastObjectMs - sourceStats.firstObjectMs;
  let emittedSliders = 0;

  for (let index = 0; index < sourceStats.objectCount; index += 1) {
    const progress = index / Math.max(1, sourceStats.objectCount - 1);
    const swing = Math.sin(index * 0.83) * 18 + seededNoise(index + 13) * 12;
    const time = Math.round(sourceStats.firstObjectMs + durationMs * progress + swing);
    const newCombo = index % 4 === 0 ? 4 : 0;
    const start = objectPosition(index);

    if (emittedSliders < sourceStats.sliderCount && isSliderIndex(index)) {
      const end = sliderEnd(index, start);
      const curveType = index % 3 === 0 ? 'B' : 'L';
      const control = curveType === 'B' ? `${Math.round((start.x + end.x) / 2)},${Math.round(clamp(start.y - 54, 44, 340))}` : null;
      const curve = control ? `${curveType}|${control.replace(',', ':')}|${end.x}:${end.y}` : `${curveType}|${end.x}:${end.y}`;
      const repeats = index % 23 === 5 ? 2 : 1;
      const pixelLength = Math.round(102 + seededNoise(index + 211) * 88);
      lines.push(`${start.x},${start.y},${time},${2 | newCombo},0,${curve},${repeats},${pixelLength},0|0,0:0|0:0,0:0:0:0:`);
      emittedSliders += 1;
      continue;
    }

    lines.push(`${start.x},${start.y},${time},${1 | newCombo},0,0:0:0:0:`);
  }

  return lines.join('\n');
};

const buildShowcaseOsu = (): string => `osu file format v14
[General]
AudioFilename:
Mode: 0
PreviewTime: ${sourceStats.firstObjectMs}
Countdown: 0

[Metadata]
Title: ${sourceStats.title}
Artist: ${sourceStats.artist}
Creator: ${sourceStats.creator}
Version: ${sourceStats.version} showcase
BeatmapID: ${sourceStats.beatmapId}
BeatmapSetID: ${sourceStats.beatmapSetId}
Tags: generated showcase local first no bundled assets

[Difficulty]
HPDrainRate: ${sourceStats.hpDrainRate}
CircleSize: ${sourceStats.circleSize}
OverallDifficulty: ${sourceStats.overallDifficulty}
ApproachRate: ${sourceStats.approachRate}
SliderMultiplier: ${sourceStats.sliderMultiplier}
SliderTickRate: ${sourceStats.sliderTickRate}

[Events]

[TimingPoints]
3395,${sourceStats.beatLength},4,2,0,60,1,0

[Colours]
Combo1 : 128,106,106
Combo2 : 242,189,111
Combo3 : 150,205,22
Combo4 : 249,255,176

[HitObjects]
${buildHitObjects()}
`;

export const createShowcaseManifest = (): OszArchiveManifest => {
  const parsed = parseOsu(buildShowcaseOsu());
  const beatmap: BeatmapManifestEntry = {
    filePath: SHOWCASE_PATH,
    normalizedPath: SHOWCASE_PATH,
    parsed,
    audioPath: null,
    backgroundPath: null,
    videoPath: null,
    customSamplePaths: [],
    supported: true
  };

  return {
    archiveId: 'generated-make-a-move-endless-fear-showcase',
    files: [],
    beatmaps: [beatmap],
    assets: {
      audioCandidates: [],
      imageCandidates: [],
      videoCandidates: [],
      hitsoundCandidates: []
    },
    entryBytes: {}
  };
};

export const isShowcaseBeatmap = (beatmap: BeatmapManifestEntry | null): boolean => beatmap?.normalizedPath === SHOWCASE_PATH;
