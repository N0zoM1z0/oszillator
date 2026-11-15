import { describe, expect, it } from 'vitest';

import type { GameplayButton, GameplayInputEvent, Vec2 } from '@oszillator/core';
import { parseOsu } from '@oszillator/osu-parser';

import { AutoplayDriver } from '../autoplay';
import { prepareBeatmap } from '../prepare';
import { RulesetStdGame, type JudgementEvent } from './game';

const beatmapWith = (hitObjects: string) =>
  prepareBeatmap(
    parseOsu(`osu file format v14
[Difficulty]
CircleSize: 4
OverallDifficulty: 6
ApproachRate: 7
SliderMultiplier: 1
SliderTickRate: 1
[TimingPoints]
0,1000,4,2,0,60,1,0
[HitObjects]
${hitObjects}
`)
  );

let inputId = 0;
const input = (kind: GameplayInputEvent['kind'], timeMs: number, position: Vec2, key?: GameplayButton): GameplayInputEvent => ({
  id: `test-${inputId++}`,
  kind,
  source: 'keyboard',
  playfieldPosition: position,
  browserTimestampMs: timeMs,
  gameTimestampMs: timeMs,
  ...(key ? { key } : {})
});

const center = { x: 256, y: 192 };
const onSpinnerRing = (angle: number): Vec2 => ({ x: 256 + Math.cos(angle) * 100, y: 192 + Math.sin(angle) * 100 });

/** Spins the cursor at 5 rotations/s between `fromMs` and `toMs`, sampling every 10 ms. */
const spin = (game: RulesetStdGame, fromMs: number, toMs: number, onStep?: (timeMs: number) => void): void => {
  for (let timeMs = fromMs; timeMs <= toMs; timeMs += 10) {
    onStep?.(timeMs);
    game.handleInput(input('move', timeMs, onSpinnerRing((timeMs / 1000) * Math.PI * 10)));
  }
};

describe('spinner judgement', () => {
  const spinner = beatmapWith('256,192,1000,12,0,2000');

  it('awards a full spinner while a button is held', () => {
    const game = new RulesetStdGame();
    game.start(spinner);
    game.handleInput(input('press', 1000, center, 'K1'));
    spin(game, 1000, 2000);

    expect(game.updateTo(2000)).toMatchObject([{ result: 'great' }]);
  });

  it('ignores cursor rotation without a held button', () => {
    const game = new RulesetStdGame();
    game.start(spinner);
    spin(game, 1000, 2000);

    expect(game.updateTo(2000)).toMatchObject([{ result: 'miss' }]);
  });

  it('keeps accumulated rotation when alternating keys mid-spin', () => {
    const game = new RulesetStdGame();
    game.start(spinner);
    let held: GameplayButton = 'K1';
    game.handleInput(input('press', 1000, center, held));
    spin(game, 1000, 2000, (timeMs) => {
      if (timeMs % 200 !== 100) return;
      // Regression: each new press used to reset the spinner's progress.
      const next: GameplayButton = held === 'K1' ? 'K2' : 'K1';
      game.handleInput(input('press', timeMs, center, next));
      game.handleInput(input('release', timeMs, center, held));
      held = next;
    });

    expect(game.updateTo(2000)).toMatchObject([{ result: 'great' }]);
  });
});

