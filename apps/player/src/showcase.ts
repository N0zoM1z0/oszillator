import { parseOsu } from '@oszillator/osu-parser';
import type { BeatmapManifestEntry, OszArchiveManifest } from '@oszillator/osz-loader';

const SHOWCASE_DIR = `${import.meta.env.BASE_URL}showcase`;

type ShowcaseAssetSet = {
  archiveId: string;
  osuPath: string;
  audioPath: string;
  backgroundPath: string;
  videoPath: string | null;
};

const SHOWCASES: readonly ShowcaseAssetSet[] = [
  {
    archiveId: 'bundled-make-a-move-endless-fear',
    osuPath: 'endless-fear.osu',
    audioPath: 'audio.mp3',
    backgroundPath: 'BG.jpg',
    videoPath: null
  },
  {
    archiveId: 'bundled-sola-imoutos-extra',
    osuPath: 'sola-imoutos-extra/imoutos-extra.osu',
    audioPath: 'sola-imoutos-extra/audio.mp3',
    backgroundPath: 'sola-imoutos-extra/bg.jpg',
    videoPath: 'sola-imoutos-extra/video.mp4'
  },
  {
    archiveId: 'bundled-everything-will-freeze-time-freeze',
    osuPath: 'everything-will-freeze/time-freeze.osu',
    audioPath: 'everything-will-freeze/audio.mp3',
    backgroundPath: 'everything-will-freeze/bg.jpg',
    videoPath: null
  }
];

const SHOWCASE_OSU_PATHS = new Set(SHOWCASES.map((showcase) => showcase.osuPath));

export const isShowcaseBeatmap = (beatmap: BeatmapManifestEntry | null, manifest: OszArchiveManifest | null): boolean =>
  manifest?.archiveId === 'bundled-showcases' && Boolean(beatmap && SHOWCASE_OSU_PATHS.has(beatmap.normalizedPath));

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
            manifest.files.push({
              path,
              normalizedPath: path,
              size: bytes.byteLength,
              extension: extensionForPath(path)
            });
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

const extensionForPath = (path: string): string => {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot).toLowerCase();
};

export const loadShowcaseManifest = async (): Promise<OszArchiveManifest> => {
  const entryBytes: Record<string, Uint8Array> = {};
  const beatmaps: BeatmapManifestEntry[] = [];
  const audioCandidates: string[] = [];
  const imageCandidates: string[] = [];
  const videoCandidates: string[] = [];

  const osuFiles = await Promise.all(SHOWCASES.map((showcase) => fetch(`${SHOWCASE_DIR}/${showcase.osuPath}`).then(bytesFromResponse)));
  for (let index = 0; index < SHOWCASES.length; index += 1) {
    const showcase = SHOWCASES[index]!;
    const osuBytes = osuFiles[index]!;
    entryBytes[showcase.osuPath] = osuBytes;

    beatmaps.push({
      filePath: showcase.osuPath,
      normalizedPath: showcase.osuPath,
      parsed: parseOsu(new TextDecoder().decode(osuBytes)),
      audioPath: showcase.audioPath,
      backgroundPath: showcase.backgroundPath,
      videoPath: showcase.videoPath,
      customSamplePaths: [],
      supported: true
    });
    audioCandidates.push(showcase.audioPath);
    imageCandidates.push(showcase.backgroundPath);
    if (showcase.videoPath) {
      videoCandidates.push(showcase.videoPath);
    }
  }

  const files = Object.entries(entryBytes).map(([path, bytes]) => ({
    path,
    normalizedPath: path,
    size: bytes.byteLength,
    extension: extensionForPath(path)
  }));

  return {
    archiveId: 'bundled-showcases',
    files,
    beatmaps,
    assets: {
      audioCandidates,
      imageCandidates,
      videoCandidates,
      hitsoundCandidates: []
    },
    entryBytes
  };
};
