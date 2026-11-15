import { WebAudioEngine } from '@oszillator/audio-engine';
import type { OszArchiveManifest } from '@oszillator/osz-loader';

import { createObjectUrl } from './mime';

const waitForMediaReady = (media: HTMLMediaElement): Promise<void> =>
  new Promise((resolve, reject) => {
    const cleanup = (): void => {
      media.removeEventListener('canplay', handleReady);
      media.removeEventListener('loadedmetadata', handleReady);
      media.removeEventListener('error', handleError);
    };
    const handleReady = (): void => {
      cleanup();
      resolve();
    };
    const handleError = (): void => {
      cleanup();
      reject(new Error(media.error?.message || 'Media element failed to load audio'));
    };

    media.addEventListener('canplay', handleReady);
    media.addEventListener('loadedmetadata', handleReady);
    media.addEventListener('error', handleError);
    media.load();
  });

/**
 * Owns the single WebAudioEngine (and its AudioContext) for the page and the
 * blob URL of the audio file currently loaded into it. Loading the same
 * archive entry again only updates playback settings.
 */
export class AudioTrack {
  engine: WebAudioEngine | null = null;

  private manifest: OszArchiveManifest | null = null;

  private path: string | null = null;

  private objectUrl: string | null = null;

  /** Loads `path` from `manifest`. Throws if it is missing or cannot be decoded; the track is then empty. */
  async load(manifest: OszArchiveManifest, path: string, playbackRate: number, preservePitch: boolean): Promise<WebAudioEngine> {
    if (!this.engine || this.manifest !== manifest || this.path !== path) {
      await this.replace(manifest, path);
    }

    const engine = this.engine!;
    engine.setPlaybackRate(playbackRate);
    engine.setPreservePitch(preservePitch);
    return engine;
  }

  async unload(): Promise<void> {
    this.manifest = null;
    this.path = null;
    const engine = this.engine;
    this.engine = null;
    try {
      await engine?.destroy();
    } finally {
      this.revokeObjectUrl();
    }
  }

  private async replace(manifest: OszArchiveManifest, path: string): Promise<void> {
    const bytes = manifest.entryBytes[path];
    if (!bytes) {
      await this.unload();
      throw new Error(`Audio file not found: ${path}`);
    }

    const url = createObjectUrl(bytes, path);
    const element = new Audio(url);
    element.preload = 'auto';
    try {
      await waitForMediaReady(element);
      this.engine ??= new WebAudioEngine();
      this.engine.setMediaElement(element);
    } catch (error) {
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(url);
      await this.unload();
      throw new Error(`Audio unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }

    this.revokeObjectUrl();
    this.objectUrl = url;
    this.manifest = manifest;
    this.path = path;
  }

  private revokeObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
