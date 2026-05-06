import { Application, Container, Graphics } from 'pixi.js';

import { computePlayfieldTransform, queryVisibleTimeRange } from '@oszillator/core';
import { getSliderPositionAtDistance } from '@oszillator/slider-geometry';
import type { GameplayState, PreparedBeatmap, PreparedObject } from '@oszillator/ruleset-std';

import { approachCircleRadius, includeActiveLongObjectStartIndex, objectRenderAlpha } from './visibility';

export type RenderSettings = {
  width: number;
  height: number;
  backgroundDim: number;
};

export type SmokePuff = {
  x: number;
  y: number;
  createdAtMs: number;
};

export type RenderFrameInput = {
  beatmap: PreparedBeatmap;
  gameTimeMs: number;
  gameplayState: GameplayState;
  settings: RenderSettings;
  smokePuffs?: readonly SmokePuff[];
};

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export class PixiPlayfieldRenderer {
  private readonly app = new Application();

  private readonly root = new Container();

  private readonly playfield = new Graphics();

  private readonly smoke = new Graphics();

  private readonly objects = new Graphics();

  private readonly cursor = new Graphics();

  private width = 0;

  private height = 0;

  private lastPlayfieldWidth = 0;

  private lastPlayfieldHeight = 0;

  private lastBackgroundDim = Number.NaN;

  async mount(element: HTMLElement, settings: RenderSettings): Promise<void> {
    await this.app.init({
      width: settings.width,
      height: settings.height,
      backgroundAlpha: 0,
      preference: 'webgl'
    });
    this.width = settings.width;
    this.height = settings.height;
    element.append(this.app.canvas);
    this.app.stage.addChild(this.root);
    this.root.addChild(this.playfield, this.smoke, this.objects, this.cursor);
  }

  resize(settings: RenderSettings): void {
    if (this.width === settings.width && this.height === settings.height) {
      return;
    }

    this.width = settings.width;
    this.height = settings.height;
    this.app.renderer.resize(settings.width, settings.height);
  }

  renderFrame(input: RenderFrameInput): void {
    this.resize(input.settings);
    const transform = computePlayfieldTransform(input.settings);

    this.drawPlayfield(input.settings, transform);

    this.smoke.clear();
    this.drawSmoke(input.smokePuffs ?? [], input.gameTimeMs, transform);

    this.objects.clear();
    const visible = queryVisibleTimeRange(
      input.beatmap.objects,
      input.gameTimeMs - 200,
      input.gameTimeMs + input.beatmap.difficulty.preemptMs,
      (object) => object.startTimeMs
    );
    const activeStartIndex = includeActiveLongObjectStartIndex(input.beatmap.objects, visible.startIndex, input.gameTimeMs - 200);
    for (let index = activeStartIndex; index < visible.endIndex; index += 1) {
      const object = input.beatmap.objects[index];
      if (object) {
        this.drawObject(object, input.gameTimeMs, input.beatmap.difficulty.preemptMs, input.beatmap.difficulty.fadeInMs, transform);
      }
    }

    this.cursor.clear();
    this.cursor
      .circle(
        transform.offsetX + input.gameplayState.cursor.x * transform.scale,
        transform.offsetY + input.gameplayState.cursor.y * transform.scale,
        6
      )
      .fill({ color: 0xf8fafc, alpha: 0.9 });
  }

  destroy(): void {
    this.app.destroy(true);
  }

  private drawObject(
    object: PreparedObject,
    gameTimeMs: number,
    preemptMs: number,
    fadeInMs: number,
    transform: ReturnType<typeof computePlayfieldTransform>
  ): void {
    const alpha = objectRenderAlpha(object, gameTimeMs, preemptMs, fadeInMs);
    if (alpha <= 0) {
      return;
    }

    const positionX = transform.offsetX + object.position.x * transform.scale;
    const positionY = transform.offsetY + object.position.y * transform.scale;
    const radius = object.radius * transform.scale;
    const approachRadius = approachCircleRadius(object.startTimeMs, gameTimeMs, radius, preemptMs);

    if (object.kind === 'slider') {
      this.drawSlider(object, gameTimeMs, transform, alpha, radius, approachRadius);
      return;
    }

    if (object.kind === 'spinner') {
      this.objects.circle(positionX, positionY, radius * 2.6).stroke({ color: 0xfacc15, alpha, width: 4 });
      return;
    }

    this.drawHitCircle(positionX, positionY, radius, alpha, approachRadius);
  }

  private drawHitCircle(positionX: number, positionY: number, radius: number, alpha: number, approachRadius: number): void {
    if (approachRadius > radius) {
      this.objects.circle(positionX, positionY, approachRadius).stroke({ color: 0xfacc15, alpha: alpha * 0.85, width: 3 });
    }

    this.objects.circle(positionX, positionY, radius).fill({ color: 0x101827, alpha: alpha * 0.78 });
    this.objects.circle(positionX, positionY, radius).stroke({ color: 0xf8fafc, alpha, width: Math.max(3, radius * 0.12) });
    this.objects.circle(positionX, positionY, radius * 0.72).fill({ color: 0x38bdf8, alpha: alpha * 0.95 });
    this.objects.circle(positionX, positionY, radius * 0.42).fill({ color: 0xe0f2fe, alpha: alpha * 0.35 });
  }

  private drawSlider(
    object: Extract<PreparedObject, { kind: 'slider' }>,
    gameTimeMs: number,
    transform: ReturnType<typeof computePlayfieldTransform>,
    alpha: number,
    radius: number,
    approachRadius: number
  ): void {
    const points = object.trackPoints;
    if (points.length > 1) {
      this.drawSliderPath(points, transform, Math.max(10, radius * 1.55), 0x0f172a, alpha * 0.88);
      this.drawSliderPath(points, transform, Math.max(6, radius * 1.1), 0x38bdf8, alpha * 0.58);
      this.drawSliderPath(points, transform, Math.max(2, radius * 0.12), 0xe0f2fe, alpha * 0.7);
    }

    let tail = object.checkpoints[object.checkpoints.length - 1];
    for (let index = object.checkpoints.length - 1; index >= 0; index -= 1) {
      const checkpoint = object.checkpoints[index]!;
      if (checkpoint.kind === 'tail') {
        tail = checkpoint;
        break;
      }
    }
    const tailX = tail ? transform.offsetX + tail.position.x * transform.scale : transform.offsetX + object.position.x * transform.scale;
    const tailY = tail ? transform.offsetY + tail.position.y * transform.scale : transform.offsetY + object.position.y * transform.scale;

    for (const checkpoint of object.checkpoints) {
      const checkpointX = transform.offsetX + checkpoint.position.x * transform.scale;
      const checkpointY = transform.offsetY + checkpoint.position.y * transform.scale;
      if (checkpoint.kind === 'tick') {
        this.objects.circle(checkpointX, checkpointY, Math.max(3, radius * 0.16)).fill({ color: 0xe0f2fe, alpha: alpha * 0.75 });
      }
      if (checkpoint.kind === 'repeat') {
        this.drawSliderEndpoint(checkpointX, checkpointY, radius, alpha);
        this.drawRepeatMarker(checkpointX, checkpointY, radius * 0.58, alpha);
      }
    }

    this.drawSliderEndpoint(tailX, tailY, radius, alpha);
    this.drawHitCircle(
      transform.offsetX + object.position.x * transform.scale,
      transform.offsetY + object.position.y * transform.scale,
      radius * 0.94,
      alpha,
      approachRadius
    );

    if (gameTimeMs >= object.startTimeMs && gameTimeMs <= object.endTimeMs && object.spanDurationMs > 0 && object.pixelLength > 0) {
      const elapsed = clamp(gameTimeMs - object.startTimeMs, 0, object.endTimeMs - object.startTimeMs);
      const spanIndex = Math.min(object.repeatCount - 1, Math.floor(elapsed / object.spanDurationMs));
      const spanProgress = clamp((elapsed - spanIndex * object.spanDurationMs) / object.spanDurationMs, 0, 1);
      const distance = spanIndex % 2 === 1 ? object.pixelLength * (1 - spanProgress) : object.pixelLength * spanProgress;
      const ball = getSliderPositionAtDistance(object.path, distance);
      const ballX = transform.offsetX + ball.x * transform.scale;
      const ballY = transform.offsetY + ball.y * transform.scale;
      this.objects.circle(ballX, ballY, radius * 0.72).fill({ color: 0xfacc15, alpha: 0.92 });
      this.objects.circle(ballX, ballY, radius * 0.72).stroke({ color: 0xfffbeb, alpha: 0.95, width: Math.max(2, radius * 0.08) });
    }
  }

  private drawSliderEndpoint(positionX: number, positionY: number, radius: number, alpha: number): void {
    const endpointRadius = radius * 0.94;
    this.objects.circle(positionX, positionY, endpointRadius).fill({ color: 0x101827, alpha: alpha * 0.76 });
    this.objects.circle(positionX, positionY, endpointRadius).stroke({ color: 0xf8fafc, alpha: alpha * 0.95, width: Math.max(3, radius * 0.1) });
    this.objects.circle(positionX, positionY, endpointRadius * 0.66).fill({ color: 0x38bdf8, alpha: alpha * 0.86 });
  }

  private drawSliderPath(
    points: readonly { x: number; y: number }[],
    transform: ReturnType<typeof computePlayfieldTransform>,
    width: number,
    color: number,
    alpha: number
  ): void {
    const first = points[0];
    if (!first) {
      return;
    }

    this.objects.moveTo(transform.offsetX + first.x * transform.scale, transform.offsetY + first.y * transform.scale);
    for (let index = 1; index < points.length; index += 1) {
      const point = points[index]!;
      this.objects.lineTo(transform.offsetX + point.x * transform.scale, transform.offsetY + point.y * transform.scale);
    }
    this.objects.stroke({ color, alpha, width });
  }

  private drawRepeatMarker(positionX: number, positionY: number, size: number, alpha: number): void {
    this.objects
      .moveTo(positionX - size * 0.35, positionY - size * 0.55)
      .lineTo(positionX + size * 0.35, positionY)
      .lineTo(positionX - size * 0.35, positionY + size * 0.55)
      .stroke({ color: 0xfffbeb, alpha, width: Math.max(2, size * 0.16) });
  }

  private drawSmoke(
    puffs: readonly SmokePuff[],
    gameTimeMs: number,
    transform: ReturnType<typeof computePlayfieldTransform>
  ): void {
    for (const puff of puffs) {
      const age = gameTimeMs - puff.createdAtMs;
      if (age < 0 || age > 900) {
        continue;
      }

      const life = 1 - age / 900;
      const radius = (10 + age * 0.018) * transform.scale;
      const x = transform.offsetX + puff.x * transform.scale;
      const y = transform.offsetY + puff.y * transform.scale;
      this.smoke.circle(x, y, radius).fill({ color: 0xe5e7eb, alpha: life * 0.12 });
      this.smoke.circle(x, y, radius * 0.55).fill({ color: 0xf8fafc, alpha: life * 0.08 });
    }
  }

  private drawPlayfield(settings: RenderSettings, transform: ReturnType<typeof computePlayfieldTransform>): void {
    if (
      this.lastPlayfieldWidth === settings.width &&
      this.lastPlayfieldHeight === settings.height &&
      this.lastBackgroundDim === settings.backgroundDim
    ) {
      return;
    }

    this.lastPlayfieldWidth = settings.width;
    this.lastPlayfieldHeight = settings.height;
    this.lastBackgroundDim = settings.backgroundDim;
    this.playfield.clear();
    this.playfield
      .rect(transform.outerOffsetX, transform.outerOffsetY, transform.outerWidth, transform.outerHeight)
      .fill({ color: 0x111827, alpha: Math.max(0.1, 1 - settings.backgroundDim) })
      .stroke({ color: 0x64748b, alpha: 0.5, width: 1 });
  }
}
