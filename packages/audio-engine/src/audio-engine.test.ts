import { describe, expect, it, vi } from 'vitest';

import { WebAudioEngine } from './audio-engine';

const mockMedia = () => ({
  pause: vi.fn(),
  play: vi.fn(async () => undefined),
  load: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  removeAttribute: vi.fn(),
  currentTime: 0,
  playbackRate: 1,
  preservesPitch: true
});

describe('audio resource reuse', () => {
  it('resets a loaded element without rebuilding its Web Audio source or closing the shared context', async () => {
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const context = {
      currentTime: 10,
      state: 'running',
      destination: {},
      createMediaElementSource: vi.fn(() => source),
      close: vi.fn()
    };
    const engine = new WebAudioEngine({
      audioContext: context as unknown as AudioContext
    });
    const first = mockMedia();
    engine.setMediaElement(first as unknown as HTMLMediaElement);
    engine.play(1000);
    context.currentTime = 12;
    expect(engine.getGameTimeMs()).toBe(3000);
    engine.stop();
    expect(engine.getState()).toBe('ready');
    expect(engine.getGameTimeMs()).toBe(0);
    expect(first.currentTime).toBe(0);
    engine.setPlaybackRate(1.5);
    engine.setPreservePitch(false);
    expect(first.playbackRate).toBe(1.5);
    expect(first.preservesPitch).toBe(false);
    engine.play();
    context.currentTime = 14;
    expect(engine.getGameTimeMs()).toBe(3000);
    expect(context.createMediaElementSource).toHaveBeenCalledTimes(1);
    expect(context.close).not.toHaveBeenCalled();

    const second = mockMedia();
    engine.setMediaElement(second as unknown as HTMLMediaElement);
    expect(first.removeAttribute).toHaveBeenCalledWith('src');
    expect(first.load).toHaveBeenCalledOnce();
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(engine.getState()).toBe('ready');
    await engine.destroy();
    expect(second.removeAttribute).toHaveBeenCalledWith('src');
    expect(source.disconnect).toHaveBeenCalledTimes(2);
    expect(context.close).not.toHaveBeenCalled();
  });
});