describe('slider judgement', () => {
  // 100 px per 1000 ms beat with one tick per beat: two 200 px spans give
  // tick@2000, repeat@3000, tick@4000 and tail@5000.
  const slider = beatmapWith('0,0,1000,2,0,L|200:0,2,200');

  const holdAndFollow = (game: RulesetStdGame, skipCheckpointAt: number | null): JudgementEvent[] => {
    const prepared = slider.objects[0];
    if (prepared?.kind !== 'slider') throw new Error('Expected slider');
    game.handleInput(input('press', 1000, prepared.position, 'K1'));
    const events: JudgementEvent[] = [];
    for (const checkpoint of prepared.checkpoints) {
      const position = checkpoint.time === skipCheckpointAt ? { x: 500, y: 380 } : checkpoint.position;
      game.handleInput(input('move', checkpoint.time, position));
      events.push(...game.updateTo(checkpoint.time));
      // Coming back onto an already-missed checkpoint must not count it.
      game.handleInput(input('move', checkpoint.time + 1, prepared.checkpoints[0]!.position));
      events.push(...game.updateTo(checkpoint.time + 1));
    }
    return events;
  };

  it('has the expected checkpoints', () => {
    const prepared = slider.objects[0];
    expect(prepared?.kind === 'slider' ? prepared.checkpoints.map((checkpoint) => [checkpoint.kind, checkpoint.time]) : null).toEqual([
      ['tick', 2000],
      ['repeat', 3000],
      ['tick', 4000],
      ['tail', 5000]
    ]);
  });

  it('awards a full slider when every checkpoint is followed', () => {
    const game = new RulesetStdGame();
    game.start(slider);

    expect(holdAndFollow(game, null)).toMatchObject([{ result: 'great', offsetMs: 0 }]);
  });

  it('does not recover a missed checkpoint when the cursor returns to it later', () => {
    const game = new RulesetStdGame();
    game.start(slider);

    // 4 of 5 parts => 0.8 => 100. Regression: the first tick used to be
    // re-collected once the cursor passed back over it.
    expect(holdAndFollow(game, 2000)).toMatchObject([{ result: 'ok' }]);
  });

  it('misses a slider whose head was never pressed', () => {
    const game = new RulesetStdGame();
    game.start(slider);

    expect(game.updateTo(1500)).toMatchObject([{ result: 'miss' }]);
    expect(game.isComplete()).toBe(true);
  });
});

describe('autoplay', () => {
  const mixed = beatmapWith(
    [
      '100,100,1000,1,0,0:0:0:0:',
      '150,200,1600,2,0,B|250:120|350:200|350:200|420:300,2,150',
      '400,100,6200,1,0,0:0:0:0:',
      '256,192,7000,12,0,9000',
      '256,192,9800,5,0,0:0:0:0:'
    ].join('\n')
  );

  const runAutoplay = (stepMs: number): JudgementEvent[] => {
    const game = new RulesetStdGame();
    game.start(mixed);
    const autoplay = new AutoplayDriver(game, mixed);
    const events: JudgementEvent[] = [];
    for (let timeMs = 0; timeMs <= 10_500; timeMs += stepMs) {
      autoplay.moveCursorTo(timeMs);
      events.push(...autoplay.advanceTo(timeMs), ...game.updateTo(timeMs));
    }
    expect(game.isComplete()).toBe(true);
    return events;
  };

  it('plays every object perfectly at frame-sized steps', () => {
    const events = runAutoplay(16);

    expect(events.map((event) => event.result)).toEqual(['great', 'great', 'great', 'great', 'great']);
    expect(events.map((event) => event.objectId)).toEqual(mixed.objects.map((object) => object.id));
  });

  it('produces the same judgements regardless of frame pacing', () => {
    expect(runAutoplay(250)).toEqual(runAutoplay(16).map((event) => ({ ...event, timeMs: expect.any(Number) })));
  });

  it('can let go of a held slider when switched off mid-slider', () => {
    const game = new RulesetStdGame();
    game.start(mixed);
    const autoplay = new AutoplayDriver(game, mixed);
    autoplay.advanceTo(1700);
    autoplay.releaseAll(1700);

    const slider = mixed.objects[1];
    if (slider?.kind !== 'slider') throw new Error('Expected slider');
    const events = game.updateTo(slider.endTimeMs);
    expect(events.find((event) => event.objectId === slider.id)?.result).toBe('miss');
  });

  it('aims at the next object between hits', () => {
    const game = new RulesetStdGame();
    game.start(mixed);
    const autoplay = new AutoplayDriver(game, mixed);

    expect(autoplay.cursorPositionAt(1000)).toEqual({ x: 100, y: 100 });
    expect(autoplay.cursorPositionAt(1600)).toEqual({ x: 150, y: 200 });
    const between = autoplay.cursorPositionAt(1300);
    expect(between.x).toBeGreaterThan(100);
    expect(between.x).toBeLessThan(150);
  });
});
