import { parseOsu } from '@oszillator/osu-parser';
import type { BeatmapManifestEntry, OszArchiveManifest } from '@oszillator/osz-loader';

const SHOWCASE_DIR = `${import.meta.env.BASE_URL}showcase`;
const SHOWCASE_ARCHIVE_ID = 'bundled-showcases';

type ShowcaseAssetSet = {
  osuPath: string;
  audioPath: string;
  backgroundPath: string;
  videoPath: string | null;
};

const SHOWCASES: readonly ShowcaseAssetSet[] = [
  {
    osuPath: 'endless-fear.osu',
    audioPath: 'audio.mp3',
    backgroundPath: 'BG.jpg',
    videoPath: null
  },
  {
    osuPath: 'sola-imoutos-extra/imoutos-extra.osu',
    audioPath: 'sola-imoutos-extra/audio.mp3',
    backgroundPath: 'sola-imoutos-extra/bg.jpg',
    videoPath: 'sola-imoutos-extra/video.mp4'
  },
  {
    osuPath: 'everything-will-freeze/time-freeze.osu',
    audioPath: 'everything-will-freeze/audio.mp3',
    backgroundPath: 'everything-will-freeze/bg.jpg',
    videoPath: null
  }
];

const textDecoder = new TextDecoder();
const SHOWCASE_OSU_PATHS = new Set(SHOWCASES.map((showcase) => showcase.osuPath));

export const isShowcaseBeatmap = (beatmap: BeatmapManifestEntry | null, manifest: OszArchiveManifest | null): boolean =>
  manifest?.archiveId === SHOWCASE_ARCHIVE_ID && Boolean(beatmap && SHOWCASE_OSU_PATHS.has(beatmap.normalizedPath));

const assetRequests = new WeakMap<OszArchiveManifest, Map<string, Promise<void>>>();

export const ensureShowcaseAssets = async (manifest: OszArchiveManifest, beatmap: BeatmapManifestEntry): Promise<void> => {
  if (!isShowcaseBeatmap(beatmap, manifest)) {
    return;
  }
  let requests = assetRequests.get(manifest);
  if (!requests) {
    requests = new Map();
    assetRequests.set(manifest, requests);
  }
  const pending = requests;
  const paths = [beatmap.audioPath, beatmap.backgroundPath, beatmap.videoPath].filter((path): path is string => Boolean(path));
  await Promise.all(
    paths.map((path) => {
      if (manifest.entryBytes[path]) return;
      let request = pending.get(path);
      if (!request) {
        request = fetch(`${SHOWCASE_DIR}/${path}`)
          .then(bytesFromResponse)
          .then((bytes) => {
            manifest.entryBytes[path] = bytes;
          })
          .catch((error: unknown) => {
            pending.delete(path);
            throw error;
          });
        pending.set(path, request);
      }
      return request;
    })
  );
};

const bytesFromResponse = async (response: Response): Promise<Uint8Array> => {
  if (!response.ok) {
    throw new Error(`Showcase asset unavailable: ${response.url}`);
  }

  return new Uint8Array(await response.arrayBuffer());
};

export const loadShowcaseManifest = async (): Promise<OszArchiveManifest> => {
  const entryBytes: Record<string, Uint8Array> = {};
  const beatmaps: BeatmapManifestEntry[] = [];

  const osuFiles = await Promise.all(SHOWCASES.map((showcase) => fetch(`${SHOWCASE_DIR}/${showcase.osuPath}`).then(bytesFromResponse)));
  for (let index = 0; index < SHOWCASES.length; index += 1) {
    const showcase = SHOWCASES[index]!;
    const osuBytes = osuFiles[index]!;
    entryBytes[showcase.osuPath] = osuBytes;

    beatmaps.push({
      normalizedPath: showcase.osuPath,
      parsed: parseOsu(textDecoder.decode(osuBytes)),
      audioPath: showcase.audioPath,
      backgroundPath: showcase.backgroundPath,
      videoPath: showcase.videoPath,
      customSamplePaths: [],
      supported: true
    });
  }

  return {
    archiveId: SHOWCASE_ARCHIVE_ID,
    beatmaps,
    entryBytes
  };
};
