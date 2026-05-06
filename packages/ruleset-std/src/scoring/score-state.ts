export type HitResult = 'great' | 'ok' | 'meh' | 'miss';

export type ScoreState = {
  score: number;
  combo: number;
  maxCombo: number;
  accuracy: number;
  counts: Record<HitResult, number>;
};

const resultValue: Record<HitResult, number> = {
  great: 300,
  ok: 100,
  meh: 50,
  miss: 0
};

export const createScoreState = (): ScoreState => ({
  score: 0,
  combo: 0,
  maxCombo: 0,
  accuracy: 1,
  counts: {
    great: 0,
    ok: 0,
    meh: 0,
    miss: 0
  }
});

export const applyHitResult = (state: ScoreState, result: HitResult): ScoreState => {
  const nextCombo = result === 'miss' ? 0 : state.combo + 1;
  const nextCounts = {
    ...state.counts,
    [result]: state.counts[result] + 1
  };
  const totalObjects = Object.values(nextCounts).reduce((sum, count) => sum + count, 0);
  const earned =
    nextCounts.great * 300 +
    nextCounts.ok * 100 +
    nextCounts.meh * 50 +
    nextCounts.miss * 0;
  const accuracy = totalObjects === 0 ? 1 : earned / (totalObjects * 300);

  return {
    score: state.score + resultValue[result],
    combo: nextCombo,
    maxCombo: Math.max(state.maxCombo, nextCombo),
    accuracy,
    counts: nextCounts
  };
};
