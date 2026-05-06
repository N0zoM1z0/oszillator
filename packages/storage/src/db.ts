import { openDB, type IDBPDatabase } from 'idb';

import { migrateStorage } from './migrations';
import { STORAGE_DB_NAME, STORAGE_SCHEMA_VERSION, type SettingsRecord } from './schema';

export const openOszillatorDb = (): Promise<IDBPDatabase> =>
  openDB(STORAGE_DB_NAME, STORAGE_SCHEMA_VERSION, {
    upgrade(database, oldVersion) {
      migrateStorage(database, oldVersion);
    }
  });

export const DEFAULT_SETTINGS: SettingsRecord = {
  id: 'settings',
  audioOffsetMs: 0,
  dimBackground: 0.7,
  keyK1: 'KeyZ',
  keyK2: 'KeyX'
};
