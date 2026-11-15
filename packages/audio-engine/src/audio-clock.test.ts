import { describe, expect, it } from 'vitest';

import { mapAudioContextTimeToGameTimeMs } from './audio-clock';

describe('audio clock mapping', () => {
  it('maps audio context time to beatmap time', () => {
    expect(
      mapAudioContextTimeToGameTimeMs({
        contextTimeSeconds: 12.5,
        playbackStartContextTimeSeconds: 10,
        playbackStartBeatmapMs: 1000
      })
    ).toBe(3500);
  });

  it('maps sped-up playback to accelerated beatmap time', () => {
    expect(
      mapAudioContextTimeToGameTimeMs({
        contextTimeSeconds: 12,
        playbackStartContextTimeSeconds: 10,
        playbackStartBeatmapMs: 1000,
        playbackRate: 1.5
      })
    ).toBe(4000);
  });
});
