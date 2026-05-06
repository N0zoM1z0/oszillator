export const STORAGE_SCHEMA_VERSION = 1;
export const STORAGE_DB_NAME = 'oszillator';

export type BeatmapSetRecord = {
  id: string;
  title: string;
  artist: string;
  creator: string;
  importedAt: number;
};

export type DifficultyRecord = {
  id: string;
  setId: string;
  version: string;
  objectCount: number;
  audioPath: string | null;
  backgroundPath: string | null;
};

export type LocalScoreRecord = {
  id: string;
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

export type SettingsRecord = {
  id: 'settings';
  audioOffsetMs: number;
  dimBackground: number;
  keyK1: string;
  keyK2: string;
};
