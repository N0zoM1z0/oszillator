import type { AudioOffsetSettings } from './offset';

export type AudioClockSnapshot = {
  contextTimeSeconds: number;
  playbackStartContextTimeSeconds: number;
  playbackStartBeatmapMs: number;
  playbackRate?: number;
};

export const mapAudioContextTimeToGameTimeMs = (
  snapshot: AudioClockSnapshot,
  offsets: AudioOffsetSettings
): number =>
  snapshot.playbackStartBeatmapMs +
  (snapshot.contextTimeSeconds - snapshot.playbackStartContextTimeSeconds) * 1000 * (snapshot.playbackRate ?? 1) +
  offsets.globalOffsetMs;
