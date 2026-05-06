import { parseOsu, type ParsedOsuFile } from '@oszillator/osu-parser';

import { hashBytes } from './archive-hash';
import { resolveArchivePath } from './asset-resolver';
import type { ArchiveEntry } from './unzip';
import { unzipOszArchive } from './unzip';

const textDecoder = new TextDecoder();

export type ArchiveFileEntry = {
  path: string;
  normalizedPath: string;
  size: number;
  extension: string;
};

export type BeatmapManifestEntry = {
  filePath: string;
  normalizedPath: string;
  parsed: ParsedOsuFile;
  audioPath: string | null;
  backgroundPath: string | null;
  customSamplePaths: string[];
  supported: boolean;
};

export type AssetManifest = {
  audioCandidates: string[];
  imageCandidates: string[];
  hitsoundCandidates: string[];
};

export type OszArchiveManifest = {
  archiveId: string;
  files: ArchiveFileEntry[];
  beatmaps: BeatmapManifestEntry[];
  assets: AssetManifest;
  entryBytes: Record<string, Uint8Array>;
};

const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.wav', '.m4a']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp']);
const HITSOUND_EXTENSIONS = new Set(['.wav', '.ogg', '.mp3']);

const fileExtension = (value: string): string => {
  const lastDot = value.lastIndexOf('.');
  return lastDot === -1 ? '' : value.slice(lastDot).toLowerCase();
};

export const buildOszArchiveManifest = (entries: readonly ArchiveEntry[]): OszArchiveManifest => {
  const normalizedPaths = entries.map((entry) => entry.normalizedPath);
  const entryBytes = Object.fromEntries(entries.map((entry) => [entry.normalizedPath, entry.bytes]));
  const files = entries.map<ArchiveFileEntry>((entry) => ({
    path: entry.path,
    normalizedPath: entry.normalizedPath,
    size: entry.bytes.byteLength,
    extension: fileExtension(entry.normalizedPath)
  }));

  const audioCandidates = files
    .filter((entry) => AUDIO_EXTENSIONS.has(entry.extension))
    .map((entry) => entry.normalizedPath);
  const imageCandidates = files
    .filter((entry) => IMAGE_EXTENSIONS.has(entry.extension))
    .map((entry) => entry.normalizedPath);
  const hitsoundCandidates = files
    .filter((entry) => HITSOUND_EXTENSIONS.has(entry.extension))
    .map((entry) => entry.normalizedPath);

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
        filePath: entry.path,
        normalizedPath: entry.normalizedPath,
        audioPath: resolveArchivePath(normalizedPaths, parsed.general.audioFilename, entry.normalizedPath),
        backgroundPath: resolveArchivePath(normalizedPaths, parsed.events.backgroundFilename, entry.normalizedPath),
        customSamplePaths: [...new Set(customSamplePaths)],
        supported: parsed.general.mode === 0,
        parsed
      };
    });

  return {
    archiveId: hashBytes(new Uint8Array(entries.flatMap((entry) => Array.from(entry.bytes)).slice(0, 4096))),
    files,
    beatmaps,
    assets: {
      audioCandidates,
      imageCandidates,
      hitsoundCandidates
    },
    entryBytes
  };
};

export const createArchiveManifestFromArrayBuffer = (buffer: ArrayBuffer): OszArchiveManifest =>
  buildOszArchiveManifest(unzipOszArchive(buffer));
