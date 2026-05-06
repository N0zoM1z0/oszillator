import type { IDBPDatabase } from 'idb';

import type { BeatmapSetRecord, DifficultyRecord } from '../schema';

export const saveBeatmapSet = async (
  database: IDBPDatabase,
  set: BeatmapSetRecord,
  difficulties: readonly DifficultyRecord[]
): Promise<void> => {
  const tx = database.transaction(['beatmapSets', 'difficulties'], 'readwrite');
  await tx.objectStore('beatmapSets').put(set);
  await Promise.all(difficulties.map((difficulty) => tx.objectStore('difficulties').put(difficulty)));
  await tx.done;
};

export const listBeatmapSets = async (database: IDBPDatabase): Promise<BeatmapSetRecord[]> =>
  (await database.getAll('beatmapSets')) as BeatmapSetRecord[];

export const listDifficultiesForSet = async (
  database: IDBPDatabase,
  setId: string
): Promise<DifficultyRecord[]> => {
  const tx = database.transaction('difficulties');
  return (await tx.store.index('setId').getAll(setId)) as DifficultyRecord[];
};

export const deleteBeatmapSet = async (database: IDBPDatabase, setId: string): Promise<void> => {
  const tx = database.transaction(['beatmapSets', 'difficulties', 'scores'], 'readwrite');
  await tx.objectStore('beatmapSets').delete(setId);

  const difficultyIndex = tx.objectStore('difficulties').index('setId');
  const difficultyKeys = await difficultyIndex.getAllKeys(setId);
  await Promise.all(difficultyKeys.map((key) => tx.objectStore('difficulties').delete(key)));
  await tx.done;
};
