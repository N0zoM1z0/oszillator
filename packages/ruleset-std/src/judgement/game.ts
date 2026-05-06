import { distanceVec2, PLAYFIELD_CENTER, type GameplayInputEvent, type Vec2 } from '@oszillator/core';

import type { PreparedBeatmap, PreparedSlider, PreparedSpinner } from '../prepare';
import { applyHitResult, createScoreState, type HitResult, type ScoreState } from '../scoring/score-state';

type ObjectStatus = 'pending' | 'judged';

type SliderProgressState = {
  headHit: boolean;
  headOffsetMs: number;
  passedCheckpoints: Set<number>;
};

type SpinnerProgressState = {
  lastAngle: number | null;
  accumulatedRotation: number;
};

export type ObjectRenderState = {
  id: string;
  status: ObjectStatus;
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

const resultFromOffset = (offsetMs: number, windows: PreparedBeatmap['difficulty']): HitResult => {
  const absolute = Math.abs(offsetMs);
  if (absolute <= windows.hitWindow300Ms) {
    return 'great';
  }
  if (absolute <= windows.hitWindow100Ms) {
    return 'ok';
  }
  if (absolute <= windows.hitWindow50Ms) {
    return 'meh';
  }
  return 'miss';
};

const sliderResultFromRatio = (ratio: number): HitResult => {
  if (ratio >= 0.95) {
    return 'great';
  }
  if (ratio >= 0.7) {
    return 'ok';
  }
  if (ratio >= 0.4) {
    return 'meh';
  }
  return 'miss';
};

const spinnerResultFromRatio = (ratio: number): HitResult => {
  if (ratio >= 1) {
    return 'great';
  }
  if (ratio >= 0.8) {
    return 'ok';
  }
  if (ratio >= 0.55) {
    return 'meh';
  }
  return 'miss';
};

export class RulesetStdGame {
  private beatmap: PreparedBeatmap | null = null;

  private currentTimeMs = 0;

  private score = createScoreState();

  private objectStates = new Map<string, ObjectRenderState>();

  private objectRenderStates: ObjectRenderState[] = [];

  private firstPendingIndex = 0;

  private judgedObjectCount = 0;

  private sliderProgress = new Map<string, SliderProgressState>();

  private spinnerProgress = new Map<string, SpinnerProgressState>();

  private cursor: Vec2 = PLAYFIELD_CENTER;

  private activeButtons = new Set<string>();

  start(beatmap: PreparedBeatmap): void {
    this.beatmap = beatmap;
    this.currentTimeMs = 0;
    this.score = createScoreState();
    this.objectRenderStates = beatmap.objects.map((object) => ({ id: object.id, status: 'pending' }));
    this.objectStates = new Map(this.objectRenderStates.map((state) => [state.id, state]));
    this.firstPendingIndex = 0;
    this.judgedObjectCount = 0;
    this.sliderProgress.clear();
    this.spinnerProgress.clear();
    this.cursor = PLAYFIELD_CENTER;
    this.activeButtons.clear();
  }

  updateTo(gameTimeMs: number): JudgementEvent[] {
    if (!this.beatmap) {
      return [];
    }

    this.currentTimeMs = gameTimeMs;
    const events: JudgementEvent[] = [];
    const latestStartTimeNeedingUpdate = gameTimeMs + this.beatmap.difficulty.hitWindow50Ms;

    for (let index = this.firstPendingIndex; index < this.beatmap.objects.length; index += 1) {
      const object = this.beatmap.objects[index]!;
      if (object.startTimeMs > latestStartTimeNeedingUpdate) {
        break;
      }

      const state = this.objectStates.get(object.id);
      if (!state || state.status === 'judged') {
        continue;
      }

      if (object.kind === 'circle' && gameTimeMs > object.startTimeMs + this.beatmap.difficulty.hitWindow50Ms) {
        events.push(this.finalizeObject(object.id, 'miss'));
        continue;
      }

      if (object.kind === 'slider') {
        events.push(...this.updateSlider(object, gameTimeMs));
        continue;
      }

      if (object.kind === 'spinner' && gameTimeMs >= object.endTimeMs) {
        events.push(this.completeSpinner(object));
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
      this.activeButtons.add(event.key);
      return this.handlePress(event);
    }

    if (event.kind === 'release' && event.key) {
      this.activeButtons.delete(event.key);
      return [];
    }

    if (event.kind === 'move') {
      this.updateSpinnerTracking(event);
    }

    return [];
  }

  getState(): GameplayState {
    return {
      currentTimeMs: this.currentTimeMs,
      score: this.score,
      objects: this.objectRenderStates,
      cursor: this.cursor
    };
  }

  getCurrentTimeMs(): number {
    return this.currentTimeMs;
  }

  getJudgedObjectCount(): number {
    return this.judgedObjectCount;
  }

  private handlePress(event: GameplayInputEvent): JudgementEvent[] {
    if (!this.beatmap) {
      return [];
    }

    const events: JudgementEvent[] = [];

    for (let index = this.firstPendingIndex; index < this.beatmap.objects.length; index += 1) {
      const object = this.beatmap.objects[index]!;
      const state = this.objectStates.get(object.id);
      if (!state || state.status === 'judged') {
        continue;
      }

      if (object.kind === 'spinner' && event.gameTimestampMs >= object.startTimeMs && event.gameTimestampMs <= object.endTimeMs) {
        this.spinnerProgress.set(object.id, { lastAngle: null, accumulatedRotation: 0 });
        continue;
      }

      if (event.gameTimestampMs < object.startTimeMs - this.beatmap.difficulty.hitWindow50Ms) {
        break;
      }

      if (event.gameTimestampMs > object.startTimeMs + this.beatmap.difficulty.hitWindow50Ms) {
        continue;
      }

      const offset = event.gameTimestampMs - object.startTimeMs;
      const withinCircle = !event.playfieldPosition
        ? false
        : distanceVec2(event.playfieldPosition, object.position) <= object.radius;

      if (object.kind === 'circle') {
        if (!withinCircle) {
          continue;
        }

        events.push(this.finalizeObject(object.id, resultFromOffset(offset, this.beatmap.difficulty), offset));
        break;
      }

      if (object.kind === 'slider') {
        if (!withinCircle) {
          continue;
        }

        this.sliderProgress.set(object.id, {
          headHit: resultFromOffset(offset, this.beatmap.difficulty) !== 'miss',
          headOffsetMs: offset,
          passedCheckpoints: new Set()
        });
        break;
      }
    }

    return events;
  }

  private updateSlider(slider: PreparedSlider, gameTimeMs: number): JudgementEvent[] {
    const state = this.objectStates.get(slider.id);
    if (!state || state.status === 'judged') {
      return [];
    }

    const progress = this.sliderProgress.get(slider.id);
    if (!progress) {
      if (gameTimeMs > slider.startTimeMs + this.beatmap!.difficulty.hitWindow50Ms) {
        return [this.finalizeObject(slider.id, 'miss')];
      }
      return [];
    }

    if (this.activeButtons.size > 0) {
      for (let index = 0; index < slider.checkpoints.length; index += 1) {
        const checkpoint = slider.checkpoints[index]!;
        if (checkpoint.time > gameTimeMs || progress.passedCheckpoints.has(index)) {
          continue;
        }

        if (distanceVec2(this.cursor, checkpoint.position) <= slider.followRadius) {
          progress.passedCheckpoints.add(index);
        }
      }
    }

    if (gameTimeMs >= slider.endTimeMs) {
      const totalParts = slider.checkpoints.length + 1;
      const successfulParts = (progress.headHit ? 1 : 0) + progress.passedCheckpoints.size;
      return [this.finalizeObject(slider.id, sliderResultFromRatio(successfulParts / totalParts), progress.headOffsetMs)];
    }

    return [];
  }

  private completeSpinner(spinner: PreparedSpinner): JudgementEvent {
    const progress = this.spinnerProgress.get(spinner.id) ?? { accumulatedRotation: 0, lastAngle: null };
    const durationSeconds = Math.max((spinner.endTimeMs - spinner.startTimeMs) / 1000, 0.1);
    const requiredRotations = durationSeconds * 3;
    const ratio = progress.accumulatedRotation / (Math.PI * 2 * requiredRotations);
    return this.finalizeObject(spinner.id, spinnerResultFromRatio(ratio));
  }

  private updateSpinnerTracking(event: GameplayInputEvent): void {
    if (!this.beatmap || !event.playfieldPosition) {
      return;
    }

    for (let index = this.firstPendingIndex; index < this.beatmap.objects.length; index += 1) {
      const object = this.beatmap.objects[index]!;
      if (object.startTimeMs > this.currentTimeMs) {
        break;
      }

      if (object.kind !== 'spinner') {
        continue;
      }
      if (this.currentTimeMs < object.startTimeMs || this.currentTimeMs > object.endTimeMs) {
        continue;
      }

      const progress = this.spinnerProgress.get(object.id) ?? { lastAngle: null, accumulatedRotation: 0 };
      const angle = Math.atan2(event.playfieldPosition.y - PLAYFIELD_CENTER.y, event.playfieldPosition.x - PLAYFIELD_CENTER.x);

      if (progress.lastAngle !== null) {
        let delta = angle - progress.lastAngle;
        if (delta > Math.PI) {
          delta -= Math.PI * 2;
        }
        if (delta < -Math.PI) {
          delta += Math.PI * 2;
        }
        progress.accumulatedRotation += Math.abs(delta);
      }

      progress.lastAngle = angle;
      this.spinnerProgress.set(object.id, progress);
    }
  }

  private finalizeObject(objectId: string, result: HitResult, offsetMs?: number): JudgementEvent {
    const state = this.objectStates.get(objectId);
    if (!state) {
      return this.createJudgementEvent(objectId, result, offsetMs);
    }
    if (state.status === 'judged') {
      return this.createJudgementEvent(objectId, state.result ?? result, offsetMs);
    }

    state.status = 'judged';
    state.result = result;
    state.judgedAtMs = this.currentTimeMs;
    this.judgedObjectCount += 1;
    this.score = applyHitResult(this.score, result);
    this.advanceFirstPendingIndex();

    return this.createJudgementEvent(objectId, result, offsetMs);
  }

  private createJudgementEvent(objectId: string, result: HitResult, offsetMs?: number): JudgementEvent {
    return {
      objectId,
      result,
      timeMs: this.currentTimeMs,
      ...(offsetMs === undefined ? {} : { offsetMs })
    };
  }

  private advanceFirstPendingIndex(): void {
    if (!this.beatmap) {
      return;
    }

    while (this.firstPendingIndex < this.beatmap.objects.length) {
      const object = this.beatmap.objects[this.firstPendingIndex]!;
      const state = this.objectStates.get(object.id);
      if (!state || state.status !== 'judged') {
        break;
      }
      this.firstPendingIndex += 1;
    }
  }
}
