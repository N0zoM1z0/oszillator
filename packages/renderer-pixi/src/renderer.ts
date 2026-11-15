import { Application, Container, Graphics } from 'pixi.js';

import { computePlayfieldTransform, queryVisibleTimeRange, type PlayfieldTransform, type ScreenRect, type Vec2 } from '@oszillator/core';
import {
  sliderBallPositionAt,
  type GameplayState,
  type PreparedBeatmap,
  type PreparedSlider,
  type PreparedSpinner
} from '@oszillator/ruleset-std';

import { ObjectViewCache } from './object-view-cache';
import { approachCircleRadius, includeActiveLongObjectStartIndex, objectRenderAlpha } from './visibility';
import {
  approachDepthScale,
  clamp,
  CURSOR_TRAIL_LIFETIME_MS,
  cyclePalette,
  DEFAULT_COMBO_COLOURS,
  easeOutCubic,
  JUDGED_OBJECT_FADE_MS,
  mixColour,
  objectVisualColour,
  rgbToNumber,
  SMOKE_LIFETIME_MS,
  smoothstep,
  STATIC_CURSOR_COLOUR,
  WHITE,
  type EffectPoint
} from './visuals';

export type RenderSettings = ScreenRect & {
  backgroundDim: number;
};

export type SmokePuff = EffectPoint;

export type CursorTrailPoint = EffectPoint;

export type RenderFrameInput = {
  beatmap: PreparedBeatmap;
  gameTimeMs: number;
  /** Wall-clock time for purely cosmetic animation (cursor pulse, trail). */
  visualTimeMs: number;
  gameplayState: GameplayState;
  settings: RenderSettings;
  hidden: boolean;
  dynamicColours: boolean;
  smokePuffs?: readonly SmokePuff[];
  cursorTrail?: readonly CursorTrailPoint[];
};

/** Objects stay renderable for this long after their start time. */
const PAST_OBJECT_WINDOW_MS = 200;
const OBJECT_SHADOW = 0x020617;
const CIRCLE_EDGE = 0xf8fafc;
const CIRCLE_DEPTH = 0x0c121c;
const SPINNER_DEPTH = 0x080d16;
const BALL_EDGE = 0xfffbeb;
const SMOKE_OUTER = 0xe5e7eb;
const SMOKE_INNER = 0xf8fafc;
const PLAYFIELD_FILL = 0x111827;
const PLAYFIELD_EDGE = 0x64748b;
const ARC_STEPS = 28;
const SPINNER_TICKS = 12;

/**
 * Draws prepared gameplay state with Pixi. It reads only PreparedBeatmap and
 * GameplayState; it never parses beatmaps or makes judgement decisions.
 */
export class PixiPlayfieldRenderer {
  private readonly app = new Application();

  private readonly root = new Container();

  private readonly playfield = new Graphics();

  private readonly smoke = new Graphics();

  private readonly cursor = new Graphics();

  private readonly objectViews = new ObjectViewCache();

  private width = 0;

  private height = 0;

  private transform: PlayfieldTransform | null = null;

  private transformSettings: RenderSettings | null = null;

  private playfieldTransform: PlayfieldTransform | null = null;

  private playfieldDim = Number.NaN;

  private paletteSource: PreparedBeatmap['colours'] | null = null;

