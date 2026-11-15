import { parseOsu, type ParsedOsuFile } from '@oszillator/osu-parser';

import { hashArchivePrefix } from './archive-hash';
import { resolveArchivePath } from './asset-resolver';
import type { ArchiveEntry } from './unzip';
import { unzipOszArchive } from './unzip';

const textDecoder = new TextDecoder();

export type BeatmapManifestEntry = {
  normalizedPath: string;
  parsed: ParsedOsuFile;
  audioPath: string | null;
  backgroundPath: string | null;
  videoPath: string | null;
  customSamplePaths: string[];
  supported: boolean;
};

export type OszArchiveManifest = {
  archiveId: string;
  beatmaps: BeatmapManifestEntry[];
  entryBytes: Record<string, Uint8Array>;
};

const fileExtension = (value: string): string => {
  const lastDot = value.lastIndexOf('.');
  return lastDot === -1 ? '' : value.slice(lastDot).toLowerCase();
};

export const buildOszArchiveManifest = (entries: readonly ArchiveEntry[]): OszArchiveManifest => {
  const normalizedPaths = entries.map((entry) => entry.normalizedPath);
  const entryBytes = Object.fromEntries(entries.map((entry) => [entry.normalizedPath, entry.bytes]));
  const beatmaps = entries
    .filter((entry) => fileExtension(entry.normalizedPath) === '.osu')
    .map<BeatmapManifestEntry>((entry) => {
      const parsed = parseOsu(textDecoder.decode(entry.bytes));
      const customSamplePaths = parsed.hitObjects
        .map((object) => object.hitSample?.filename)
        .filter((filename): filename is string => Boolean(filename))
        .map((filename) => resolveArchivePath(normalizedPaths, filename, entry.normalizedPath))
        .filter((path): path is string => Boolean(path));

      return {
        normalizedPath: entry.normalizedPath,
        audioPath: resolveArchivePath(normalizedPaths, parsed.general.audioFilename, entry.normalizedPath),
        backgroundPath: resolveArchivePath(normalizedPaths, parsed.events.backgroundFilename, entry.normalizedPath),
        videoPath: resolveArchivePath(normalizedPaths, parsed.events.videoFilename, entry.normalizedPath),
        customSamplePaths: [...new Set(customSamplePaths)],
        supported: parsed.general.mode === 0,
        parsed
      };
    });

  return {
    archiveId: hashArchivePrefix(entries),
    beatmaps,
    entryBytes
  };
};

export const createArchiveManifestFromArrayBuffer = (buffer: ArrayBuffer): OszArchiveManifest =>
  buildOszArchiveManifest(unzipOszArchive(buffer));
