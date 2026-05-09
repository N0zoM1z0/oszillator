import { describe, expect, it } from 'vitest';

import { parseOsu } from '@oszillator/osu-parser';

import { buildControlPoints, getActiveControlPoint } from './control-points';
import { deriveDifficulty, difficultyRange } from './difficulty';
import { RulesetStdGame } from './judgement/game';
import { gameplayModTimeRate } from './mods';
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
[Colours]
Combo1 : 255,96,128
Combo2 : 96,220,255
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

  it('uses double-time speed for DT and NC mods', () => {
    expect(gameplayModTimeRate(['DT'])).toBe(1.5);
    expect(gameplayModTimeRate(['NC'])).toBe(1.5);
    expect(gameplayModTimeRate(['HD', 'HR'])).toBe(1);
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
    expect(beatmap.colours.combos).toHaveLength(2);
    expect(beatmap.objects.map((object) => object.comboIndex)).toEqual([0, 0, 0]);
  });

  it('tracks combo colour indices across new combos', () => {
    const parsed = parseOsu(`osu file format v14
[General]
AudioFilename: sample.wav
Mode: 0
[Metadata]
Title: Test Song
Artist: Artist
Creator: Mapper
Version: Combos
[Difficulty]
CircleSize: 4
OverallDifficulty: 6
ApproachRate: 7
SliderMultiplier: 1.4
SliderTickRate: 1
[TimingPoints]
0,500,4,2,0,60,1,0
[HitObjects]
100,100,1000,1,0,0:0:0:0:
120,120,1200,5,0,0:0:0:0:
140,140,1400,21,0,0:0:0:0:
160,160,1600,1,0,0:0:0:0:
`);
    const beatmap = prepareBeatmap(parsed);

    expect(beatmap.objects.map((object) => object.comboIndex)).toEqual([0, 1, 3, 3]);
  });

  it('applies hardrock difficulty and vertical object mirroring', () => {
    const parsed = parseOsu(`osu file format v14
[General]
AudioFilename: sample.wav
Mode: 0
[Metadata]
Title: Test Song
Artist: Artist
Creator: Mapper
Version: HR
[Difficulty]
CircleSize: 4
OverallDifficulty: 6
ApproachRate: 7
SliderMultiplier: 1.4
SliderTickRate: 1
[TimingPoints]
0,500,4,2,0,60,1,0
[HitObjects]
100,100,1000,1,0,0:0:0:0:
120,80,1500,2,0,L|200:120,1,160
`);
    const beatmap = prepareBeatmap(parsed, { mods: ['HR'] });
    const circle = beatmap.objects[0];
    const slider = beatmap.objects[1];

    expect(beatmap.difficulty.circleSize).toBeCloseTo(5.2);
    expect(beatmap.difficulty.overallDifficulty).toBeCloseTo(8.4);
    expect(beatmap.difficulty.approachRate).toBeCloseTo(9.8);
    expect(circle).toMatchObject({ kind: 'circle', position: { x: 100, y: 284 } });
    expect(slider).toMatchObject({ kind: 'slider', position: { x: 120, y: 304 } });
    expect(slider?.kind === 'slider' ? slider.trackPoints[0] : null).toEqual({ x: 120, y: 304 });
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
    expect(events[0]).toMatchObject({ result: 'great', offsetMs: 0 });
    expect(game.getState().score.counts.great).toBe(1);
    expect(game.getState().objects[0]).toMatchObject({ status: 'judged', judgedAtMs: 1000 });
    expect(game.getJudgedObjectCount()).toBe(1);
  });

  it('keeps gameplay state object references stable for render loops', () => {
    const beatmap = prepareBeatmap(parseOsu(osuText));
    const game = new RulesetStdGame();
    game.start(beatmap);

    const initialObjects = game.getState().objects;
    game.updateTo(500);
    game.updateTo(750);

    expect(game.getCurrentTimeMs()).toBe(750);
    expect(game.getState().objects).toBe(initialObjects);
  });

  it('precomputes slider tracks to stop at pixel length tails', () => {
    const parsed = parseOsu(`osu file format v14
[General]
AudioFilename: sample.wav
Mode: 0
[Metadata]
Title: Test Song
Artist: Artist
Creator: Mapper
Version: Truncated
[Difficulty]
CircleSize: 4
OverallDifficulty: 6
ApproachRate: 7
SliderMultiplier: 1.4
SliderTickRate: 1
[TimingPoints]
0,500,4,2,0,60,1,0
[HitObjects]
0,0,1000,2,0,L|100:0|200:0,1,150
`);
    const beatmap = prepareBeatmap(parsed);
    const slider = beatmap.objects[0];

    expect(slider?.kind).toBe('slider');
    if (slider?.kind !== 'slider') {
      return;
    }

    expect(slider.trackPoints.at(-1)).toEqual({ x: 150, y: 0 });
    expect(slider.checkpoints.at(-1)?.position).toEqual({ x: 150, y: 0 });
  });

  it('precomputes slider tracks beyond control points when pixel length is longer', () => {
    const parsed = parseOsu(`osu file format v14
[General]
AudioFilename: sample.wav
Mode: 0
[Metadata]
Title: Test Song
Artist: Artist
Creator: Mapper
Version: Extended
[Difficulty]
CircleSize: 4
OverallDifficulty: 6
ApproachRate: 7
SliderMultiplier: 1.4
SliderTickRate: 1
[TimingPoints]
0,500,4,2,0,60,1,0
[HitObjects]
0,0,1000,2,0,L|100:0,1,150
`);
    const beatmap = prepareBeatmap(parsed);
    const slider = beatmap.objects[0];

    expect(slider?.kind).toBe('slider');
    if (slider?.kind !== 'slider') {
      return;
    }

    expect(slider.trackPoints.at(-1)).toEqual({ x: 150, y: 0 });
    expect(slider.checkpoints.at(-1)?.position).toEqual({ x: 150, y: 0 });
  });
});
