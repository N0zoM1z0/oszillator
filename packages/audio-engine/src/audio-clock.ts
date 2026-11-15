export type AudioClockSnapshot = {
  contextTimeSeconds: number;
  playbackStartContextTimeSeconds: number;
  playbackStartBeatmapMs: number;
  playbackRate?: number;
};

/** Maps AudioContext time to beatmap time, scaled by the playback rate. */
export const mapAudioContextTimeToGameTimeMs = (snapshot: AudioClockSnapshot): number =>
  snapshot.playbackStartBeatmapMs +
  (snapshot.contextTimeSeconds - snapshot.playbackStartContextTimeSeconds) * 1000 * (snapshot.playbackRate ?? 1);
