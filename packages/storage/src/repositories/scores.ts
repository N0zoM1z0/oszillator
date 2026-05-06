import type { IDBPDatabase } from 'idb';

import type { LocalScoreRecord } from '../schema';

export const saveLocalScore = async (database: IDBPDatabase, score: LocalScoreRecord): Promise<void> => {
  await database.put('scores', score);
};

export const listScoresForDifficulty = async (
  database: IDBPDatabase,
  difficultyId: string
): Promise<LocalScoreRecord[]> => {
  const tx = database.transaction('scores');
  const index = tx.store.index('difficultyId');
  return (await index.getAll(difficultyId)) as LocalScoreRecord[];
};