  private palette: readonly number[] = DEFAULT_COMBO_COLOURS;

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
    this.root.addChild(this.playfield, this.smoke, this.objectViews.root, this.cursor);
  }

  renderFrame(input: RenderFrameInput): void {
    this.resize(input.settings);
    const transform = this.transformFor(input.settings);
    const palette = this.paletteFor(input.beatmap);

    this.drawPlayfield(input.settings, transform);
    this.drawSmoke(input.smokePuffs ?? [], input.gameTimeMs, transform);
    this.drawObjects(input, transform, palette);

    this.cursor.clear();
    this.drawCursorTrail(input.cursorTrail ?? [], input.visualTimeMs, transform, palette, input.dynamicColours);
    this.drawCursor(input.gameplayState.cursor, input.visualTimeMs, transform, palette, input.dynamicColours);
  }

  destroy(): void {
    this.objectViews.clear();
    this.app.destroy(true, { children: true });
  }

  private resize(settings: RenderSettings): void {
    if (this.width === settings.width && this.height === settings.height) {
      return;
    }
    this.width = settings.width;
    this.height = settings.height;
    this.app.renderer.resize(settings.width, settings.height);
  }

  private drawObjects(input: RenderFrameInput, transform: PlayfieldTransform, palette: readonly number[]): void {
    const { beatmap, gameTimeMs, hidden, dynamicColours } = input;
    const { preemptMs, fadeInMs } = beatmap.difficulty;
    const objects = beatmap.objects;

    this.objectViews.beginFrame(objects);
    const pastCutoffMs = gameTimeMs - PAST_OBJECT_WINDOW_MS;
    const visible = queryVisibleTimeRange(objects, pastCutoffMs, gameTimeMs + preemptMs, (object) => object.startTimeMs);
    const firstIndex = includeActiveLongObjectStartIndex(objects, visible.startIndex, pastCutoffMs);

    // Later objects are drawn first so earlier ones sit on top.
    for (let index = visible.endIndex - 1; index >= firstIndex; index -= 1) {
      const object = objects[index]!;
      const renderState = input.gameplayState.objects[index];
      const judgedAgeMs = renderState?.judgedAtMs === undefined ? null : gameTimeMs - renderState.judgedAtMs;
      if (judgedAgeMs !== null && judgedAgeMs >= JUDGED_OBJECT_FADE_MS) {
        continue;
      }

      const judgedProgress = judgedAgeMs === null ? 0 : clamp(judgedAgeMs / JUDGED_OBJECT_FADE_MS, 0, 1);
      const alpha = objectRenderAlpha(object, gameTimeMs, preemptMs, fadeInMs, hidden) * (1 - smoothstep(judgedProgress));
      if (alpha <= 0) {
        continue;
      }

      const view = this.objectViews.activate(object, index);
      const graphics = view.dynamic;
      const x = transform.offsetX + object.position.x * transform.scale;
      const y = transform.offsetY + object.position.y * transform.scale;
      const radius = object.radius * transform.scale;
      const colour = objectVisualColour(palette, object.comboIndex, dynamicColours, gameTimeMs);
      const approachRadius = hidden ? radius : approachCircleRadius(object.startTimeMs, gameTimeMs, radius, preemptMs);
      const depthScale = approachDepthScale(object.startTimeMs, gameTimeMs, preemptMs);

      if (object.kind === 'slider') {
        const metrics = view.track.update(object, transform, radius, colour, alpha);
        this.drawSliderBody(graphics, object, gameTimeMs, transform, radius, metrics.markerSize, colour, alpha);
        drawHitCircle(graphics, x, y, metrics.headRadius, alpha, approachRadius, colour, 0, depthScale);
        this.drawSliderBall(graphics, object, gameTimeMs, transform, radius, colour);
      } else if (object.kind === 'spinner') {
        drawSpinner(graphics, object, gameTimeMs, x, y, radius, alpha, colour);
      } else {
        drawHitCircle(graphics, x, y, radius, alpha, approachRadius, colour, judgedProgress, depthScale);
      }
    }

    this.objectViews.endFrame();
  }

  private drawSliderBody(
    graphics: Graphics,
    slider: PreparedSlider,
    gameTimeMs: number,
    transform: PlayfieldTransform,
    radius: number,
    markerSize: number,
    colour: number,
    alpha: number
  ): void {
    const tickColour = mixColour(colour, WHITE, 0.62);
    for (const checkpoint of slider.checkpoints) {
      if (checkpoint.kind === 'tail' || checkpoint.time < gameTimeMs) {
        continue;
      }
      const x = transform.offsetX + checkpoint.position.x * transform.scale;
      const y = transform.offsetY + checkpoint.position.y * transform.scale;
      if (checkpoint.kind === 'tick') {
        graphics.circle(x, y, Math.max(3, radius * 0.16)).fill({ color: tickColour, alpha: alpha * 0.75 });
      } else {
        drawRepeatMarker(graphics, x, y, markerSize * 0.62, alpha);
      }
    }
  }

  private drawSliderBall(
    graphics: Graphics,
    slider: PreparedSlider,
    gameTimeMs: number,
    transform: PlayfieldTransform,
    radius: number,
    colour: number
  ): void {
    if (gameTimeMs < slider.startTimeMs || gameTimeMs > slider.endTimeMs || slider.spanDurationMs <= 0 || slider.pixelLength <= 0) {
      return;
    }
    const ball = sliderBallPositionAt(slider, gameTimeMs);
    const x = transform.offsetX + ball.x * transform.scale;
    const y = transform.offsetY + ball.y * transform.scale;
    const ballRadius = radius * 0.72;
    graphics.circle(x, y, ballRadius).fill({ color: mixColour(colour, WHITE, 0.25), alpha: 0.92 });
    graphics.circle(x, y, ballRadius).stroke({ color: BALL_EDGE, alpha: 0.95, width: Math.max(2, radius * 0.08) });
  }

  private drawSmoke(puffs: readonly SmokePuff[], gameTimeMs: number, transform: PlayfieldTransform): void {
    this.smoke.clear();
    for (const puff of puffs) {
      const age = gameTimeMs - puff.createdAtMs;
      if (age < 0 || age > SMOKE_LIFETIME_MS) {
        continue;
      }

      const life = 1 - age / SMOKE_LIFETIME_MS;
      const radius = (10 + age * 0.018) * transform.scale;
      const x = transform.offsetX + puff.x * transform.scale;
      const y = transform.offsetY + puff.y * transform.scale;
      this.smoke.circle(x, y, radius).fill({ color: SMOKE_OUTER, alpha: life * 0.12 });
      this.smoke.circle(x, y, radius * 0.55).fill({ color: SMOKE_INNER, alpha: life * 0.08 });
    }
  }

  private drawCursorTrail(
    points: readonly CursorTrailPoint[],
    visualTimeMs: number,
    transform: PlayfieldTransform,
    palette: readonly number[],
    dynamicColours: boolean
  ): void {
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index]!;
      const age = visualTimeMs - point.createdAtMs;
      if (age < 0 || age > CURSOR_TRAIL_LIFETIME_MS) {
        continue;
      }

      const life = 1 - age / CURSOR_TRAIL_LIFETIME_MS;
      const x = transform.offsetX + point.x * transform.scale;
      const y = transform.offsetY + point.y * transform.scale;
      const radius = (4 + life * 10) * transform.scale;
      const colour = dynamicColours ? cyclePalette(palette, point.createdAtMs + index * 60) : STATIC_CURSOR_COLOUR;
      this.cursor.circle(x, y, radius).fill({ color: colour, alpha: life * 0.22 });
      this.cursor.circle(x, y, Math.max(2, radius * 0.4)).fill({ color: mixColour(colour, WHITE, 0.6), alpha: life * 0.36 });
    }
  }

  private drawCursor(
    position: Vec2,
    visualTimeMs: number,
    transform: PlayfieldTransform,
    palette: readonly number[],
    dynamicColours: boolean
  ): void {
    const x = transform.offsetX + position.x * transform.scale;
    const y = transform.offsetY + position.y * transform.scale;
    const pulse = (Math.sin(visualTimeMs / 85) + 1) / 2;
    const colour = dynamicColours ? cyclePalette(palette, visualTimeMs) : STATIC_CURSOR_COLOUR;
    this.cursor.circle(x, y, 15 + pulse * 2).fill({ color: colour, alpha: 0.14 });
    this.cursor.circle(x, y, 9).stroke({ color: CIRCLE_EDGE, alpha: 0.92, width: 2 });
    this.cursor.circle(x, y, 4.5).fill({ color: mixColour(colour, WHITE, 0.62), alpha: 0.96 });
    this.cursor.circle(x, y, 18 + pulse * 6).stroke({ color: colour, alpha: 0.24, width: 1 });
  }

  private paletteFor(beatmap: PreparedBeatmap): readonly number[] {
    // Keyed by the colours section, which mod variants of a beatmap share.
    if (this.paletteSource !== beatmap.colours) {
      this.paletteSource = beatmap.colours;
      this.palette =
        beatmap.colours.combos.length > 0 ? beatmap.colours.combos.map((entry) => rgbToNumber(entry.rgb)) : DEFAULT_COMBO_COLOURS;
    }
    return this.palette;
  }

  private transformFor(settings: RenderSettings): PlayfieldTransform {
    const previous = this.transformSettings;
    if (
      !this.transform ||
      !previous ||
      previous.width !== settings.width ||
      previous.height !== settings.height ||
      previous.playfieldPadding !== settings.playfieldPadding ||
      previous.insetTop !== settings.insetTop ||
      previous.insetRight !== settings.insetRight ||
      previous.insetBottom !== settings.insetBottom ||
      previous.insetLeft !== settings.insetLeft
    ) {
      this.transformSettings = { ...settings };
      this.transform = computePlayfieldTransform(settings);
    }
    return this.transform;
  }

  private drawPlayfield(settings: RenderSettings, transform: PlayfieldTransform): void {
    // `transform` is only replaced when the stage geometry changes.
    if (transform === this.playfieldTransform && settings.backgroundDim === this.playfieldDim) {
      return;
    }
    this.playfieldTransform = transform;
    this.playfieldDim = settings.backgroundDim;
    this.playfield
      .clear()
      .rect(transform.outerOffsetX, transform.outerOffsetY, transform.outerWidth, transform.outerHeight)
      .fill({ color: PLAYFIELD_FILL, alpha: Math.max(0.1, 1 - settings.backgroundDim) })
      .stroke({ color: PLAYFIELD_EDGE, alpha: 0.5, width: 1 });
  }
}

