import type { Vec2 } from '@oszillator/core';
import { CURSOR_TRAIL_LIFETIME_MS, SMOKE_LIFETIME_MS, type EffectPoint } from '@oszillator/renderer-pixi/visuals';

const SMOKE_INTERVAL_MS = 42;
const MAX_SMOKE_PUFFS = 96;
const CURSOR_TRAIL_INTERVAL_MS = 12;
const CURSOR_TRAIL_MIN_MOVE_SQUARED = 0.35;
const MAX_CURSOR_TRAIL = 28;

/** Drops expired points (oldest first) and caps the buffer length. */
const trim = <T extends { createdAtMs: number }>(points: T[], nowMs: number, lifetimeMs: number, maxLength: number): void => {
  let expired = 0;
  while (expired < points.length && nowMs - points[expired]!.createdAtMs > lifetimeMs) {
    expired += 1;
  }
  const excess = Math.max(expired, points.length - maxLength);
  if (excess > 0) {
    points.splice(0, excess);
  }
};

/**
 * Bounded buffers of cursor trail points and smoke puffs, in playfield
 * coordinates. Smoke ages on game time (it freezes while paused); the trail
 * ages on wall-clock time so it fades even when the map is paused.
 */
export class CursorEffects {
  readonly smokePuffs: EffectPoint[] = [];

  readonly cursorTrail: EffectPoint[] = [];

  smokeActive = false;

  private lastSmokeMs = -Infinity;

  private lastTrailMs = -Infinity;

  update(gameTimeMs: number, visualTimeMs: number, cursor: Vec2): void {
    if (this.smokeActive && gameTimeMs - this.lastSmokeMs >= SMOKE_INTERVAL_MS) {
      this.smokePuffs.push({ x: cursor.x, y: cursor.y, createdAtMs: gameTimeMs });
      this.lastSmokeMs = gameTimeMs;
    }
    trim(this.smokePuffs, gameTimeMs, SMOKE_LIFETIME_MS, MAX_SMOKE_PUFFS);

    const last = this.cursorTrail.at(-1);
    const moved = !last || (cursor.x - last.x) ** 2 + (cursor.y - last.y) ** 2 >= CURSOR_TRAIL_MIN_MOVE_SQUARED;
    if (moved && visualTimeMs - this.lastTrailMs >= CURSOR_TRAIL_INTERVAL_MS) {
      this.cursorTrail.push({ x: cursor.x, y: cursor.y, createdAtMs: visualTimeMs });
      this.lastTrailMs = visualTimeMs;
    }
    trim(this.cursorTrail, visualTimeMs, CURSOR_TRAIL_LIFETIME_MS, MAX_CURSOR_TRAIL);
  }

  reset(): void {
    this.smokePuffs.length = 0;
    this.cursorTrail.length = 0;
    this.smokeActive = false;
    this.lastSmokeMs = -Infinity;
    this.lastTrailMs = -Infinity;
  }
}
