import { describe, expect, it } from 'vitest';

import { mapAudioContextTimeToGameTimeMs } from './audio-clock';

describe('audio clock mapping', () => {
  it('maps audio context time to beatmap time with offset', () => {
    expect(
      mapAudioContextTimeToGameTimeMs(
        {
          contextTimeSeconds: 12.5,
          playbackStartContextTimeSeconds: 10,
          playbackStartBeatmapMs: 1000
        },
        { globalOffsetMs: -25 }
      )
    ).toBe(3475);
  });
});