const drawHitCircle = (
  graphics: Graphics,
  x: number,
  y: number,
  radius: number,
  alpha: number,
  approachRadius: number,
  colour: number,
  judgedProgress: number,
  depthScale: number
): void => {
  const soft = mixColour(colour, WHITE, 0.45);
  const deep = mixColour(colour, CIRCLE_DEPTH, 0.58);
  const hitBloom = smoothstep(judgedProgress);
  const circleRadius = radius * depthScale * (1 + hitBloom * 0.08);

  graphics.circle(x + radius * 0.08, y + radius * 0.1, circleRadius * 1.06).fill({ color: OBJECT_SHADOW, alpha: alpha * 0.2 });
  if (approachRadius > radius) {
    graphics.circle(x, y, approachRadius).stroke({ color: colour, alpha: alpha * 0.85, width: 3 });
  }
  if (judgedProgress > 0) {
    graphics.circle(x, y, radius * (1.08 + hitBloom * 0.42)).stroke({
      color: soft,
      alpha: alpha * (1 - judgedProgress) * 0.72,
      width: Math.max(2, radius * 0.05)
    });
  }
  graphics.circle(x, y, circleRadius).fill({ color: deep, alpha: alpha * 0.78 });
  graphics.circle(x, y, circleRadius).stroke({ color: CIRCLE_EDGE, alpha, width: Math.max(3, radius * 0.12) });
  graphics.circle(x, y, circleRadius * 0.75).fill({ color: colour, alpha: alpha * 0.92 });
  graphics.circle(x, y, circleRadius * 0.46).fill({ color: soft, alpha: alpha * 0.58 });
  graphics.circle(x - radius * 0.18, y - radius * 0.22, radius * 0.18).fill({ color: WHITE, alpha: alpha * 0.34 });
};

