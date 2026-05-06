import { Application, Container, Graphics } from 'pixi.js';

import { computePlayfieldTransform, queryVisibleTimeRange } from '@oszillator/core';
import { getSliderPositionAtDistance } from '@oszillator/slider-geometry';
import type { GameplayState, PreparedBeatmap, PreparedObject } from '@oszillator/ruleset-std';

import { approachCircleRadius, includeActiveLongObjectStartIndex, objectRenderAlpha } from './visibility';

type Rgb = readonly [number, number, number];

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

export type CursorTrailPoint = {
  x: number;
  y: number;
  createdAtMs: number;
};

export type RenderFrameInput = {
  beatmap: PreparedBeatmap;
  gameTimeMs: number;
  visualTimeMs: number;
  gameplayState: GameplayState;
  settings: RenderSettings;
  hidden: boolean;
  dynamicColours: boolean;
  smokePuffs?: readonly SmokePuff[];
  cursorTrail?: readonly CursorTrailPoint[];
};

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const DEFAULT_COMBO_COLOURS: readonly Rgb[] = [
  [255, 104, 136],
  [91, 213, 255],
  [255, 218, 100],
  [137, 255, 154],
  [190, 132, 255]
];
const STATIC_OBJECT_COLOUR: Rgb = [56, 189, 248];
const STATIC_CURSOR_COLOUR: Rgb = [56, 189, 248];

const rgbToNumber = (rgb: Rgb): number => (rgb[0] << 16) + (rgb[1] << 8) + rgb[2];

const clampColorChannel = (value: number): number => Math.min(Math.max(Math.round(value), 0), 255);

const mixRgb = (from: Rgb, to: Rgb, progress: number): Rgb => [
  clampColorChannel(from[0] + (to[0] - from[0]) * progress),
  clampColorChannel(from[1] + (to[1] - from[1]) * progress),
  clampColorChannel(from[2] + (to[2] - from[2]) * progress)
];

const pulseRgb = (base: Rgb, visualTimeMs: number, amount: number): Rgb => {
  const progress = (Math.sin(visualTimeMs / 180) + 1) / 2;
  return mixRgb(base, [255, 255, 255], progress * amount);
};

const colourAt = (palette: readonly Rgb[], index: number): Rgb => palette[Math.abs(index) % palette.length] ?? DEFAULT_COMBO_COLOURS[0]!;

const cyclePalette = (palette: readonly Rgb[], visualTimeMs: number): Rgb => {
  const cycle = visualTimeMs / 720;
  const index = Math.floor(cycle);
  const progress = cycle - index;
  return mixRgb(colourAt(palette, index), colourAt(palette, index + 1), progress);
};

const easeOutCubic = (value: number): number => 1 - (1 - value) ** 3;
const smoothstep = (value: number): number => value * value * (3 - 2 * value);
const JUDGED_OBJECT_FADE_MS = 320;

export const objectVisualColour = (
  palette: readonly Rgb[],
  comboIndex: number,
  dynamicColours: boolean,
  gameTimeMs: number
): Rgb => {
  if (!dynamicColours) {
    return STATIC_OBJECT_COLOUR;
  }

  return pulseRgb(colourAt(palette, comboIndex), gameTimeMs, 0.22);
};

export type SliderVisualMetrics = {
  outerWidth: number;
  innerWidth: number;
  highlightWidth: number;
  endpointRadius: number;
};

export const sliderVisualMetrics = (radius: number): SliderVisualMetrics => {
  const outerWidth = Math.max(10, radius * 1.88);

  return {
    outerWidth,
    innerWidth: Math.max(6, radius * 1.22),
    highlightWidth: Math.max(2, radius * 0.12),
    endpointRadius: outerWidth / 2
  };
};

