import type { AudioOffsetSettings } from './offset';

export type AudioClockSnapshot = {
  contextTimeSeconds: number;
  playbackStartContextTimeSeconds: number;
  playbackStartBeatmapMs: number;
};

export const mapAudioContextTimeToGameTimeMs = (
  snapshot: AudioClockSnapshot,
  offsets: AudioOffsetSettings
): number =>
  snapshot.playbackStartBeatmapMs +
  (snapshot.contextTimeSeconds - snapshot.playbackStartContextTimeSeconds) * 1000 +
  offsets.globalOffsetMs;
