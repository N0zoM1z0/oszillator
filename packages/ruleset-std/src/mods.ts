export type GameplayMod = 'HD' | 'HR' | 'DT' | 'NC';

export type PrepareBeatmapOptions = {
  mods?: readonly GameplayMod[];
};

export const gameplayModTimeRate = (mods: readonly GameplayMod[] = []): number => (mods.includes('DT') || mods.includes('NC') ? 1.5 : 1);