export const shouldMergeSliderEndpoints = (
  head: { x: number; y: number },
  tail: { x: number; y: number },
  endpointRadius: number
): boolean => {
  const dx = head.x - tail.x;
  const dy = head.y - tail.y;
  return dx * dx + dy * dy <= (endpointRadius * 1.35) ** 2;
};

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

  private paletteBeatmap: PreparedBeatmap | null = null;

  private palette: readonly Rgb[] = DEFAULT_COMBO_COLOURS;

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
    const palette = this.paletteForBeatmap(input.beatmap);

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
    for (let index = visible.endIndex - 1; index >= activeStartIndex; index -= 1) {
      const object = input.beatmap.objects[index];
      const renderState = input.gameplayState.objects[index];
      if (object) {
        const judgedAgeMs =
          renderState?.status === 'judged' && typeof renderState.judgedAtMs === 'number'
            ? input.gameTimeMs - renderState.judgedAtMs
            : null;
        if (judgedAgeMs !== null && judgedAgeMs >= JUDGED_OBJECT_FADE_MS) {
          continue;
        }
        const judgedProgress = judgedAgeMs === null ? 0 : clamp(judgedAgeMs / JUDGED_OBJECT_FADE_MS, 0, 1);
        const judgedFadeAlpha = judgedAgeMs === null ? 1 : 1 - smoothstep(judgedProgress);
        this.drawObject(
          object,
          input.gameTimeMs,
          input.beatmap.difficulty.preemptMs,
          input.beatmap.difficulty.fadeInMs,
          transform,
          input.hidden,
          palette,
          input.dynamicColours,
          judgedFadeAlpha,
          judgedProgress
        );
      }
    }

    this.cursor.clear();
    this.drawCursorTrail(input.cursorTrail ?? [], input.visualTimeMs, transform, palette, input.dynamicColours);
    this.drawCursor(input.gameplayState.cursor, input.visualTimeMs, transform, palette, input.dynamicColours);
  }

  destroy(): void {
    this.app.destroy(true);
  }

  private drawObject(
    object: PreparedObject,
    gameTimeMs: number,
    preemptMs: number,
    fadeInMs: number,
    transform: ReturnType<typeof computePlayfieldTransform>,
    hidden: boolean,
    palette: readonly Rgb[],
    dynamicColours: boolean,
    alphaMultiplier = 1,
    judgedProgress = 0
  ): void {
    const alpha = objectRenderAlpha(object, gameTimeMs, preemptMs, fadeInMs, hidden) * alphaMultiplier;
    if (alpha <= 0) {
      return;
    }

    const positionX = transform.offsetX + object.position.x * transform.scale;
    const positionY = transform.offsetY + object.position.y * transform.scale;
    const radius = object.radius * transform.scale;
    const approachRadius = approachCircleRadius(object.startTimeMs, gameTimeMs, radius, preemptMs);
    const colour = objectVisualColour(palette, object.comboIndex, dynamicColours, gameTimeMs);

    if (object.kind === 'slider') {
      this.drawSlider(object, gameTimeMs, transform, alpha, radius, hidden ? radius : approachRadius, colour);
      return;
    }

    if (object.kind === 'spinner') {
      this.drawSpinner(object, gameTimeMs, positionX, positionY, radius, alpha, approachRadius, colour);
      return;
    }

    this.drawHitCircle(positionX, positionY, radius, alpha, hidden ? radius : approachRadius, colour, judgedProgress);
  }

  private drawHitCircle(
    positionX: number,
    positionY: number,
    radius: number,
    alpha: number,
    approachRadius: number,
    colour: Rgb,
    judgedProgress = 0
  ): void {
    const base = rgbToNumber(colour);
    const soft = rgbToNumber(mixRgb(colour, [255, 255, 255], 0.45));
    const deep = rgbToNumber(mixRgb(colour, [12, 18, 28], 0.58));
    const hitBloom = smoothstep(judgedProgress);
    const circleRadius = radius * (1 + hitBloom * 0.08);
    if (approachRadius > radius) {
      this.objects.circle(positionX, positionY, approachRadius).stroke({ color: base, alpha: alpha * 0.85, width: 3 });
    }

    if (judgedProgress > 0) {
      this.objects.circle(positionX, positionY, radius * (1.08 + hitBloom * 0.42)).stroke({
        color: soft,
        alpha: alpha * (1 - judgedProgress) * 0.72,
        width: Math.max(2, radius * 0.05)
      });
    }

    this.objects.circle(positionX, positionY, circleRadius).fill({ color: deep, alpha: alpha * 0.78 });
    this.objects.circle(positionX, positionY, circleRadius).stroke({ color: 0xf8fafc, alpha, width: Math.max(3, radius * 0.12) });
    this.objects.circle(positionX, positionY, circleRadius * 0.75).fill({ color: base, alpha: alpha * 0.92 });
    this.objects.circle(positionX, positionY, circleRadius * 0.46).fill({ color: soft, alpha: alpha * 0.58 });
    this.objects.circle(positionX - radius * 0.18, positionY - radius * 0.22, radius * 0.18).fill({ color: 0xffffff, alpha: alpha * 0.34 });
  }

  private drawSlider(
    object: Extract<PreparedObject, { kind: 'slider' }>,
    gameTimeMs: number,
    transform: ReturnType<typeof computePlayfieldTransform>,
    alpha: number,
    radius: number,
    approachRadius: number,
    colour: Rgb
  ): void {
    const points = object.trackPoints;
    const visualMetrics = sliderVisualMetrics(radius);

    if (points.length > 1) {
      const deep = rgbToNumber(mixRgb(colour, [10, 16, 26], 0.72));
      const base = rgbToNumber(colour);
      const soft = rgbToNumber(mixRgb(colour, [255, 255, 255], 0.5));
      this.drawSliderPath(points, transform, visualMetrics.outerWidth, deep, alpha * 0.88);
      this.drawSliderPath(points, transform, visualMetrics.innerWidth, base, alpha * 0.58);
      this.drawSliderPath(points, transform, visualMetrics.highlightWidth, soft, alpha * 0.76);
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
    const headX = transform.offsetX + object.position.x * transform.scale;
    const headY = transform.offsetY + object.position.y * transform.scale;
    const endpointsMerged = shouldMergeSliderEndpoints(
      { x: headX, y: headY },
      { x: tailX, y: tailY },
      visualMetrics.endpointRadius
    );

    for (const checkpoint of object.checkpoints) {
      const checkpointX = transform.offsetX + checkpoint.position.x * transform.scale;
      const checkpointY = transform.offsetY + checkpoint.position.y * transform.scale;
      if (checkpoint.kind === 'tick') {
        this.objects.circle(checkpointX, checkpointY, Math.max(3, radius * 0.16)).fill({ color: rgbToNumber(mixRgb(colour, [255, 255, 255], 0.62)), alpha: alpha * 0.75 });
      }
      if (checkpoint.kind === 'repeat') {
        if (!shouldMergeSliderEndpoints({ x: headX, y: headY }, { x: checkpointX, y: checkpointY }, visualMetrics.endpointRadius)) {
          this.drawSliderEndpoint(checkpointX, checkpointY, visualMetrics.endpointRadius, alpha, colour);
        }
        this.drawRepeatMarker(checkpointX, checkpointY, visualMetrics.endpointRadius * 0.62, alpha);
      }
    }

    if (!endpointsMerged) {
      this.drawSliderEndpoint(tailX, tailY, visualMetrics.endpointRadius, alpha, colour);
    }
    this.drawHitCircle(
      headX,
      headY,
      visualMetrics.endpointRadius,
      alpha,
      approachRadius,
      colour
    );

    if (gameTimeMs >= object.startTimeMs && gameTimeMs <= object.endTimeMs && object.spanDurationMs > 0 && object.pixelLength > 0) {
      const elapsed = clamp(gameTimeMs - object.startTimeMs, 0, object.endTimeMs - object.startTimeMs);
      const spanIndex = Math.min(object.repeatCount - 1, Math.floor(elapsed / object.spanDurationMs));
      const spanProgress = clamp((elapsed - spanIndex * object.spanDurationMs) / object.spanDurationMs, 0, 1);
      const distance = spanIndex % 2 === 1 ? object.pixelLength * (1 - spanProgress) : object.pixelLength * spanProgress;
      const ball = getSliderPositionAtDistance(object.path, distance);
      const ballX = transform.offsetX + ball.x * transform.scale;
      const ballY = transform.offsetY + ball.y * transform.scale;
      this.objects.circle(ballX, ballY, radius * 0.72).fill({ color: rgbToNumber(mixRgb(colour, [255, 255, 255], 0.25)), alpha: 0.92 });
      this.objects.circle(ballX, ballY, radius * 0.72).stroke({ color: 0xfffbeb, alpha: 0.95, width: Math.max(2, radius * 0.08) });
    }
  }

  private drawSliderEndpoint(positionX: number, positionY: number, endpointRadius: number, alpha: number, colour: Rgb): void {
    this.objects.circle(positionX, positionY, endpointRadius).fill({ color: rgbToNumber(mixRgb(colour, [12, 18, 28], 0.62)), alpha: alpha * 0.76 });
    this.objects.circle(positionX, positionY, endpointRadius).stroke({ color: 0xf8fafc, alpha: alpha * 0.95, width: Math.max(3, endpointRadius * 0.12) });
    this.objects.circle(positionX, positionY, endpointRadius * 0.66).fill({ color: rgbToNumber(colour), alpha: alpha * 0.86 });
  }

  private drawSpinner(
    object: Extract<PreparedObject, { kind: 'spinner' }>,
    gameTimeMs: number,
    positionX: number,
    positionY: number,
    radius: number,
    alpha: number,
    approachRadius: number,
    colour: Rgb
  ): void {
    const base = rgbToNumber(colour);
    const soft = rgbToNumber(mixRgb(colour, [255, 255, 255], 0.55));
    const deep = rgbToNumber(mixRgb(colour, [8, 13, 22], 0.72));
    const spinnerRadius = radius * 3.1;
    const activeProgress = clamp((gameTimeMs - object.startTimeMs) / Math.max(1, object.endTimeMs - object.startTimeMs), 0, 1);
    const preHitProgress = gameTimeMs < object.startTimeMs ? 1 - clamp((object.startTimeMs - gameTimeMs) / 900, 0, 1) : 1;
    const shrinkRadius = spinnerRadius * (1.75 - easeOutCubic(preHitProgress) * 0.72);
    const progressRadius = spinnerRadius * (1.04 - activeProgress * 0.22);
    const rotation = gameTimeMs / 138;
    const reverseRotation = -gameTimeMs / 178;
    const ringAlpha = gameTimeMs <= object.endTimeMs ? alpha : alpha * 0.72;

    this.objects.circle(positionX, positionY, spinnerRadius * 1.2).fill({ color: deep, alpha: ringAlpha * 0.24 });
    this.objects.circle(positionX, positionY, spinnerRadius * 0.78).fill({ color: deep, alpha: ringAlpha * 0.3 });
    this.objects.circle(positionX, positionY, spinnerRadius).stroke({ color: base, alpha: ringAlpha * 0.74, width: Math.max(4, radius * 0.11) });
    this.objects.circle(positionX, positionY, spinnerRadius * 0.68).stroke({ color: soft, alpha: ringAlpha * 0.44, width: Math.max(2, radius * 0.05) });
    this.objects.circle(positionX, positionY, progressRadius).stroke({ color: 0xf8fafc, alpha: ringAlpha * 0.5, width: Math.max(2, radius * 0.055) });

    if (gameTimeMs < object.startTimeMs) {
      this.objects.circle(positionX, positionY, shrinkRadius).stroke({ color: 0xf8fafc, alpha: alpha * 0.84, width: Math.max(3, radius * 0.08) });
    } else if (gameTimeMs <= object.endTimeMs) {
      this.objects.circle(positionX, positionY, progressRadius * 0.86).stroke({ color: soft, alpha: alpha * 0.26, width: Math.max(2, radius * 0.04) });
    }

    this.drawArc(positionX, positionY, spinnerRadius * 0.92, rotation, rotation + Math.PI * 1.08, base, ringAlpha * 0.96, Math.max(4, radius * 0.13));
    this.drawArc(
      positionX,
      positionY,
      spinnerRadius * 0.52,
      reverseRotation,
      reverseRotation + Math.PI * 0.86,
      soft,
      ringAlpha * 0.82,
      Math.max(3, radius * 0.08)
    );
    this.drawArc(
      positionX,
      positionY,
      spinnerRadius * 1.08,
      -rotation * 0.7,
      -rotation * 0.7 + Math.PI * 0.42,
      0xffffff,
      ringAlpha * 0.5,
      Math.max(2, radius * 0.05)
    );

    for (let index = 0; index < 12; index += 1) {
      const tickAngle = rotation * 0.45 + (index / 12) * Math.PI * 2;
      const tickAlpha = alpha * (0.2 + 0.45 * ((Math.sin(tickAngle * 2 + gameTimeMs / 260) + 1) / 2));
      this.drawRadialTick(positionX, positionY, spinnerRadius * 0.78, spinnerRadius * 0.88, tickAngle, soft, tickAlpha, Math.max(1.5, radius * 0.035));
    }

    this.objects.circle(positionX, positionY, radius * 1.04).fill({ color: base, alpha: ringAlpha * (0.54 + activeProgress * 0.24) });
    this.objects.circle(positionX, positionY, radius * 0.46).fill({ color: soft, alpha: ringAlpha * 0.76 });
    this.objects.circle(positionX, positionY, radius * 1.3).stroke({ color: 0xf8fafc, alpha: ringAlpha * 0.8, width: Math.max(2, radius * 0.05) });
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
    this.objects.stroke({ color, alpha, width, cap: 'round', join: 'round' });
  }

  private drawRepeatMarker(positionX: number, positionY: number, size: number, alpha: number): void {
    this.objects
      .moveTo(positionX - size * 0.35, positionY - size * 0.55)
      .lineTo(positionX + size * 0.35, positionY)
      .lineTo(positionX - size * 0.35, positionY + size * 0.55)
      .stroke({ color: 0xfffbeb, alpha, width: Math.max(2, size * 0.16) });
  }

  private drawArc(
    centerX: number,
    centerY: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    color: number,
    alpha: number,
    width: number
  ): void {
    const steps = 28;
    this.objects.moveTo(centerX + Math.cos(startAngle) * radius, centerY + Math.sin(startAngle) * radius);
    for (let index = 1; index <= steps; index += 1) {
      const progress = index / steps;
      const angle = startAngle + (endAngle - startAngle) * progress;
      this.objects.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
    }
    this.objects.stroke({ color, alpha, width });
  }

  private drawRadialTick(
    centerX: number,
    centerY: number,
    innerRadius: number,
    outerRadius: number,
    angle: number,
    color: number,
    alpha: number,
    width: number
  ): void {
    this.objects
      .moveTo(centerX + Math.cos(angle) * innerRadius, centerY + Math.sin(angle) * innerRadius)
      .lineTo(centerX + Math.cos(angle) * outerRadius, centerY + Math.sin(angle) * outerRadius)
      .stroke({ color, alpha, width });
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

  private drawCursorTrail(
    points: readonly CursorTrailPoint[],
    visualTimeMs: number,
    transform: ReturnType<typeof computePlayfieldTransform>,
    palette: readonly Rgb[],
    dynamicColours: boolean
  ): void {
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index]!;
      const age = visualTimeMs - point.createdAtMs;
      if (age < 0 || age > 260) {
        continue;
      }

      const life = 1 - age / 260;
      const x = transform.offsetX + point.x * transform.scale;
      const y = transform.offsetY + point.y * transform.scale;
      const radius = (4 + life * 10) * transform.scale;
      const colour = dynamicColours ? cyclePalette(palette, point.createdAtMs + index * 60) : STATIC_CURSOR_COLOUR;
      this.cursor.circle(x, y, radius).fill({ color: rgbToNumber(colour), alpha: life * 0.22 });
      this.cursor.circle(x, y, Math.max(2, radius * 0.4)).fill({ color: rgbToNumber(mixRgb(colour, [255, 255, 255], 0.6)), alpha: life * 0.36 });
    }
  }

  private drawCursor(
    position: { x: number; y: number },
    visualTimeMs: number,
    transform: ReturnType<typeof computePlayfieldTransform>,
    palette: readonly Rgb[],
    dynamicColours: boolean
  ): void {
    const x = transform.offsetX + position.x * transform.scale;
    const y = transform.offsetY + position.y * transform.scale;
    const pulse = (Math.sin(visualTimeMs / 85) + 1) / 2;
    const colour = dynamicColours ? cyclePalette(palette, visualTimeMs) : STATIC_CURSOR_COLOUR;
    const base = rgbToNumber(colour);
    const soft = rgbToNumber(mixRgb(colour, [255, 255, 255], 0.62));
    this.cursor.circle(x, y, 15 + pulse * 2).fill({ color: base, alpha: 0.14 });
    this.cursor.circle(x, y, 9).stroke({ color: 0xf8fafc, alpha: 0.92, width: 2 });
    this.cursor.circle(x, y, 4.5).fill({ color: soft, alpha: 0.96 });
    this.cursor.circle(x, y, 18 + pulse * 6).stroke({ color: base, alpha: 0.24, width: 1 });
  }

  private paletteForBeatmap(beatmap: PreparedBeatmap): readonly Rgb[] {
    if (this.paletteBeatmap === beatmap) {
      return this.palette;
    }

    this.paletteBeatmap = beatmap;
    this.palette = beatmap.colours.combos.length > 0 ? beatmap.colours.combos.map((entry) => entry.rgb) : DEFAULT_COMBO_COLOURS;
    return this.palette;
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
