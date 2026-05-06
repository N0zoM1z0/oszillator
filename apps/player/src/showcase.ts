import { parseOsu } from '@oszillator/osu-parser';
import type { BeatmapManifestEntry, OszArchiveManifest } from '@oszillator/osz-loader';

const SHOWCASE_DIR = `${import.meta.env.BASE_URL}showcase`;
const SHOWCASE_OSU_PATH = 'endless-fear.osu';
const SHOWCASE_AUDIO_PATH = 'audio.mp3';
const SHOWCASE_BACKGROUND_PATH = 'BG.jpg';

export const isShowcaseBeatmap = (beatmap: BeatmapManifestEntry | null): boolean => beatmap?.normalizedPath === SHOWCASE_OSU_PATH;

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
  const [osuBytes, audioBytes, backgroundBytes] = await Promise.all([
    fetch(`${SHOWCASE_DIR}/${SHOWCASE_OSU_PATH}`).then(bytesFromResponse),
    fetch(`${SHOWCASE_DIR}/${SHOWCASE_AUDIO_PATH}`).then(bytesFromResponse),
    fetch(`${SHOWCASE_DIR}/${SHOWCASE_BACKGROUND_PATH}`).then(bytesFromResponse)
  ]);
  const parsed = parseOsu(new TextDecoder().decode(osuBytes));
  const beatmap: BeatmapManifestEntry = {
    filePath: SHOWCASE_OSU_PATH,
    normalizedPath: SHOWCASE_OSU_PATH,
    parsed,
    audioPath: SHOWCASE_AUDIO_PATH,
    backgroundPath: SHOWCASE_BACKGROUND_PATH,
    videoPath: null,
    customSamplePaths: [],
    supported: true
  };

  const entryBytes: Record<string, Uint8Array> = {
    [SHOWCASE_OSU_PATH]: osuBytes,
    [SHOWCASE_AUDIO_PATH]: audioBytes,
    [SHOWCASE_BACKGROUND_PATH]: backgroundBytes
  };

  return {
    archiveId: 'bundled-make-a-move-endless-fear',
    files: [SHOWCASE_OSU_PATH, SHOWCASE_AUDIO_PATH, SHOWCASE_BACKGROUND_PATH].map((path) => ({
      path,
      normalizedPath: path,
      size: entryBytes[path]?.byteLength ?? 0,
      extension: extensionForPath(path)
    })),
    beatmaps: [beatmap],
    assets: {
      audioCandidates: [SHOWCASE_AUDIO_PATH],
      imageCandidates: [SHOWCASE_BACKGROUND_PATH],
      videoCandidates: [],
      hitsoundCandidates: []
    },
    entryBytes
  };
};
