export type GameplayMod = 'HD' | 'HR' | 'DT' | 'NC';

export type PrepareBeatmapOptions = {
  mods?: readonly GameplayMod[];
};

export const hasSpeedUpMod = (mods: readonly GameplayMod[] = []): boolean => mods.includes('DT') || mods.includes('NC');

export const gameplayModTimeRate = (mods: readonly GameplayMod[] = []): number => (hasSpeedUpMod(mods) ? 1.5 : 1);
