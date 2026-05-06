import type { IDBPDatabase } from 'idb';

import { DEFAULT_SETTINGS } from '../db';
import type { SettingsRecord } from '../schema';

export const getSettings = async (database: IDBPDatabase): Promise<SettingsRecord> => {
  const settings = await database.get('settings', 'settings');
  return (settings as SettingsRecord | undefined) ?? DEFAULT_SETTINGS;
};

export const saveSettings = async (database: IDBPDatabase, settings: SettingsRecord): Promise<void> => {
  await database.put('settings', settings);
};
