import { mapAudioContextTimeToGameTimeMs } from './audio-clock';
import { HitsoundPlayer, type HitsoundKind } from './hitsound-player';
import { DEFAULT_AUDIO_OFFSET_SETTINGS, type AudioOffsetSettings } from './offset';

export type AudioEngineState = 'idle' | 'ready' | 'playing' | 'paused' | 'stopped';

export type AudioEngineOptions = {
  audioContext?: AudioContext;
  offsets?: AudioOffsetSettings;
};

type PitchPreservingMediaElement = HTMLMediaElement & {
  preservesPitch?: boolean;
  mozPreservesPitch?: boolean;
  webkitPreservesPitch?: boolean;
};

export class WebAudioEngine {
  private readonly context: AudioContext;

  private readonly offsets: AudioOffsetSettings;

  private readonly hitsounds: HitsoundPlayer;

  private readonly ownsContext: boolean;

  private buffer: AudioBuffer | null = null;

  private source: AudioBufferSourceNode | null = null;

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
      this.state = 'stopped';
    }
  };

  constructor(options: AudioEngineOptions = {}) {
    const AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!options.audioContext && !AudioContextCtor) {
      throw new Error('Web Audio API is unavailable');
    }

    this.context = options.audioContext ?? new AudioContextCtor();
    this.offsets = options.offsets ?? DEFAULT_AUDIO_OFFSET_SETTINGS;
    this.hitsounds = new HitsoundPlayer(this.context);
    this.ownsContext = !options.audioContext;
  }

  async unlock(): Promise<void> {
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  async load(buffer: ArrayBuffer): Promise<AudioBuffer> {
    return this.context.decodeAudioData(buffer.slice(0));
  }

  setBuffer(buffer: AudioBuffer): void {
    this.disconnectMediaElement();
    this.stopSource();
    this.buffer = buffer;
    this.state = 'ready';
    this.pausedAtMs = 0;
  }

  setMediaElement(element: HTMLMediaElement): void {
    this.stopSource();
    this.disconnectMediaElement();
    this.buffer = null;
    this.mediaElement = element;
    this.applyMediaPlaybackSettings();
    this.mediaSource = this.context.createMediaElementSource(element);
    this.mediaSource.connect(this.context.destination);
    element.addEventListener('ended', this.handleMediaEnded);
    this.state = 'ready';
    this.pausedAtMs = 0;
  }

  play(startTimeMs = 0): void {
    if (this.mediaElement) {
      this.stopSource();
      this.mediaElement.pause();
      this.mediaElement.currentTime = Math.max(startTimeMs, 0) / 1000;
      this.applyMediaPlaybackSettings();
      this.mediaElement.play().catch(() => {
        if (this.state === 'playing') {
          this.state = 'paused';
          this.pausedAtMs = startTimeMs;
        }
      });
      this.playbackStartContextTimeSeconds = this.context.currentTime;
      this.playbackStartBeatmapMs = startTimeMs;
      this.pausedAtMs = startTimeMs;
      this.state = 'playing';
      return;
    }

    if (!this.buffer) {
      throw new Error('Cannot play without an AudioBuffer');
    }

    this.stopSource();
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = this.playbackRate;
    source.connect(this.context.destination);
    source.start(0, Math.max(startTimeMs, 0) / 1000);
    source.onended = () => {
      if (this.state === 'playing') {
        this.state = 'stopped';
      }
    };

    this.source = source;
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
    if (this.mediaElement) {
      this.mediaElement.pause();
    }
    this.stopSource();
    this.state = 'paused';
  }

  resume(): void {
    if (this.state !== 'paused') {
      return;
    }

    this.play(this.pausedAtMs);
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
    this.stopSource();
    this.pausedAtMs = 0;
    this.playbackStartBeatmapMs = 0;
    this.state = this.buffer ? 'ready' : 'stopped';
  }

  async destroy(): Promise<void> {
    this.disconnectMediaElement();
    this.stopSource();
    this.buffer = null;
    this.state = 'stopped';

    if (this.ownsContext && this.context.state !== 'closed') {
      await this.context.close();
    }
  }

  getGameTimeMs(): number {
    if (this.state === 'playing') {
      return mapAudioContextTimeToGameTimeMs(
        {
          contextTimeSeconds: this.context.currentTime,
          playbackStartBeatmapMs: this.playbackStartBeatmapMs,
          playbackStartContextTimeSeconds: this.playbackStartContextTimeSeconds,
          playbackRate: this.playbackRate
        },
        this.offsets
      );
    }

    return this.pausedAtMs + this.offsets.globalOffsetMs;
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

    const restartAtMs = this.getGameTimeMs();
    this.playbackRate = nextRate;
    this.applyMediaPlaybackSettings();
    if (this.mediaElement) {
      this.playbackStartContextTimeSeconds = this.context.currentTime;
      this.playbackStartBeatmapMs = restartAtMs;
      this.pausedAtMs = restartAtMs;
      return;
    }
    if (this.source) {
      this.source.playbackRate.value = nextRate;
    }
    if (this.state === 'playing') {
      this.play(restartAtMs);
      return;
    }

    this.pausedAtMs = restartAtMs;
    this.playbackStartBeatmapMs = restartAtMs;
  }

  setPreservePitch(preservePitch: boolean): void {
    this.preservePitch = preservePitch;
    this.applyMediaPlaybackSettings();
  }

  playHitsound(kind: HitsoundKind = 'normal'): void {
    this.hitsounds.play(kind);
  }

  private applyMediaPlaybackSettings(): void {
    if (!this.mediaElement) {
      return;
    }

    this.mediaElement.playbackRate = this.playbackRate;
    this.mediaElement.preservesPitch = this.preservePitch;
    this.mediaElement.mozPreservesPitch = this.preservePitch;
    this.mediaElement.webkitPreservesPitch = this.preservePitch;
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

  private stopSource(): void {
    if (!this.source) {
      return;
    }

    this.source.onended = null;
    try {
      this.source.stop();
    } catch {
      // Source may have already ended; stopping is best-effort cleanup.
    }
    this.source.disconnect();
    this.source = null;
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }

  // Some Safari builds expose this constructor only on globalThis.
  var webkitAudioContext: typeof AudioContext | undefined;
}
