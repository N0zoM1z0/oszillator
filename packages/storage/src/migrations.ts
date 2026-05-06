import type { IDBPDatabase } from 'idb';

export const migrateStorage = (database: IDBPDatabase, oldVersion: number): void => {
  if (oldVersion < 1) {
    database.createObjectStore('beatmapSets', { keyPath: 'id' });
    const difficulties = database.createObjectStore('difficulties', { keyPath: 'id' });
    difficulties.createIndex('setId', 'setId');
    const scores = database.createObjectStore('scores', { keyPath: 'id' });
    scores.createIndex('difficultyId', 'difficultyId');
    database.createObjectStore('settings', { keyPath: 'id' });
  }
};
