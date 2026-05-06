import { describe, expect, it } from 'vitest';

import { parseOsu } from './parse-osu';

const fixture = `osu file format v14

[General]
AudioFilename: sample.wav
PreviewTime: 1000
SampleSet: Soft
StackLeniency: 0.4
Mode: 0

[Metadata]
Title: Test Song
TitleUnicode: 测试
Artist: Test Artist
ArtistUnicode: 测试作者
Creator: Mapper
Version: Hard
Source: Unit Tests
Tags: alpha beta
BeatmapID: 11
BeatmapSetID: 22

[Difficulty]
HPDrainRate: 6
CircleSize: 4
OverallDifficulty: 8
SliderMultiplier: 1.7
SliderTickRate: 2

[Events]
0,0,"bg.jpg",0,0
2,5000,7000
Video,0,"video.mp4"

[TimingPoints]
0,500,4,2,0,60,1,0
1500,-100,4,2,0,40,0,0

[Colours]
Combo1 : 255,128,0

[HitObjects]
256,192,1000,1,0,0:0:0:0:
128,192,1500,2,0,B|256:192|320:224,2,180,0|0|0,0:0|0:0|0:0,0:0:0:0:
256,192,2500,8,0,3500,0:0:0:0:
`;

describe('parseOsu', () => {
  it('parses a normal file with typed sections and warnings', () => {
    const parsed = parseOsu(fixture);

    expect(parsed.formatVersion).toBe(14);
    expect(parsed.general.audioFilename).toBe('sample.wav');
    expect(parsed.metadata.title).toBe('Test Song');
    expect(parsed.difficulty.approachRate).toBe(8);
    expect(parsed.events.backgroundFilename).toBe('bg.jpg');
    expect(parsed.events.videoFilename).toBe('video.mp4');
    expect(parsed.events.videoOffsetMs).toBe(0);
    expect(parsed.events.breaks).toEqual([{ startTime: 5000, endTime: 7000 }]);
    expect(parsed.timingPoints).toHaveLength(2);
    expect(parsed.hitObjects.map((item) => item.kind)).toEqual(['circle', 'slider', 'spinner']);
    expect(parsed.warnings.some((warning) => warning.code === 'difficulty.approach-rate-fallback')).toBe(true);
    expect(parsed.warnings.some((warning) => warning.code === 'events.unsupported')).toBe(false);
  });

  it('handles BOM and CRLF inputs', () => {
    const parsed = parseOsu(`\uFEFF${fixture.replaceAll('\n', '\r\n')}`);

    expect(parsed.metadata.artist).toBe('Test Artist');
    expect(parsed.hitObjects).toHaveLength(3);
  });

  it('preserves unknown sections and warns on malformed section headers', () => {
    const parsed = parseOsu(`osu file format v14
[Unknown]
Foo: Bar
[Broken
[HitObjects]
256,192,1000,1,0,0:0:0:0:
`);

    expect(parsed.rawSections.Unknown).toHaveLength(1);
    expect(parsed.warnings.some((warning) => warning.code === 'section.malformed')).toBe(true);
  });

  it('throws when the format header is missing', () => {
    expect(() => parseOsu('[General]\nMode: 0')).toThrow(/header/);
  });

  it('keeps unsupported objects as disabled entries and warns', () => {
    const parsed = parseOsu(`osu file format v14
[HitObjects]
256,192,1000,128,0,1000:0:0:0:0:
`);

    expect(parsed.hitObjects[0]).toMatchObject({ kind: 'unsupported', unsupportedKind: 'hold' });
    expect(parsed.warnings.some((warning) => warning.code === 'hitobjects.unsupported-kind')).toBe(true);
  });
});
