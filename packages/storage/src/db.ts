import { openDB, type IDBPDatabase } from 'idb';

import { migrateStorage } from './migrations';
import { STORAGE_DB_NAME, STORAGE_SCHEMA_VERSION } from './schema';

export const openOszillatorDb = (name = STORAGE_DB_NAME): Promise<IDBPDatabase> =>
  openDB(name, STORAGE_SCHEMA_VERSION, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      // Every migration step awaits requests on this version-change
      // transaction, so it stays active and openDB resolves only after the
      // migration committed. On failure, abort so the upgrade rolls back and
      // openDB rejects instead of opening a half-migrated database.
      migrateStorage(database, oldVersion, transaction).catch((error: unknown) => {
        console.error('oszillator storage migration failed', error);
        transaction.abort();
      });
    }
  });
