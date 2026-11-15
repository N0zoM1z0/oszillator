import type { OszArchiveManifest } from '@oszillator/osz-loader';
import { openOszillatorDb, saveBeatmapSet, saveLocalScore, type LocalScoreRecord } from '@oszillator/storage';

const withDatabase = async (task: (database: Awaited<ReturnType<typeof openOszillatorDb>>) => Promise<void>): Promise<void> => {
  const database = await openOszillatorDb();
  try {
    await task(database);
  } finally {
    database.close();
  }
};

/** Records an imported archive and its difficulties in the local library. */
export const saveImportedArchive = (manifest: OszArchiveManifest): Promise<void> => {
  const first = manifest.beatmaps[0];
  if (!first) {
    return Promise.resolve();
  }

  return withDatabase((database) =>
    saveBeatmapSet(
      database,
      {
        id: manifest.archiveId,
        title: first.parsed.metadata.title,
        artist: first.parsed.metadata.artist,
        creator: first.parsed.metadata.creator,
        importedAt: Date.now()
      },
      manifest.beatmaps.map((beatmap) => ({
        id: beatmap.normalizedPath,
        setId: manifest.archiveId,
        version: beatmap.parsed.metadata.version,
        objectCount: beatmap.parsed.hitObjects.length,
        audioPath: beatmap.audioPath,
        backgroundPath: beatmap.backgroundPath
      }))
    )
  );
};

export const saveScore = (score: LocalScoreRecord): Promise<void> => withDatabase((database) => saveLocalScore(database, score));
