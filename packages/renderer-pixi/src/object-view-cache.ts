import { Container, Graphics } from 'pixi.js';

import type { PlayfieldTransform } from '@oszillator/core';
import type { PreparedObject } from '@oszillator/ruleset-std';

import { mixRgb, rgbToNumber, sliderVisualMetrics, type Rgb, type SliderVisualMetrics } from './visuals';

type PreparedSlider = Extract<PreparedObject, { kind: 'slider' }>;

export class SliderTrackGraphics {
  readonly root = new Container();
  private readonly outer = new Graphics();
  private readonly inner = new Graphics();
  private readonly highlight = new Graphics();
  private object: PreparedSlider | null = null;
  private scale = Number.NaN;
  private radius = Number.NaN;
  private metrics: SliderVisualMetrics = sliderVisualMetrics(0);

  constructor() {
    this.root.addChild(this.outer, this.inner, this.highlight);
  }

  update(
    object: PreparedSlider,
    transform: PlayfieldTransform,
    radius: number,
    colour: Rgb,
    alpha: number,
    ringAlpha: number
  ): SliderVisualMetrics {
    if (this.object !== object || this.scale !== transform.scale || this.radius !== radius) {
      this.object = object;
      this.scale = transform.scale;
      this.radius = radius;
      this.metrics = sliderVisualMetrics(radius);
      this.drawPath(this.outer, object, this.metrics.outerWidth);
      this.drawPath(this.inner, object, this.metrics.innerWidth);
      this.drawPath(this.highlight, object, this.metrics.highlightWidth);
    }
    this.root.visible = object.trackPoints.length > 1;
    this.root.position.set(transform.offsetX, transform.offsetY);
    this.outer.tint = rgbToNumber(mixRgb(colour, [10, 16, 26], 0.72));
    this.outer.alpha = alpha * 0.88;
    this.inner.tint = rgbToNumber(colour);
    this.inner.alpha = alpha * 0.58;
    this.highlight.tint = rgbToNumber(mixRgb(colour, [255, 255, 255], 0.5));
    this.highlight.alpha = alpha * 0.76 * ringAlpha;
    return this.metrics;
  }

  clear(): void {
    this.object = null;
    this.root.visible = false;
    this.outer.clear();
    this.inner.clear();
    this.highlight.clear();
  }

  private drawPath(graphics: Graphics, object: PreparedSlider, width: number): void {
    graphics.clear();
    const points = object.trackPoints;
    const first = points[0];
    if (!first || points.length < 2) return;
    graphics.moveTo(first.x * this.scale, first.y * this.scale);
    for (let index = 1; index < points.length; index += 1) {
      const point = points[index]!;
      graphics.lineTo(point.x * this.scale, point.y * this.scale);
    }
    graphics.stroke({ color: 0xffffff, width, cap: 'round', join: 'round' });
  }
}

export class ObjectView {
  readonly root = new Container();
  readonly dynamic = new Graphics();
  readonly track = new SliderTrackGraphics();
  object: PreparedObject | null = null;
  lastFrame = 0;

  constructor() {
    // Keep each track below its own head, but above later objects, as before.
    this.root.addChild(this.track.root, this.dynamic);
  }

  reset(): void {
    this.object = null;
    this.dynamic.clear();
    this.track.clear();
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

const MAX_POOLED_VIEWS = 64;

export class ObjectViewCache {
  readonly root = new Container({ sortableChildren: true });
  private readonly views = new Map<PreparedObject, ObjectView>();
  private readonly active: ObjectView[] = [];
  private readonly pool: ObjectView[] = [];
  private objects: readonly PreparedObject[] | null = null;
  private frame = 0;

  beginFrame(objects: readonly PreparedObject[]): void {
    if (this.objects !== objects) {
      this.clear();
      this.objects = objects;
    }
    this.frame += 1;
  }

  activate(object: PreparedObject, index: number): ObjectView {
    let view = this.views.get(object);
    if (!view) {
      view = this.pool.pop() ?? new ObjectView();
      view.object = object;
      view.root.zIndex = -index;
      this.views.set(object, view);
      this.active.push(view);
      this.root.addChild(view.root);
    }
    view.lastFrame = this.frame;
    view.dynamic.clear();
    view.track.root.visible = false;
    return view;
  }

  endFrame(): void {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const view = this.active[index]!;
      if (view.lastFrame === this.frame) continue;
      if (view.object) this.views.delete(view.object);
      this.root.removeChild(view.root);
      const last = this.active.pop()!;
      if (index < this.active.length) this.active[index] = last;
      view.reset();
      if (this.pool.length < MAX_POOLED_VIEWS) this.pool.push(view);
      else view.destroy();
    }
  }

  clear(): void {
    for (const view of this.active) {
      this.root.removeChild(view.root);
      view.destroy();
    }
    for (const view of this.pool) view.destroy();
    this.active.length = 0;
    this.pool.length = 0;
    this.views.clear();
    this.objects = null;
  }
}
