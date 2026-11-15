export const STORAGE_SCHEMA_VERSION = 2;
export const STORAGE_DB_NAME = 'oszillator';

export type BeatmapSetRecord = {
  id: string;
  title: string;
  artist: string;
  creator: string;
  importedAt: number;
};

/**
 * Difficulty IDs combine the archive ID with the `.osu` path inside it, so
 * equally named files in different archives do not overwrite each other.
 * (Schema v1 used the bare path.)
 */
export const difficultyRecordId = (setId: string, normalizedPath: string): string => `${setId}/${normalizedPath}`;

export type DifficultyRecord = {
  /** See `difficultyRecordId`. */
  id: string;
  setId: string;
  version: string;
  objectCount: number;
  audioPath: string | null;
  backgroundPath: string | null;
};

export type LocalScoreRecord = {
  id: string;
  /** `DifficultyRecord.id` of the played difficulty. */
  difficultyId: string;
  playedAt: number;
  score: number;
  accuracy: number;
  maxCombo: number;
  counts: {
    great: number;
    ok: number;
    meh: number;
    miss: number;
  };
};
