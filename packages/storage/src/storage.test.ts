import 'fake-indexeddb/auto';

import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';

import { openOszillatorDb } from './db';
import { listBeatmapSets, listDifficultiesForSet, saveBeatmapSet } from './repositories/library';
import { listScoresForDifficulty, saveLocalScore } from './repositories/scores';
import { difficultyRecordId, STORAGE_SCHEMA_VERSION, type DifficultyRecord, type LocalScoreRecord } from './schema';

let databaseCount = 0;
const uniqueName = (): string => `oszillator-test-${databaseCount++}`;

const difficulty = (setId: string, path: string, version = path): DifficultyRecord => ({
  id: difficultyRecordId(setId, path),
  setId,
  version,
  objectCount: 1,
  audioPath: 'audio.mp3',
  backgroundPath: null
});

const score = (id: string, difficultyId: string): LocalScoreRecord => ({
  id,
  difficultyId,
  playedAt: 0,
  score: 300,
  accuracy: 1,
  maxCombo: 1,
  counts: { great: 1, ok: 0, meh: 0, miss: 0 }
});

const set = (id: string) => ({ id, title: id, artist: 'Artist', creator: 'Mapper', importedAt: 0 });

/** Creates a database exactly as schema v1 left it. */
const createV1Database = async (
  name: string,
  difficulties: Omit<DifficultyRecord, 'id'>[],
  legacyIds: string[],
  scores: LocalScoreRecord[]
) => {
  const database = await openDB(name, 1, {
    upgrade(v1) {
      v1.createObjectStore('beatmapSets', { keyPath: 'id' });
      v1.createObjectStore('difficulties', { keyPath: 'id' }).createIndex('setId', 'setId');
      v1.createObjectStore('scores', { keyPath: 'id' }).createIndex('difficultyId', 'difficultyId');
      v1.createObjectStore('settings', { keyPath: 'id' });
    }
  });
  const tx = database.transaction(['difficulties', 'scores'], 'readwrite');
  for (const [index, record] of difficulties.entries()) await tx.objectStore('difficulties').put({ ...record, id: legacyIds[index] });
  for (const record of scores) await tx.objectStore('scores').put(record);
  await tx.done;
  database.close();
};

describe('storage schema', () => {
  it('creates the current schema in a fresh database', async () => {
    const database = await openOszillatorDb(uniqueName());

    expect(database.version).toBe(STORAGE_SCHEMA_VERSION);
    expect([...database.objectStoreNames].sort()).toEqual(['beatmapSets', 'difficulties', 'scores', 'settings']);
    database.close();
  });

  it('keeps equally named difficulties from different archives apart', async () => {
    const database = await openOszillatorDb(uniqueName());
    await saveBeatmapSet(database, set('archive-a'), [difficulty('archive-a', 'map.osu', 'A')]);
    await saveBeatmapSet(database, set('archive-b'), [difficulty('archive-b', 'map.osu', 'B')]);
    await saveLocalScore(database, score('score-a', difficultyRecordId('archive-a', 'map.osu')));

    // Regression: both archives used to share the key "map.osu", so the
    // second import replaced the first archive's difficulty.
    expect((await listDifficultiesForSet(database, 'archive-a')).map((record) => record.version)).toEqual(['A']);
    expect((await listDifficultiesForSet(database, 'archive-b')).map((record) => record.version)).toEqual(['B']);
    expect(await listBeatmapSets(database)).toHaveLength(2);
    expect(await listScoresForDifficulty(database, difficultyRecordId('archive-b', 'map.osu'))).toEqual([]);
    expect(await listScoresForDifficulty(database, difficultyRecordId('archive-a', 'map.osu'))).toHaveLength(1);
    database.close();
  });
});

describe('v1 to v2 migration', () => {
  it('scopes difficulty IDs to their archive and repoints scores', async () => {
    const name = uniqueName();
    await createV1Database(
      name,
      [
        { setId: 'archive-a', version: 'Hard', objectCount: 1, audioPath: 'audio.mp3', backgroundPath: null },
        { setId: 'archive-b', version: 'Easy', objectCount: 1, audioPath: 'audio.mp3', backgroundPath: 'bg.jpg' }
      ],
      ['song/hard.osu', 'easy.osu'],
      [score('one', 'song/hard.osu'), score('two', 'song/hard.osu'), score('three', 'easy.osu'), score('orphan', 'deleted.osu')]
    );

    const database = await openOszillatorDb(name);
    expect(database.version).toBe(2);
    expect(await listDifficultiesForSet(database, 'archive-a')).toEqual([
      { id: 'archive-a/song/hard.osu', setId: 'archive-a', version: 'Hard', objectCount: 1, audioPath: 'audio.mp3', backgroundPath: null }
    ]);
    expect((await listDifficultiesForSet(database, 'archive-b')).map((record) => record.id)).toEqual(['archive-b/easy.osu']);
    expect(await database.count('difficulties')).toBe(2);

    expect((await listScoresForDifficulty(database, 'archive-a/song/hard.osu')).map((record) => record.id).sort()).toEqual(['one', 'two']);
    expect((await listScoresForDifficulty(database, 'archive-b/easy.osu')).map((record) => record.id)).toEqual(['three']);
    // A score whose difficulty record no longer exists cannot be attributed and keeps its legacy ID.
    expect((await listScoresForDifficulty(database, 'deleted.osu')).map((record) => record.id)).toEqual(['orphan']);
    database.close();
  });

  it('is a no-op for an empty v1 database and leaves it reopenable', async () => {
    const name = uniqueName();
    await createV1Database(name, [], [], []);

    const migrated = await openOszillatorDb(name);
    expect(await migrated.count('difficulties')).toBe(0);
    migrated.close();

    const reopened = await openOszillatorDb(name);
    expect(reopened.version).toBe(2);
    reopened.close();
  });
});
