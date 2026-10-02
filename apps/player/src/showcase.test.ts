import { afterEach, describe, expect, it, vi } from 'vitest';

import { ensureShowcaseAssets, isShowcaseBeatmap, loadShowcaseManifest } from './showcase';

const source = 'osu file format v14\n[General]\nMode:0\n[HitObjects]\n256,192,1000,1,0,0:0:0:0:\n';
const mockFetch = () => {
  const fetch = vi.fn(async (url: string) => new Response(url.endsWith('.osu') ? source : new Uint8Array([1, 2, 3])));
  vi.stubGlobal('fetch', fetch);
  return fetch;
};
afterEach(() => vi.unstubAllGlobals());

describe('showcase asset lifecycle', () => {
  it('loads all difficulty metadata without downloading unselected media', async () => {
    const fetch = mockFetch();
    const manifest = await loadShowcaseManifest();
    expect(manifest.beatmaps).toHaveLength(3);
    expect(fetch.mock.calls.map(([url]) => url.endsWith('.osu'))).toEqual([true, true, true]);
    await ensureShowcaseAssets(manifest, manifest.beatmaps[0]!);
    expect(manifest.entryBytes['audio.mp3']).toEqual(new Uint8Array([1, 2, 3]));
    expect(manifest.entryBytes['sola-imoutos-extra/video.mp4']).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('shares concurrent requests and reuses assets on subsequent selections', async () => {
    const fetch = mockFetch();
    const manifest = await loadShowcaseManifest();
    const beatmap = manifest.beatmaps[1]!;
    await Promise.all([ensureShowcaseAssets(manifest, beatmap), ensureShowcaseAssets(manifest, beatmap)]);
    await ensureShowcaseAssets(manifest, beatmap);
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(manifest.files.filter((file) => file.normalizedPath === beatmap.videoPath)).toHaveLength(1);
  });

  it('never fetches showcase assets for a local archive with matching filenames', async () => {
    const fetch = mockFetch();
    const manifest = {
      ...(await loadShowcaseManifest()),
      archiveId: 'fnv1a-local'
    };
    const beatmap = manifest.beatmaps[0]!;
    expect(isShowcaseBeatmap(beatmap, manifest)).toBe(false);
    await ensureShowcaseAssets(manifest, beatmap);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('allows a failed asset request to be retried without refetching successful assets', async () => {
    const fetch = mockFetch();
    const manifest = await loadShowcaseManifest();
    fetch.mockRejectedValueOnce(new Error('network unavailable'));
    await expect(ensureShowcaseAssets(manifest, manifest.beatmaps[0]!)).rejects.toThrow('network unavailable');
    await ensureShowcaseAssets(manifest, manifest.beatmaps[0]!);
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(manifest.files.filter((file) => file.normalizedPath === 'BG.jpg')).toHaveLength(1);
  });
});
