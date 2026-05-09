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

export const isShowcaseBeatmap = (beatmap: BeatmapManifestEntry | null): boolean =>
  beatmap ? SHOWCASE_OSU_PATHS.has(beatmap.normalizedPath) : false;

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

  for (const showcase of SHOWCASES) {
    const paths = [showcase.osuPath, showcase.audioPath, showcase.backgroundPath, showcase.videoPath].filter((path): path is string =>
      Boolean(path)
    );
    const fetched = await Promise.all(paths.map((path) => fetch(`${SHOWCASE_DIR}/${path}`).then(bytesFromResponse)));
    paths.forEach((path, index) => {
      entryBytes[path] = fetched[index]!;
    });

    const osuBytes = entryBytes[showcase.osuPath];
    if (!osuBytes) {
      throw new Error(`Showcase beatmap unavailable: ${showcase.osuPath}`);
    }

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
