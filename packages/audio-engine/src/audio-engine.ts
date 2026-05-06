import { mapAudioContextTimeToGameTimeMs } from './audio-clock';
import { HitsoundPlayer, type HitsoundKind } from './hitsound-player';
import { DEFAULT_AUDIO_OFFSET_SETTINGS, type AudioOffsetSettings } from './offset';

export type AudioEngineState = 'idle' | 'ready' | 'playing' | 'paused' | 'stopped';

export type AudioEngineOptions = {
  audioContext?: AudioContext;
  offsets?: AudioOffsetSettings;
};

export class WebAudioEngine {
  private readonly context: AudioContext;

  private readonly offsets: AudioOffsetSettings;

  private readonly hitsounds: HitsoundPlayer;

  private readonly ownsContext: boolean;

  private buffer: AudioBuffer | null = null;

  private source: AudioBufferSourceNode | null = null;

  private state: AudioEngineState = 'idle';

  private playbackStartContextTimeSeconds = 0;

  private playbackStartBeatmapMs = 0;

  private pausedAtMs = 0;

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
    this.stopSource();
    this.buffer = buffer;
    this.state = 'ready';
    this.pausedAtMs = 0;
  }

  play(startTimeMs = 0): void {
    if (!this.buffer) {
      throw new Error('Cannot play without an AudioBuffer');
    }

    this.stopSource();
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
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

    this.pausedAtMs = timeMs;
    this.playbackStartBeatmapMs = timeMs;
  }

  stop(): void {
    this.stopSource();
    this.pausedAtMs = 0;
    this.playbackStartBeatmapMs = 0;
    this.state = this.buffer ? 'ready' : 'stopped';
  }

  async destroy(): Promise<void> {
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
          playbackStartContextTimeSeconds: this.playbackStartContextTimeSeconds
        },
        this.offsets
      );
    }

    return this.pausedAtMs + this.offsets.globalOffsetMs;
  }

  getState(): AudioEngineState {
    return this.state;
  }

  playHitsound(kind: HitsoundKind = 'normal'): void {
    this.hitsounds.play(kind);
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
