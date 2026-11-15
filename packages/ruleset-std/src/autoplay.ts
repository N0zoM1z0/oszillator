import { PLAYFIELD_CENTER, upperBound, type GameplayButton, type GameplayInputEvent, type Vec2 } from '@oszillator/core';

import type { JudgementEvent, RulesetStdGame } from './judgement/game';
import type { PreparedBeatmap, PreparedObject, PreparedSlider } from './prepare';
import { sliderBallPositionAt } from './slider-position';

/** Interval between synthetic cursor moves while spinning. */
export const AUTOPLAY_SPINNER_STEP_MS = 35;
const AUTOPLAY_SPINNER_RADIUS = 120;
const AUTOPLAY_SPINNER_RADIANS_PER_MS = (Math.PI * 12) / 1000;
/** How long before an object the cursor starts travelling towards it. */
const AUTOPLAY_AIM_MS = 520;

type AutoplayAction =
  | { kind: 'press'; timeMs: number; position: Vec2; releaseImmediately: boolean }
  | { kind: 'follow'; timeMs: number; position: Vec2 }
  | { kind: 'release'; timeMs: number; position: Vec2 };

// Follow moves must land before a release at the same timestamp so a slider
// tail is judged while still held; presses come last.
const actionOrder: Record<AutoplayAction['kind'], number> = { follow: 0, release: 1, press: 2 };

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

const easeInOut = (value: number): number => (value < 0.5 ? 2 * value * value : 1 - (-2 * value + 2) ** 2 / 2);

export const autoplaySpinnerPosition = (timeMs: number): Vec2 => {
  const angle = timeMs * AUTOPLAY_SPINNER_RADIANS_PER_MS;
  return {
    x: PLAYFIELD_CENTER.x + Math.cos(angle) * AUTOPLAY_SPINNER_RADIUS,
    y: PLAYFIELD_CENTER.y + Math.sin(angle) * AUTOPLAY_SPINNER_RADIUS
  };
};

const objectPositionAt = (object: PreparedObject, timeMs: number): Vec2 => {
  if (object.kind === 'slider') return sliderBallPositionAt(object, timeMs);
  if (object.kind === 'spinner') return autoplaySpinnerPosition(timeMs);
  return object.position;
};

const isInWindow = (timeMs: number, fromMs: number, toMs: number): boolean => timeMs > fromMs && timeMs <= toMs;

/**
 * Feeds idealised inputs into a game so it plays itself. All inputs are
 * stamped with beatmap time, so autoplay is deterministic for a given
 * sequence of `advanceTo` calls.
 */
export class AutoplayDriver {
  private lastTimeMs = 0;

  /** First object that may still need actions; objects before it have ended. */
  private scanIndex = 0;

  private nextKey: GameplayButton = 'K1';

  private inputId = 0;

  private readonly actions: AutoplayAction[] = [];

  constructor(
    private readonly game: RulesetStdGame,
    private readonly beatmap: PreparedBeatmap
  ) {}

  /** Continue from `timeMs` without replaying actions before it. */
  resetTo(timeMs: number): void {
    this.lastTimeMs = timeMs;
    this.scanIndex = 0;
  }

  /** Emits every scheduled input in (previous time, timeMs] and returns resulting judgements. */
  advanceTo(timeMs: number): JudgementEvent[] {
    if (timeMs < this.lastTimeMs) {
      this.resetTo(0);
    }
    const fromMs = this.lastTimeMs;
    this.lastTimeMs = timeMs;
    if (timeMs <= fromMs) {
      return [];
    }

    this.collectActions(fromMs, timeMs);
    this.actions.sort((left, right) => left.timeMs - right.timeMs || actionOrder[left.kind] - actionOrder[right.kind]);

    const events: JudgementEvent[] = [];
    for (const action of this.actions) {
      this.runAction(action, events);
    }
    this.actions.length = 0;
    return events;
  }

  /** Moves the cursor to where autoplay would be aiming at `timeMs`. */
  moveCursorTo(timeMs: number): void {
    this.emit('move', timeMs, this.cursorPositionAt(timeMs));
  }

  /** Releases any buttons autoplay may still be holding (e.g. when switching it off mid-slider). */
  releaseAll(timeMs: number): void {
    const position = this.game.getState().cursor;
    this.emit('release', timeMs, position, 'K1');
    this.emit('release', timeMs, position, 'K2');
  }

