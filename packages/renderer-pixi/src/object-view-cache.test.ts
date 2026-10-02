import { beforeEach, describe, expect, it, vi } from 'vitest';

import { computePlayfieldTransform } from '@oszillator/core';
import { parseOsu } from '../../osu-parser/src/index';
import { prepareBeatmap } from '../../ruleset-std/src/index';

import { ObjectViewCache, SliderTrackGraphics } from './object-view-cache';
import { sliderVisualMetrics } from './visuals';

const probe = vi.hoisted(() => ({
  strokes: [] as Array<{
    points: Array<[number, number]>;
    width: number;
    color: number;
  }>,
  created: 0,
  destroyed: 0
}));
vi.mock('pixi.js', () => {
  class Container {
    children: Container[] = [];
    position = { set: vi.fn() };
    zIndex = 0;
    visible = true;
    alpha = 1;
    tint = 0xffffff;
    addChild(...children: Container[]) {
      this.children.push(...children);
    }
    removeChild(child: Container) {
      this.children.splice(this.children.indexOf(child), 1);
    }
    destroy(options?: { children?: boolean }) {
      if (options?.children) this.children.forEach((child) => child.destroy(options));
      this.children.length = 0;
    }
  }
  class Graphics extends Container {
    private points: Array<[number, number]> = [];
    constructor() {
      super();
      probe.created += 1;
    }
    clear() {
      this.points.length = 0;
      return this;
    }
    moveTo(x: number, y: number) {
      this.points.push([x, y]);
      return this;
    }
    lineTo(x: number, y: number) {
      this.points.push([x, y]);
      return this;
    }
    stroke(style: { width: number; color: number }) {
      probe.strokes.push({ ...style, points: [...this.points] });
      return this;
    }
    override destroy(options?: { children?: boolean }) {
      probe.destroyed += 1;
      super.destroy(options);
    }
  }
  return { Container, Graphics };
});

const beatmap = prepareBeatmap(
  parseOsu(`osu file format v14
[Difficulty]
CircleSize:4
SliderMultiplier:1.4
SliderTickRate:1
[TimingPoints]
0,500,4,2,0,60,1,0
[HitObjects]
100,100,1000,2,0,L|300:100,2,200
200,200,1500,1,0,0:0:0:0:
`)
);
const slider = beatmap.objects[0]!;
if (slider.kind !== 'slider') throw new Error('Expected synthetic slider');
const transform = computePlayfieldTransform({ width: 800, height: 600 });

beforeEach(() => {
  probe.strokes.length = 0;
  probe.created = 0;
  probe.destroyed = 0;
});

describe('cached slider geometry', () => {
  it('preserves all three track paths and only retints/refades during subsequent frames', () => {
    const track = new SliderTrackGraphics();
    const radius = slider.radius * transform.scale;
    const metrics = track.update(slider, transform, radius, [56, 189, 248], 1, 1);
    expect(metrics).toEqual(sliderVisualMetrics(radius));
    expect(probe.strokes.map((stroke) => stroke.width)).toEqual([metrics.outerWidth, metrics.innerWidth, metrics.highlightWidth]);
    for (const stroke of probe.strokes) {
      expect(stroke.points).toEqual(slider.trackPoints.map((point) => [point.x * transform.scale, point.y * transform.scale]));
      expect(stroke.color).toBe(0xffffff);
    }
    for (let frame = 0; frame < 120; frame += 1) {
      track.update(slider, { ...transform, offsetX: frame }, radius, [255, 0, 0], 0.5, 1);
    }
    expect(probe.strokes).toHaveLength(3);
    expect(track.root.position.set).toHaveBeenLastCalledWith(119, transform.offsetY);
    expect(track.root.children[1]?.tint).toBe(0xff0000);
    expect(track.root.children[1]?.alpha).toBeCloseTo(0.29);
  });

  it('invalidates on scale, radius, object identity and explicit resource release', () => {
    const track = new SliderTrackGraphics();
    track.update(slider, transform, 20, [0, 0, 255], 1, 1);
    track.update(slider, { ...transform, scale: 0.01 }, 0.2, [0, 0, 255], 1, 1);
    expect(probe.strokes[3]?.width).toBe(10); // Preserve the minimum screen-space track width.
    track.update(slider, { ...transform, scale: 0.01 }, 30, [0, 0, 255], 1, 1);
    track.update({ ...slider }, transform, 20, [0, 0, 255], 1, 1);
    track.clear();
    expect(track.root.visible).toBe(false);
    track.update(slider, transform, 20, [0, 0, 255], 1, 1);
    expect(probe.strokes).toHaveLength(15);
    track.root.destroy({ children: true });
    expect(probe.destroyed).toBe(3);
  });
});

describe('visible object resource lifecycle', () => {
  it('reuses views while visible and preserves track/head and overlap ordering', () => {
    const cache = new ObjectViewCache();
    cache.beginFrame(beatmap.objects);
    const first = cache.activate(slider, 0);
    const second = cache.activate(beatmap.objects[1]!, 1);
    cache.endFrame();
    expect(first.root.children).toEqual([first.track.root, first.dynamic]);
    expect(first.root.zIndex).toBeGreaterThan(second.root.zIndex);
    cache.beginFrame(beatmap.objects);
    expect(cache.activate(slider, 0)).toBe(first);
    cache.endFrame();
    expect(cache.root.children).toEqual([first.root]);
    cache.clear();
    expect(cache.root.children).toHaveLength(0);
    expect(probe.destroyed).toBe(probe.created);
  });

  it('bounds offscreen pooling and destroys resources on a new prepared geometry', () => {
    const cache = new ObjectViewCache();
    const objects = Array.from({ length: 100 }, () => ({ ...slider }));
    cache.beginFrame(objects);
    objects.forEach((object, index) => cache.activate(object, index));
    cache.endFrame();
    expect(probe.created).toBe(400);
    cache.beginFrame(objects);
    cache.endFrame();
    expect(probe.destroyed).toBe(36 * 4);
    cache.beginFrame(objects);
    objects.slice(0, 65).forEach((object, index) => cache.activate(object, index));
    cache.endFrame();
    expect(probe.created).toBe(404);
    cache.beginFrame([...objects]);
    expect(cache.root.children).toHaveLength(0);
    expect(probe.destroyed).toBe(probe.created);
  });
});
