import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

import { buildOszArchiveManifest } from './manifest';
import { unzipOszArchive } from './unzip';

const osuText = `osu file format v14
[General]
AudioFilename: audio.wav
Mode: 0
[Metadata]
Title: Test
Artist: Artist
Creator: Mapper
Version: Normal
[Difficulty]
OverallDifficulty: 5
[Events]
0,0,"bg.png",0,0
[TimingPoints]
0,500,4,2,0,60,1,0
[HitObjects]
256,192,1000,1,0,0:0:0:0:
`;

describe('osz manifest', () => {
  it('builds a manifest from a valid zip archive', () => {
    const archive = zipSync({
      'song/test.osu': strToU8(osuText),
      'song/audio.wav': new Uint8Array([1, 2, 3]),
      'song/bg.png': new Uint8Array([4, 5, 6])
    });

    const entries = unzipOszArchive(archive);
    const manifest = buildOszArchiveManifest(entries);

    expect(manifest.beatmaps).toHaveLength(1);
    expect(manifest.beatmaps[0]?.audioPath).toBe('song/audio.wav');
    expect(manifest.beatmaps[0]?.backgroundPath).toBe('song/bg.png');
    expect(manifest.assets.audioCandidates).toEqual(['song/audio.wav']);
  });

  it('handles unsupported modes without crashing', () => {
    const archive = zipSync({
      'map.osu': strToU8(osuText.replace('Mode: 0', 'Mode: 3'))
    });

    const manifest = buildOszArchiveManifest(unzipOszArchive(archive));
    expect(manifest.beatmaps[0]?.supported).toBe(false);
  });
});
