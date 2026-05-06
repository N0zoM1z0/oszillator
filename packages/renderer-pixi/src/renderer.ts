import { Application, Container, Graphics } from 'pixi.js';

import { computePlayfieldTransform, queryVisibleTimeRange, type Vec2 } from '@oszillator/core';
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

    this.playfield.clear();
    this.playfield
      .rect(transform.offsetX, transform.offsetY, transform.width, transform.height)
      .fill({ color: 0x111827, alpha: Math.max(0.1, 1 - input.settings.backgroundDim) })
      .stroke({ color: 0x64748b, alpha: 0.5, width: 1 });

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
    const cursor = this.toScreen(input.gameplayState.cursor, transform);
    this.cursor.circle(cursor.x, cursor.y, 6).fill({ color: 0xf8fafc, alpha: 0.9 });
  }

  destroy(): void {
    this.app.destroy(true);
  }

  private drawObject(object: PreparedObject, gameTimeMs: number, transform: ReturnType<typeof computePlayfieldTransform>): void {
    const alpha = Math.max(0.15, Math.min(1, 1 - Math.abs(gameTimeMs - object.startTimeMs) / 1800));
    const position = this.toScreen(object.position, transform);
    const radius = object.radius * transform.scale;

    if (object.kind === 'slider') {
      const points = object.path.sampledPoints;
      if (points.length > 1) {
        const first = this.toScreen(points[0]!, transform);
        this.objects.moveTo(first.x, first.y);
        for (let index = 1; index < points.length; index += 1) {
          const point = this.toScreen(points[index]!, transform);
          this.objects.lineTo(point.x, point.y);
        }
        this.objects.stroke({ color: 0x38bdf8, alpha: 0.55, width: Math.max(4, radius * 0.25) });
      }
    }

    if (object.kind === 'spinner') {
      this.objects.circle(position.x, position.y, radius * 2.6).stroke({ color: 0xfacc15, alpha, width: 4 });
      return;
    }

    this.objects.circle(position.x, position.y, radius).fill({ color: 0xe2e8f0, alpha });
    this.objects.circle(position.x, position.y, radius * 1.75).stroke({ color: 0x67e8f9, alpha: alpha * 0.8, width: 2 });
  }

  private toScreen(position: Vec2, transform: ReturnType<typeof computePlayfieldTransform>): Vec2 {
    return {
      x: transform.offsetX + position.x * transform.scale,
      y: transform.offsetY + position.y * transform.scale
    };
  }
}
