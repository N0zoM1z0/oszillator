import { openDB, type IDBPDatabase } from 'idb';

import { migrateStorage } from './migrations';
import { STORAGE_DB_NAME, STORAGE_SCHEMA_VERSION } from './schema';

export const openOszillatorDb = (): Promise<IDBPDatabase> =>
  openDB(STORAGE_DB_NAME, STORAGE_SCHEMA_VERSION, {
    upgrade(database, oldVersion) {
      migrateStorage(database, oldVersion);
    }
  });
