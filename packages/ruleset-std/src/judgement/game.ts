import { distanceVec2, PLAYFIELD_CENTER, type GameplayButton, type GameplayInputEvent, type Vec2 } from '@oszillator/core';

import type { DerivedDifficulty } from '../difficulty';
import type { PreparedBeatmap, PreparedObject, PreparedSlider, PreparedSpinner } from '../prepare';
import { applyHitResult, createScoreState, type HitResult, type ScoreState } from '../scoring/score-state';

type SliderProgress = {
  headOffsetMs: number;
  /** Index of the next checkpoint that has not been judged yet. */
  nextCheckpoint: number;
  passedCheckpoints: number;
};

type SpinnerProgress = {
  lastAngle: number | null;
  accumulatedRotation: number;
};

export type ObjectRenderState = {
  id: string;
  status: 'pending' | 'judged';
  result?: HitResult;
  judgedAtMs?: number;
};

export type GameplayState = {
  currentTimeMs: number;
  score: ScoreState;
  objects: readonly ObjectRenderState[];
  cursor: Vec2;
};

export type JudgementEvent = {
  objectId: string;
  result: HitResult;
  timeMs: number;
  offsetMs?: number;
};

/** Rotations per second a spinner needs for a full (300) result. */
const SPINNER_ROTATIONS_PER_SECOND = 3;

const resultFromOffset = (offsetMs: number, difficulty: DerivedDifficulty): HitResult => {
  const absolute = Math.abs(offsetMs);
  if (absolute <= difficulty.hitWindow300Ms) return 'great';
  if (absolute <= difficulty.hitWindow100Ms) return 'ok';
  if (absolute <= difficulty.hitWindow50Ms) return 'meh';
  return 'miss';
};

const sliderResultFromRatio = (ratio: number): HitResult => {
  if (ratio >= 0.95) return 'great';
  if (ratio >= 0.7) return 'ok';
  if (ratio >= 0.4) return 'meh';
  return 'miss';
};

const spinnerResultFromRatio = (ratio: number): HitResult => {
  if (ratio >= 1) return 'great';
  if (ratio >= 0.8) return 'ok';
  if (ratio >= 0.55) return 'meh';
  return 'miss';
};

const isActiveSpinner = (object: PreparedObject, timeMs: number): object is PreparedSpinner =>
  object.kind === 'spinner' && timeMs >= object.startTimeMs && timeMs <= object.endTimeMs;

/**
 * Deterministic osu!standard-style judgement. Time only moves through
 * `updateTo` and input timestamps, so replaying the same inputs against the
 * same prepared beatmap always produces the same results.
 */
export class RulesetStdGame {
  private beatmap: PreparedBeatmap | null = null;

  private currentTimeMs = 0;

  private score = createScoreState();

  private objectStates: ObjectRenderState[] = [];

  private firstPendingIndex = 0;

  private judgedObjectCount = 0;

  private readonly sliderProgress = new Map<number, SliderProgress>();

  private readonly spinnerProgress = new Map<number, SpinnerProgress>();

  private cursor: Vec2 = PLAYFIELD_CENTER;

  private readonly heldButtons = new Set<GameplayButton>();

  start(beatmap: PreparedBeatmap): void {
    this.beatmap = beatmap;
    this.currentTimeMs = 0;
    this.score = createScoreState();
    this.objectStates = beatmap.objects.map((object) => ({ id: object.id, status: 'pending' }));
    this.firstPendingIndex = 0;
    this.judgedObjectCount = 0;
    this.sliderProgress.clear();
    this.spinnerProgress.clear();
    this.cursor = PLAYFIELD_CENTER;
    this.heldButtons.clear();
  }

  updateTo(gameTimeMs: number): JudgementEvent[] {
    const beatmap = this.beatmap;
    if (!beatmap) {
      return [];
    }

    this.currentTimeMs = gameTimeMs;
    const events: JudgementEvent[] = [];
    const { hitWindow50Ms } = beatmap.difficulty;

    for (let index = this.firstPendingIndex; index < beatmap.objects.length; index += 1) {
      const object = beatmap.objects[index]!;
      if (object.startTimeMs > gameTimeMs + hitWindow50Ms) {
        break;
      }
      if (this.objectStates[index]!.status === 'judged') {
        continue;
      }

      if (object.kind === 'circle') {
        if (gameTimeMs > object.startTimeMs + hitWindow50Ms) {
          events.push(this.finalize(index, 'miss'));
        }
      } else if (object.kind === 'slider') {
        const event = this.updateSlider(index, object, gameTimeMs, hitWindow50Ms);
        if (event) events.push(event);
      } else if (gameTimeMs >= object.endTimeMs) {
        events.push(this.completeSpinner(index, object));
      }
    }

    return events;
  }

  handleInput(event: GameplayInputEvent): JudgementEvent[] {
    if (!this.beatmap) {
      return [];
    }

    this.currentTimeMs = event.gameTimestampMs;
    if (event.playfieldPosition) {
      this.cursor = event.playfieldPosition;
    }

    if (event.kind === 'press' && event.key) {
      this.heldButtons.add(event.key);
      return this.handlePress(this.beatmap, event.gameTimestampMs);
    }
    if (event.kind === 'release' && event.key) {
      this.heldButtons.delete(event.key);
      return [];
    }
    if (event.kind === 'move') {
      this.trackSpinners(this.beatmap);
    }
    return [];
  }

