import { upperBound } from '@oszillator/core';
import type { HitResult, JudgementEvent, PreparedObject, ScoreState } from '@oszillator/ruleset-std';

import type { ShellElements } from './shell';

/** Offsets beyond this are pinned to the edge of the hit-offset chart. */
export const OFFSET_RANGE_MS = 160;
export const MAX_HIT_HISTORY = 56;
/** Gaps between objects at least this long show the countdown bar. */
export const WAIT_OVERLAY_THRESHOLD_MS = 2500;

export type HitHistoryEntry = {
  result: HitResult;
  offsetMs: number;
};

const HIT_RESULT_LABELS: Record<HitResult, string> = { great: '300', ok: '100', meh: '50', miss: 'Miss' };

export const formatOffset = (offsetMs: number): string => {
  const rounded = Math.round(offsetMs);
  return `${rounded > 0 ? '+' : ''}${rounded}ms`;
};

/** Horizontal position (0-100%) of a hit offset on the chart; early hits are on the left. */
export const offsetChartPercent = (offsetMs: number): number => {
  const clamped = Math.min(Math.max(offsetMs, -OFFSET_RANGE_MS), OFFSET_RANGE_MS);
  return ((clamped + OFFSET_RANGE_MS) / (OFFSET_RANGE_MS * 2)) * 100;
};

/**
 * Remaining share (1 -> 0) of a long break before the next object, or null
 * when no countdown should be shown at `timeMs`.
 */
export const waitProgressAt = (objects: readonly PreparedObject[], timeMs: number): number | null => {
  const nextIndex = upperBound(objects, timeMs, (object) => object.startTimeMs);
  const next = objects[nextIndex];
  if (!next) {
    return null;
  }

  const previous = nextIndex > 0 ? objects[nextIndex - 1]! : null;
  const waitStartMs = previous ? previous.endTimeMs : 0;
  const totalWaitMs = next.startTimeMs - waitStartMs;
  if (totalWaitMs < WAIT_OVERLAY_THRESHOLD_MS || timeMs < waitStartMs) {
    return null;
  }
  return Math.min(Math.max((next.startTimeMs - timeMs) / totalWaitMs, 0), 1);
};

/** Score, judgement counts, hit-offset history and the break countdown. */
export class Hud {
  private readonly history: HitHistoryEntry[] = [];

  private historyVersion = 0;

  private renderedHistoryVersion = -1;

  private renderedScore: ScoreState | null = null;

  private waitVisible = false;

  constructor(private readonly elements: ShellElements) {}

  recordJudgements(judgements: readonly JudgementEvent[]): void {
    let changed = false;
    for (const judgement of judgements) {
      if (typeof judgement.offsetMs === 'number' && Number.isFinite(judgement.offsetMs)) {
        this.history.push({ result: judgement.result, offsetMs: judgement.offsetMs });
        changed = true;
      }
    }
    if (!changed) {
      return;
    }
    if (this.history.length > MAX_HIT_HISTORY) {
      this.history.splice(0, this.history.length - MAX_HIT_HISTORY);
    }
    this.historyVersion += 1;
  }

  reset(): void {
    this.history.length = 0;
    this.historyVersion += 1;
    this.hideWait();
  }

  /** Updates the DOM only when the score or hit history changed since the last call. */
  render(score: ScoreState): void {
    if (this.renderedScore !== score) {
      this.renderedScore = score;
      const { elements } = this;
      elements.score.textContent = String(score.score);
      elements.accuracy.textContent = `${(score.accuracy * 100).toFixed(2)}%`;
      elements.combo.textContent = String(score.combo);
      elements.count300.textContent = String(score.counts.great);
      elements.count100.textContent = String(score.counts.ok);
      elements.count50.textContent = String(score.counts.meh);
      elements.countMiss.textContent = String(score.counts.miss);
    }

    if (this.renderedHistoryVersion !== this.historyVersion) {
      this.renderedHistoryVersion = this.historyVersion;
      const last = this.history.at(-1);
      this.elements.lastResult.textContent = last ? `${HIT_RESULT_LABELS[last.result]} ${formatOffset(last.offsetMs)}` : '-';
      this.elements.offsetChart.innerHTML = this.history
        .map((hit) => `<i class="offset-dot ${hit.result}" style="left:${offsetChartPercent(hit.offsetMs).toFixed(2)}%"></i>`)
        .join('');
    }
  }

  renderWait(objects: readonly PreparedObject[], timeMs: number): void {
    const remaining = waitProgressAt(objects, timeMs);
    if (remaining === null) {
      this.hideWait();
      return;
    }
    if (!this.waitVisible) {
      this.waitVisible = true;
      this.elements.waitOverlay.classList.add('visible');
      this.elements.waitOverlay.setAttribute('aria-hidden', 'false');
    }
    this.elements.waitProgress.style.transform = `scaleX(${remaining.toFixed(4)})`;
  }

  hideWait(): void {
    if (!this.waitVisible) {
      return;
    }
    this.waitVisible = false;
    this.elements.waitOverlay.classList.remove('visible');
    this.elements.waitOverlay.setAttribute('aria-hidden', 'true');
    this.elements.waitProgress.style.transform = 'scaleX(0)';
  }
}