const drawRepeatMarker = (graphics: Graphics, x: number, y: number, size: number, alpha: number): void => {
  graphics
    .moveTo(x - size * 0.35, y - size * 0.55)
    .lineTo(x + size * 0.35, y)
    .lineTo(x - size * 0.35, y + size * 0.55)
    .stroke({ color: BALL_EDGE, alpha, width: Math.max(2, size * 0.16) });
};

const drawArc = (
  graphics: Graphics,
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  sweep: number,
  color: number,
  alpha: number,
  width: number
): void => {
  graphics.moveTo(centerX + Math.cos(startAngle) * radius, centerY + Math.sin(startAngle) * radius);
  for (let index = 1; index <= ARC_STEPS; index += 1) {
    const angle = startAngle + (sweep * index) / ARC_STEPS;
    graphics.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
  }
  graphics.stroke({ color, alpha, width });
};

const drawSpinner = (
  graphics: Graphics,
  spinner: PreparedSpinner,
  gameTimeMs: number,
  x: number,
  y: number,
  radius: number,
  alpha: number,
  colour: number
): void => {
  const soft = mixColour(colour, WHITE, 0.55);
  const deep = mixColour(colour, SPINNER_DEPTH, 0.72);
  const spinnerRadius = radius * 3.1;
  const activeProgress = clamp((gameTimeMs - spinner.startTimeMs) / Math.max(1, spinner.endTimeMs - spinner.startTimeMs), 0, 1);
  const progressRadius = spinnerRadius * (1.04 - activeProgress * 0.22);
  const rotation = gameTimeMs / 138;
  const reverseRotation = -gameTimeMs / 178;
  const ringAlpha = gameTimeMs <= spinner.endTimeMs ? alpha : alpha * 0.72;

  graphics.circle(x, y, spinnerRadius * 1.2).fill({ color: deep, alpha: ringAlpha * 0.24 });
  graphics.circle(x, y, spinnerRadius * 0.78).fill({ color: deep, alpha: ringAlpha * 0.3 });
  graphics.circle(x, y, spinnerRadius).stroke({ color: colour, alpha: ringAlpha * 0.74, width: Math.max(4, radius * 0.11) });
  graphics.circle(x, y, spinnerRadius * 0.68).stroke({ color: soft, alpha: ringAlpha * 0.44, width: Math.max(2, radius * 0.05) });
  graphics.circle(x, y, progressRadius).stroke({ color: CIRCLE_EDGE, alpha: ringAlpha * 0.5, width: Math.max(2, radius * 0.055) });

  if (gameTimeMs < spinner.startTimeMs) {
    // Shrinking ring announcing the spinner during its last 900 ms of approach.
    const approachProgress = 1 - clamp((spinner.startTimeMs - gameTimeMs) / 900, 0, 1);
    const shrinkRadius = spinnerRadius * (1.75 - easeOutCubic(approachProgress) * 0.72);
    graphics.circle(x, y, shrinkRadius).stroke({ color: CIRCLE_EDGE, alpha: alpha * 0.84, width: Math.max(3, radius * 0.08) });
  } else if (gameTimeMs <= spinner.endTimeMs) {
    graphics.circle(x, y, progressRadius * 0.86).stroke({ color: soft, alpha: alpha * 0.26, width: Math.max(2, radius * 0.04) });
  }

  drawArc(graphics, x, y, spinnerRadius * 0.92, rotation, Math.PI * 1.08, colour, ringAlpha * 0.96, Math.max(4, radius * 0.13));
  drawArc(graphics, x, y, spinnerRadius * 0.52, reverseRotation, Math.PI * 0.86, soft, ringAlpha * 0.82, Math.max(3, radius * 0.08));
  drawArc(graphics, x, y, spinnerRadius * 1.08, -rotation * 0.7, Math.PI * 0.42, WHITE, ringAlpha * 0.5, Math.max(2, radius * 0.05));

  const tickWidth = Math.max(1.5, radius * 0.035);
  for (let index = 0; index < SPINNER_TICKS; index += 1) {
    const angle = rotation * 0.45 + (index / SPINNER_TICKS) * Math.PI * 2;
    const tickAlpha = alpha * (0.2 + 0.45 * ((Math.sin(angle * 2 + gameTimeMs / 260) + 1) / 2));
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    graphics
      .moveTo(x + cos * spinnerRadius * 0.78, y + sin * spinnerRadius * 0.78)
      .lineTo(x + cos * spinnerRadius * 0.88, y + sin * spinnerRadius * 0.88)
      .stroke({ color: soft, alpha: tickAlpha, width: tickWidth });
  }

  graphics.circle(x, y, radius * 1.04).fill({ color: colour, alpha: ringAlpha * (0.54 + activeProgress * 0.24) });
  graphics.circle(x, y, radius * 0.46).fill({ color: soft, alpha: ringAlpha * 0.76 });
  graphics.circle(x, y, radius * 1.3).stroke({ color: CIRCLE_EDGE, alpha: ringAlpha * 0.8, width: Math.max(2, radius * 0.05) });
};
