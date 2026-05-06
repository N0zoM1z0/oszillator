import { describe, expect, it } from 'vitest';

import { parseOsu } from '@oszillator/osu-parser';

import { buildControlPoints, getActiveControlPoint } from './control-points';
import { deriveDifficulty, difficultyRange } from './difficulty';
import { RulesetStdGame } from './judgement/game';
import { prepareBeatmap } from './prepare';

const osuText = `osu file format v14
[General]
AudioFilename: sample.wav
Mode: 0
[Metadata]
Title: Test Song
Artist: Artist
Creator: Mapper
Version: Unit
[Difficulty]
CircleSize: 4
OverallDifficulty: 6
ApproachRate: 7
SliderMultiplier: 1.4
SliderTickRate: 1
[TimingPoints]
0,500,4,2,0,60,1,0
1000,-50,4,2,0,60,0,0
[HitObjects]
256,192,1000,1,0,0:0:0:0:
128,192,1500,2,0,L|384:192,1,256
256,192,2500,8,0,3500
`;

describe('difficulty helpers', () => {
  it('matches the standard range formula', () => {
    expect(difficultyRange(7, 1800, 1200, 450)).toBe(900);
    expect(deriveDifficulty({
      circleSize: 4,
      overallDifficulty: 6,
      approachRate: 7,
      hpDrainRate: 5,
      sliderMultiplier: 1.4,
      sliderTickRate: 1
    }).circleRadius).toBeCloseTo(36.48);
  });
});

describe('control points', () => {
  it('looks up the active timing point', () => {
    const parsed = parseOsu(osuText);
    const controlPoints = buildControlPoints(parsed.timingPoints);

    expect(getActiveControlPoint(controlPoints, 1500).sliderVelocityMultiplier).toBeCloseTo(2);
  });
});

describe('prepareBeatmap', () => {
  it('preserves supported object counts', () => {
    const beatmap = prepareBeatmap(parseOsu(osuText));

    expect(beatmap.objects).toHaveLength(3);
    expect(beatmap.objects[1]).toMatchObject({ kind: 'slider' });
  });

  it('supports deterministic circle replay judgement', () => {
    const beatmap = prepareBeatmap(parseOsu(osuText));
    const game = new RulesetStdGame();
    game.start(beatmap);

    const events = game.handleInput({
      id: 'press-1',
      kind: 'press',
      source: 'keyboard',
      key: 'K1',
      playfieldPosition: { x: 256, y: 192 },
      browserTimestampMs: 1000,
      gameTimestampMs: 1000
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ result: 'great' });
    expect(game.getState().score.counts.great).toBe(1);
  });
});
