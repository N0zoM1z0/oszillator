import { createArchiveManifestFromArrayBuffer } from '@oszillator/osz-loader';

self.onmessage = (event: MessageEvent<{ type: 'import-osz'; importId: string; buffer: ArrayBuffer }>) => {
  if (event.data.type !== 'import-osz') {
    return;
  }

  try {
    self.postMessage({ type: 'progress', importId: event.data.importId, phase: 'unzip', value: 0.25 });
    const manifest = createArchiveManifestFromArrayBuffer(event.data.buffer);
    self.postMessage({ type: 'manifest', importId: event.data.importId, manifest });
  } catch (error) {
    self.postMessage({
      type: 'error',
      importId: event.data.importId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