  getState(): GameplayState {
    return {
      currentTimeMs: this.currentTimeMs,
      score: this.score,
      objects: this.objectStates,
      cursor: this.cursor
    };
  }

  getCurrentTimeMs(): number {
    return this.currentTimeMs;
  }

  getJudgedObjectCount(): number {
    return this.judgedObjectCount;
  }

  isComplete(): boolean {
    return this.beatmap !== null && this.judgedObjectCount === this.beatmap.objects.length && this.judgedObjectCount > 0;
  }

  private handlePress(beatmap: PreparedBeatmap, timeMs: number): JudgementEvent[] {
    const { hitWindow50Ms } = beatmap.difficulty;

    for (let index = this.firstPendingIndex; index < beatmap.objects.length; index += 1) {
      const object = beatmap.objects[index]!;
      if (object.kind === 'spinner' || this.objectStates[index]!.status === 'judged') {
        continue;
      }
      if (timeMs < object.startTimeMs - hitWindow50Ms) {
        break;
      }
      if (timeMs > object.startTimeMs + hitWindow50Ms || this.sliderProgress.has(index)) {
        continue;
      }
      if (distanceVec2(this.cursor, object.position) > object.radius) {
        continue;
      }

      const offsetMs = timeMs - object.startTimeMs;
      if (object.kind === 'circle') {
        return [this.finalize(index, resultFromOffset(offsetMs, beatmap.difficulty), offsetMs)];
      }

      this.sliderProgress.set(index, { headOffsetMs: offsetMs, nextCheckpoint: 0, passedCheckpoints: 0 });
      return [];
    }

    return [];
  }

  private updateSlider(index: number, slider: PreparedSlider, timeMs: number, hitWindow50Ms: number): JudgementEvent | null {
    const progress = this.sliderProgress.get(index);
    if (!progress) {
      return timeMs > slider.startTimeMs + hitWindow50Ms ? this.finalize(index, 'miss') : null;
    }

    // Each checkpoint is judged once, when its time is reached, against the
    // cursor and buttons at that moment. A missed tick cannot be recovered by
    // returning to its position later.
    const following = this.heldButtons.size > 0;
    while (progress.nextCheckpoint < slider.checkpoints.length) {
      const checkpoint = slider.checkpoints[progress.nextCheckpoint]!;
      if (checkpoint.time > timeMs && timeMs < slider.endTimeMs) {
        break;
      }
      if (following && distanceVec2(this.cursor, checkpoint.position) <= slider.followRadius) {
        progress.passedCheckpoints += 1;
      }
      progress.nextCheckpoint += 1;
    }

    if (timeMs < slider.endTimeMs) {
      return null;
    }

    // The head counts as one part; it was hit inside the 50 window by construction.
    const ratio = (1 + progress.passedCheckpoints) / (1 + slider.checkpoints.length);
    return this.finalize(index, sliderResultFromRatio(ratio), progress.headOffsetMs);
  }

  private completeSpinner(index: number, spinner: PreparedSpinner): JudgementEvent {
    const rotation = this.spinnerProgress.get(index)?.accumulatedRotation ?? 0;
    const durationSeconds = Math.max((spinner.endTimeMs - spinner.startTimeMs) / 1000, 0.1);
    const ratio = rotation / (Math.PI * 2 * SPINNER_ROTATIONS_PER_SECOND * durationSeconds);
    return this.finalize(index, spinnerResultFromRatio(ratio));
  }

  private trackSpinners(beatmap: PreparedBeatmap): void {
    const holding = this.heldButtons.size > 0;
    const angle = Math.atan2(this.cursor.y - PLAYFIELD_CENTER.y, this.cursor.x - PLAYFIELD_CENTER.x);

    for (let index = this.firstPendingIndex; index < beatmap.objects.length; index += 1) {
      const object = beatmap.objects[index]!;
      if (object.startTimeMs > this.currentTimeMs) {
        break;
      }
      if (!isActiveSpinner(object, this.currentTimeMs)) {
        continue;
      }

      let progress = this.spinnerProgress.get(index);
      if (!progress) {
        progress = { lastAngle: null, accumulatedRotation: 0 };
        this.spinnerProgress.set(index, progress);
      }

      // Rotation only counts while a button is held, but the reference angle
      // always follows the cursor so releasing and re-pressing loses nothing.
      if (holding && progress.lastAngle !== null) {
        let delta = angle - progress.lastAngle;
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        progress.accumulatedRotation += Math.abs(delta);
      }
      progress.lastAngle = angle;
    }
  }

  private finalize(index: number, result: HitResult, offsetMs?: number): JudgementEvent {
    const state = this.objectStates[index]!;
    state.status = 'judged';
    state.result = result;
    state.judgedAtMs = this.currentTimeMs;
    this.judgedObjectCount += 1;
    this.score = applyHitResult(this.score, result);
    this.sliderProgress.delete(index);
    this.spinnerProgress.delete(index);

    while (this.firstPendingIndex < this.objectStates.length && this.objectStates[this.firstPendingIndex]!.status === 'judged') {
      this.firstPendingIndex += 1;
    }

    return {
      objectId: state.id,
      result,
      timeMs: this.currentTimeMs,
      ...(offsetMs === undefined ? {} : { offsetMs })
    };
  }
}
