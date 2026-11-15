import type { IDBPDatabase, IDBPTransaction } from 'idb';

import { difficultyRecordId, type DifficultyRecord, type LocalScoreRecord } from './schema';

type UpgradeTransaction = IDBPTransaction<unknown, string[], 'versionchange'>;

const createInitialStores = (database: IDBPDatabase): void => {
  database.createObjectStore('beatmapSets', { keyPath: 'id' });
  const difficulties = database.createObjectStore('difficulties', { keyPath: 'id' });
  difficulties.createIndex('setId', 'setId');
  const scores = database.createObjectStore('scores', { keyPath: 'id' });
  scores.createIndex('difficultyId', 'difficultyId');
  // Reserved for player settings; nothing reads or writes it yet.
  database.createObjectStore('settings', { keyPath: 'id' });
};

/**
 * v1 keyed difficulties by their `.osu` path alone. Re-key them as
 * `<setId>/<path>` and point scores at the new IDs. A v1 path could only hold
 * one record, so each score maps to the archive that last wrote that path.
 */
const scopeDifficultyIdsToArchives = async (transaction: UpgradeTransaction): Promise<void> => {
  const difficulties = transaction.objectStore('difficulties');
  const legacy = (await difficulties.getAll()) as DifficultyRecord[];
  const setIdByLegacyId = new Map(legacy.map((record) => [record.id, record.setId]));

  for (const record of legacy) {
    await difficulties.delete(record.id);
    await difficulties.put({ ...record, id: difficultyRecordId(record.setId, record.id) });
  }

  const scores = transaction.objectStore('scores');
  for (const score of (await scores.getAll()) as LocalScoreRecord[]) {
    const setId = setIdByLegacyId.get(score.difficultyId);
    if (setId !== undefined) {
      await scores.put({ ...score, difficultyId: difficultyRecordId(setId, score.difficultyId) });
    }
  }
};

/** Upgrades the database from `oldVersion` to `STORAGE_SCHEMA_VERSION` inside the version-change transaction. */
export const migrateStorage = async (database: IDBPDatabase, oldVersion: number, transaction: UpgradeTransaction): Promise<void> => {
  if (oldVersion < 1) {
    createInitialStores(database);
  }
  if (oldVersion === 1) {
    await scopeDifficultyIdsToArchives(transaction);
  }
};