  cursorPositionAt(timeMs: number): Vec2 {
    const objects = this.beatmap.objects;
    const upcomingIndex = upperBound(objects, timeMs, (object) => object.startTimeMs);

    const firstCandidate = timeMs < this.lastTimeMs ? 0 : Math.min(this.scanIndex, upcomingIndex);
    for (let index = firstCandidate; index < upcomingIndex; index += 1) {
      const object = objects[index]!;
      if (timeMs <= object.endTimeMs) {
        return objectPositionAt(object, timeMs);
      }
    }

    const previous = upcomingIndex > 0 ? objects[upcomingIndex - 1]! : null;
    const previousPosition = previous ? objectPositionAt(previous, previous.endTimeMs) : PLAYFIELD_CENTER;
    const next = objects[upcomingIndex];
    if (!next) {
      return previousPosition;
    }

    const previousTimeMs = previous ? previous.endTimeMs : Math.max(0, timeMs - AUTOPLAY_AIM_MS);
    const aimStartMs = Math.max(previousTimeMs, next.startTimeMs - AUTOPLAY_AIM_MS);
    const progress = easeInOut(clamp01((timeMs - aimStartMs) / Math.max(1, next.startTimeMs - aimStartMs)));
    const target = objectPositionAt(next, next.startTimeMs);
    return {
      x: previousPosition.x + (target.x - previousPosition.x) * progress,
      y: previousPosition.y + (target.y - previousPosition.y) * progress
    };
  }

  private collectActions(fromMs: number, toMs: number): void {
    const objects = this.beatmap.objects;
    while (this.scanIndex < objects.length && objects[this.scanIndex]!.endTimeMs < fromMs) {
      this.scanIndex += 1;
    }

    const states = this.game.getState().objects;
    for (let index = this.scanIndex; index < objects.length; index += 1) {
      const object = objects[index]!;
      if (object.startTimeMs > toMs) {
        break;
      }
      if (object.endTimeMs < fromMs || states[index]?.status === 'judged') {
        continue;
      }

      if (object.kind === 'circle') {
        if (isInWindow(object.startTimeMs, fromMs, toMs)) {
          this.actions.push({ kind: 'press', timeMs: object.startTimeMs, position: object.position, releaseImmediately: true });
        }
      } else if (object.kind === 'slider') {
        this.collectSliderActions(object, fromMs, toMs);
      } else {
        if (isInWindow(object.startTimeMs, fromMs, toMs)) {
          const position = autoplaySpinnerPosition(object.startTimeMs);
          this.actions.push({ kind: 'press', timeMs: object.startTimeMs, position, releaseImmediately: false });
        }
        const firstStep = Math.max(object.startTimeMs, Math.floor(fromMs / AUTOPLAY_SPINNER_STEP_MS) * AUTOPLAY_SPINNER_STEP_MS);
        for (let timeMs = firstStep; timeMs <= Math.min(object.endTimeMs, toMs); timeMs += AUTOPLAY_SPINNER_STEP_MS) {
          if (timeMs > fromMs) {
            this.actions.push({ kind: 'follow', timeMs, position: autoplaySpinnerPosition(timeMs) });
          }
        }
        if (isInWindow(object.endTimeMs, fromMs, toMs)) {
          this.actions.push({ kind: 'release', timeMs: object.endTimeMs, position: autoplaySpinnerPosition(object.endTimeMs) });
        }
      }
    }
  }

  private collectSliderActions(slider: PreparedSlider, fromMs: number, toMs: number): void {
    if (isInWindow(slider.startTimeMs, fromMs, toMs)) {
      this.actions.push({ kind: 'press', timeMs: slider.startTimeMs, position: slider.position, releaseImmediately: false });
    }
    for (const checkpoint of slider.checkpoints) {
      if (isInWindow(checkpoint.time, fromMs, toMs)) {
        this.actions.push({ kind: 'follow', timeMs: checkpoint.time, position: checkpoint.position });
      }
    }
    if (isInWindow(slider.endTimeMs, fromMs, toMs)) {
      this.actions.push({ kind: 'release', timeMs: slider.endTimeMs, position: sliderBallPositionAt(slider, slider.endTimeMs) });
    }
  }

  private runAction(action: AutoplayAction, events: JudgementEvent[]): void {
    if (action.kind === 'press') {
      this.emit('move', action.timeMs, action.position);
      const key = this.nextKey;
      this.nextKey = key === 'K1' ? 'K2' : 'K1';
      events.push(...this.emit('press', action.timeMs, action.position, key));
      if (action.releaseImmediately) {
        this.emit('release', action.timeMs, action.position, key);
      }
      return;
    }

    // Judge everything due up to this moment while the cursor sits on the
    // action's position, then let go if this was the end of a hold.
    this.emit('move', action.timeMs, action.position);
    events.push(...this.game.updateTo(action.timeMs));
    if (action.kind === 'release') {
      this.releaseAll(action.timeMs);
    }
  }

  private emit(kind: GameplayInputEvent['kind'], timeMs: number, position: Vec2, key?: GameplayButton): JudgementEvent[] {
    return this.game.handleInput({
      id: `autoplay-${this.inputId++}`,
      kind,
      source: 'keyboard',
      playfieldPosition: position,
      browserTimestampMs: timeMs,
      gameTimestampMs: timeMs,
      ...(key ? { key } : {})
    });
  }
}
