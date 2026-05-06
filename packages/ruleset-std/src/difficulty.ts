export const difficultyRange = (
  difficulty: number,
  min: number,
  mid: number,
  max: number
): number => {
  if (difficulty > 5) {
    return mid + ((max - mid) * (difficulty - 5)) / 5;
  }

  if (difficulty < 5) {
    return mid - ((mid - min) * (5 - difficulty)) / 5;
  }

  return mid;
};

export const clampDifficulty = (value: number): number => Math.min(Math.max(value, 0), 10);

export const circleRadiusFromCs = (cs: number): number => 54.4 - 4.48 * clampDifficulty(cs);

export const preemptFromAr = (ar: number): number => difficultyRange(clampDifficulty(ar), 1800, 1200, 450);

export const fadeInFromAr = (ar: number): number => difficultyRange(clampDifficulty(ar), 1200, 800, 300);

export const hitWindow300FromOd = (od: number): number => difficultyRange(clampDifficulty(od), 80, 50, 20);

export const hitWindow100FromOd = (od: number): number => difficultyRange(clampDifficulty(od), 140, 100, 60);

export const hitWindow50FromOd = (od: number): number => difficultyRange(clampDifficulty(od), 200, 150, 100);

export type DerivedDifficulty = {
  circleSize: number;
  overallDifficulty: number;
  approachRate: number;
  hpDrainRate: number;
  sliderMultiplier: number;
  sliderTickRate: number;
  circleRadius: number;
  preemptMs: number;
  fadeInMs: number;
  hitWindow300Ms: number;
  hitWindow100Ms: number;
  hitWindow50Ms: number;
};

export const deriveDifficulty = (difficulty: {
  circleSize: number;
  overallDifficulty: number;
  approachRate: number;
  hpDrainRate: number;
  sliderMultiplier: number;
  sliderTickRate: number;
}): DerivedDifficulty => ({
  ...difficulty,
  circleRadius: circleRadiusFromCs(difficulty.circleSize),
  preemptMs: preemptFromAr(difficulty.approachRate),
  fadeInMs: fadeInFromAr(difficulty.approachRate),
  hitWindow300Ms: hitWindow300FromOd(difficulty.overallDifficulty),
  hitWindow100Ms: hitWindow100FromOd(difficulty.overallDifficulty),
  hitWindow50Ms: hitWindow50FromOd(difficulty.overallDifficulty)
});
