import { describe, expect, it } from 'vitest';
import { parseOsu } from '@oszillator/osu-parser';
import { prepareBeatmap } from '@oszillator/ruleset-std';

import { PreparedBeatmapCache } from './prepared-beatmap-cache';

const source = `osu file format v14
[General]
Mode:0
[Difficulty]
CircleSize:4
OverallDifficulty:6
ApproachRate:7
SliderMultiplier:1.4
SliderTickRate:1
[TimingPoints]
0,500,4,2,0,60,1,0
[HitObjects]
128,150,2000,2,0,B|200:250|350:150,2,280,0|0|0,0:0|0:0|0:0,0:0:0:0:
`;

describe('prepared beatmap cache', () => {
  it('preserves preparation results while sharing geometry across visual and speed mods', () => {
    const parsed = parseOsu(source);
    const cache = new PreparedBeatmapCache();
    const normal = cache.get(parsed);
    for (const mods of [['HD'], ['DT'], ['HD', 'NC']] as const) {
      const prepared = cache.get(parsed, { mods });
      expect(prepared).toEqual(prepareBeatmap(parsed, { mods }));
      expect(prepared.objects).toBe(normal.objects);
    }
    expect(normal.mods).toEqual([]);
    expect(normal.timeRate).toBe(1);
  });

  it('isolates HardRock geometry and different parsed maps', () => {
    const parsed = parseOsu(source);
    const cache = new PreparedBeatmapCache();
    const normal = cache.get(parsed);
    const hardRock = cache.get(parsed, { mods: ['HR'] });
    expect(hardRock).toEqual(prepareBeatmap(parsed, { mods: ['HR'] }));
    expect(hardRock.objects).not.toBe(normal.objects);
    expect(cache.get(parsed, { mods: ['HD', 'HR', 'DT'] }).objects).toBe(hardRock.objects);
    expect(cache.get(parseOsu(source)).objects).not.toBe(normal.objects);
  });
});
