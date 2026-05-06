import { Application, Container, Graphics } from 'pixi.js';

import { computePlayfieldTransform, queryVisibleTimeRange } from '@oszillator/core';
import type { GameplayState, PreparedBeatmap, PreparedObject } from '@oszillator/ruleset-std';

export type RenderSettings = {
  width: number;
  height: number;
  backgroundDim: number;
};

export type RenderFrameInput = {
  beatmap: PreparedBeatmap;
  gameTimeMs: number;
  gameplayState: GameplayState;
  settings: RenderSettings;
};

export class PixiPlayfieldRenderer {
  private readonly app = new Application();

  private readonly root = new Container();

  private readonly playfield = new Graphics();

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
    this.root.addChild(this.playfield, this.objects, this.cursor);
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

    this.objects.clear();
    const visible = queryVisibleTimeRange(
      input.beatmap.objects,
      input.gameTimeMs - 200,
      input.gameTimeMs + input.beatmap.difficulty.preemptMs,
      (object) => object.startTimeMs
    );
    for (let index = visible.startIndex; index < visible.endIndex; index += 1) {
      const object = input.beatmap.objects[index];
      if (object) {
        this.drawObject(object, input.gameTimeMs, transform);
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

  private drawObject(object: PreparedObject, gameTimeMs: number, transform: ReturnType<typeof computePlayfieldTransform>): void {
    const alpha = Math.max(0.15, Math.min(1, 1 - Math.abs(gameTimeMs - object.startTimeMs) / 1800));
    const positionX = transform.offsetX + object.position.x * transform.scale;
    const positionY = transform.offsetY + object.position.y * transform.scale;
    const radius = object.radius * transform.scale;

    if (object.kind === 'slider') {
      const points = object.path.sampledPoints;
      if (points.length > 1) {
        const first = points[0]!;
        this.objects.moveTo(transform.offsetX + first.x * transform.scale, transform.offsetY + first.y * transform.scale);
        for (let index = 1; index < points.length; index += 1) {
          const point = points[index]!;
          this.objects.lineTo(transform.offsetX + point.x * transform.scale, transform.offsetY + point.y * transform.scale);
        }
        this.objects.stroke({ color: 0x38bdf8, alpha: 0.55, width: Math.max(4, radius * 0.25) });
      }
    }

    if (object.kind === 'spinner') {
      this.objects.circle(positionX, positionY, radius * 2.6).stroke({ color: 0xfacc15, alpha, width: 4 });
      return;
    }

    this.objects.circle(positionX, positionY, radius).fill({ color: 0xe2e8f0, alpha });
    this.objects.circle(positionX, positionY, radius * 1.75).stroke({ color: 0x67e8f9, alpha: alpha * 0.8, width: 2 });
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
      .rect(transform.offsetX, transform.offsetY, transform.width, transform.height)
      .fill({ color: 0x111827, alpha: Math.max(0.1, 1 - settings.backgroundDim) })
      .stroke({ color: 0x64748b, alpha: 0.5, width: 1 });
  }
}
