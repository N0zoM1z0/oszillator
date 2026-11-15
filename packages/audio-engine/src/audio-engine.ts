import { mapAudioContextTimeToGameTimeMs } from './audio-clock';
import { playHitsound } from './hitsound';

export type AudioEngineState = 'idle' | 'ready' | 'playing' | 'paused' | 'stopped';

export type AudioEngineOptions = {
  audioContext?: AudioContext;
};

type PitchPreservingMediaElement = HTMLMediaElement & {
  preservesPitch?: boolean;
  mozPreservesPitch?: boolean;
  webkitPreservesPitch?: boolean;
};

/**
 * Plays beatmap audio through an HTMLMediaElement routed into Web Audio.
 *
 * The AudioContext clock is the authoritative gameplay time source: game time
 * is derived from `context.currentTime` since playback started, never from
 * animation frame deltas or `media.currentTime`.
 */
export class WebAudioEngine {
  private readonly context: AudioContext;

  private readonly ownsContext: boolean;

  private mediaElement: PitchPreservingMediaElement | null = null;

  private mediaSource: MediaElementAudioSourceNode | null = null;

  private state: AudioEngineState = 'idle';

  private playbackStartContextTimeSeconds = 0;

  private playbackStartBeatmapMs = 0;

  private pausedAtMs = 0;

  private playbackRate = 1;

  private preservePitch = true;

  private readonly handleMediaEnded = (): void => {
    if (this.state === 'playing') {
      this.pausedAtMs = (this.mediaElement?.currentTime ?? 0) * 1000;
      this.playbackStartBeatmapMs = this.pausedAtMs;
      this.state = 'stopped';
    }
  };

  constructor(options: AudioEngineOptions = {}) {
    const AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!options.audioContext && !AudioContextCtor) {
      throw new Error('Web Audio API is unavailable');
    }

    this.context = options.audioContext ?? new AudioContextCtor();
    this.ownsContext = !options.audioContext;
  }

  async unlock(): Promise<void> {
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  setMediaElement(element: HTMLMediaElement): void {
    this.disconnectMediaElement();
    this.mediaElement = element;
    this.applyMediaPlaybackSettings();
    this.mediaSource = this.context.createMediaElementSource(element);
    this.mediaSource.connect(this.context.destination);
    element.addEventListener('ended', this.handleMediaEnded);
    this.state = 'ready';
    this.pausedAtMs = 0;
  }

  play(startTimeMs = 0): void {
    const media = this.mediaElement;
    if (!media) {
      throw new Error('Cannot play without a media element');
    }

    media.pause();
    media.currentTime = Math.max(startTimeMs, 0) / 1000;
    this.applyMediaPlaybackSettings();
    media.play().catch(() => {
      if (this.state === 'playing') {
        this.state = 'paused';
        this.pausedAtMs = startTimeMs;
      }
    });
    this.playbackStartContextTimeSeconds = this.context.currentTime;
    this.playbackStartBeatmapMs = startTimeMs;
    this.pausedAtMs = startTimeMs;
    this.state = 'playing';
  }

  pause(): void {
    if (this.state !== 'playing') {
      return;
    }

    this.pausedAtMs = this.getGameTimeMs();
    this.mediaElement?.pause();
    this.state = 'paused';
  }

  resume(): void {
    if (this.state === 'paused') {
      this.play(this.pausedAtMs);
    }
  }

  seek(timeMs: number): void {
    if (this.state === 'playing') {
      this.play(timeMs);
      return;
    }

    if (this.mediaElement) {
      this.mediaElement.currentTime = Math.max(timeMs, 0) / 1000;
    }
    this.pausedAtMs = timeMs;
    this.playbackStartBeatmapMs = timeMs;
  }

  stop(): void {
    if (this.mediaElement) {
      this.mediaElement.pause();
      this.mediaElement.currentTime = 0;
    }
    this.pausedAtMs = 0;
    this.playbackStartBeatmapMs = 0;
    this.state = this.mediaElement ? 'ready' : 'idle';
  }

  async destroy(): Promise<void> {
    this.disconnectMediaElement();
    this.state = 'idle';

    if (this.ownsContext && this.context.state !== 'closed') {
      await this.context.close();
    }
  }

  getGameTimeMs(): number {
    if (this.state !== 'playing') {
      return this.pausedAtMs;
    }

    return mapAudioContextTimeToGameTimeMs({
      contextTimeSeconds: this.context.currentTime,
      playbackStartBeatmapMs: this.playbackStartBeatmapMs,
      playbackStartContextTimeSeconds: this.playbackStartContextTimeSeconds,
      playbackRate: this.playbackRate
    });
  }

  getState(): AudioEngineState {
    return this.state;
  }

  getPlaybackRate(): number {
    return this.playbackRate;
  }

  getPreservePitch(): boolean {
    return this.preservePitch;
  }

  setPlaybackRate(rate: number): void {
    const nextRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
    if (nextRate === this.playbackRate) {
      return;
    }

    // Re-anchor the clock so time already played keeps its old rate.
    const anchorMs = this.getGameTimeMs();
    this.playbackRate = nextRate;
    this.applyMediaPlaybackSettings();
    this.playbackStartContextTimeSeconds = this.context.currentTime;
    this.playbackStartBeatmapMs = anchorMs;
    this.pausedAtMs = anchorMs;
  }

  setPreservePitch(preservePitch: boolean): void {
    this.preservePitch = preservePitch;
    this.applyMediaPlaybackSettings();
  }

  playHitsound(): void {
    playHitsound(this.context);
  }

  private applyMediaPlaybackSettings(): void {
    const media = this.mediaElement;
    if (!media) {
      return;
    }

    media.playbackRate = this.playbackRate;
    media.preservesPitch = this.preservePitch;
    media.mozPreservesPitch = this.preservePitch;
    media.webkitPreservesPitch = this.preservePitch;
  }

  private disconnectMediaElement(): void {
    if (this.mediaElement) {
      this.mediaElement.pause();
      this.mediaElement.removeEventListener('ended', this.handleMediaEnded);
      this.mediaElement.removeAttribute('src');
      this.mediaElement.load();
      this.mediaElement = null;
    }

    if (this.mediaSource) {
      this.mediaSource.disconnect();
      this.mediaSource = null;
    }
  }
}

declare global {
  // Some Safari builds expose this constructor only on globalThis.
  var webkitAudioContext: typeof AudioContext | undefined;
}
