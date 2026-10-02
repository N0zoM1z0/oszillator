import { gameplayModTimeRate, prepareBeatmap, type PrepareBeatmapOptions, type PreparedBeatmap } from '@oszillator/ruleset-std';
import type { ParsedOsuFile } from '@oszillator/osu-parser';

export class PreparedBeatmapCache {
  private readonly maps = new WeakMap<ParsedOsuFile, Map<boolean, PreparedBeatmap>>();

  get(parsed: ParsedOsuFile, options: PrepareBeatmapOptions = {}): PreparedBeatmap {
    let variants = this.maps.get(parsed);
    if (!variants) {
      variants = new Map();
      this.maps.set(parsed, variants);
    }
    const mods = [...(options.mods ?? [])];
    const hardRock = mods.includes('HR');
    let prepared = variants.get(hardRock);
    if (!prepared) {
      prepared = prepareBeatmap(parsed, { mods: hardRock ? ['HR'] : [] });
      variants.set(hardRock, prepared);
    }
    return { ...prepared, mods, timeRate: gameplayModTimeRate(mods) };
  }
}
