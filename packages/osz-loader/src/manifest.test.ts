import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

import { buildOszArchiveManifest } from './manifest';
import { unzipOszArchive } from './unzip';
import { hashBytes } from './archive-hash';
import { archiveTransferBuffers } from './transfer';

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
Video,500,"video.mp4"
[TimingPoints]
0,500,4,2,0,60,1,0
[HitObjects]
256,192,1000,1,0,0:0:0:0:
`;

describe('osz manifest', () => {
  it('preserves the concatenated 4 KiB prefix ID across empty and split entries', () => {
    for (const chunks of [[], [new Uint8Array(0)], [new Uint8Array(100).fill(1), new Uint8Array(5000).fill(2)], [new Uint8Array([3, 4])]]) {
      const entries = chunks.map((bytes, index) => ({
        path: `${index}.bin`,
        normalizedPath: `${index}.bin`,
        bytes
      }));
      const reference = new Uint8Array(chunks.flatMap((bytes) => [...bytes]).slice(0, 4096));
      expect(buildOszArchiveManifest(entries).archiveId).toBe(hashBytes(reference));
    }
  });

  it('does not consume opaque asset bytes beyond the hash prefix', () => {
    const payload = new Uint8Array(1024 * 1024).fill(7);
    const guarded = new Proxy(payload, {
      get(target, property) {
        if (property === Symbol.iterator) {
          return function* () {
            for (let index = 0; index < target.length; index += 1) {
              if (index >= 4096) throw new Error('Read beyond archive hash prefix');
              yield target[index]!;
            }
          };
        }
        if (typeof property === 'string' && /^\d+$/.test(property) && Number(property) >= 4096) {
          throw new Error('Read beyond archive hash prefix');
        }
        return Reflect.get(target, property, target);
      }
    });
    const manifest = buildOszArchiveManifest([{ path: 'large.bin', normalizedPath: 'large.bin', bytes: guarded }]);
    expect(manifest.archiveId).toBe(hashBytes(payload.subarray(0, 4096)));
    expect(manifest.entryBytes['large.bin']).toBe(guarded);
    expect(manifest.files[0]?.size).toBe(payload.length);
  });

  it('transfers shared asset buffers once and preserves the bytes of every view', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const manifest = buildOszArchiveManifest([
      { path: 'a.bin', normalizedPath: 'a.bin', bytes: bytes.subarray(0, 2) },
      { path: 'b.bin', normalizedPath: 'b.bin', bytes: bytes.subarray(2) }
    ]);
    const transfer = archiveTransferBuffers(manifest);
    expect(transfer).toHaveLength(1);
    const received = structuredClone(manifest, { transfer });
    expect([...received.entryBytes['a.bin']!]).toEqual([1, 2]);
    expect([...received.entryBytes['b.bin']!]).toEqual([3, 4]);
    expect(bytes.buffer.byteLength).toBe(0);
  });

  it('builds a manifest from a valid zip archive', () => {
    const archive = zipSync({
      'song/test.osu': strToU8(osuText),
      'song/audio.wav': new Uint8Array([1, 2, 3]),
      'song/bg.png': new Uint8Array([4, 5, 6]),
      'song/video.mp4': new Uint8Array([7, 8, 9])
    });

    const entries = unzipOszArchive(archive);
    const manifest = buildOszArchiveManifest(entries);

    expect(manifest.beatmaps).toHaveLength(1);
    expect(manifest.beatmaps[0]?.audioPath).toBe('song/audio.wav');
    expect(manifest.beatmaps[0]?.backgroundPath).toBe('song/bg.png');
    expect(manifest.beatmaps[0]?.videoPath).toBe('song/video.mp4');
    expect(manifest.assets.audioCandidates).toEqual(['song/audio.wav']);
    expect(manifest.assets.videoCandidates).toEqual(['song/video.mp4']);
  });

  it('resolves custom sample filenames relative to the beatmap file', () => {
    const archive = zipSync({
      'song/test.osu': strToU8(osuText.replace('0:0:0:0:', '0:0:0:0:soft-hit.wav')),
      'song/soft-hit.wav': new Uint8Array([1])
    });

    const manifest = buildOszArchiveManifest(unzipOszArchive(archive));
    expect(manifest.beatmaps[0]?.customSamplePaths).toEqual(['song/soft-hit.wav']);
  });

  it('handles unsupported modes without crashing', () => {
    const archive = zipSync({
      'map.osu': strToU8(osuText.replace('Mode: 0', 'Mode: 3'))
    });

    const manifest = buildOszArchiveManifest(unzipOszArchive(archive));
    expect(manifest.beatmaps[0]?.supported).toBe(false);
  });
});
