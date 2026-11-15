import { archiveTransferBuffers, createArchiveManifestFromArrayBuffer, type OszArchiveManifest } from '@oszillator/osz-loader';

export type ImportWorkerRequest = { type: 'import-osz'; buffer: ArrayBuffer };

export type ImportWorkerResponse =
  | { type: 'progress'; phase: string }
  | { type: 'manifest'; manifest: OszArchiveManifest }
  | { type: 'error'; error: string };

const respond = (message: ImportWorkerResponse, transfer: Transferable[] = []): void => {
  self.postMessage(message, { transfer });
};

self.onmessage = (event: MessageEvent<ImportWorkerRequest>) => {
  if (event.data.type !== 'import-osz') {
    return;
  }

  try {
    respond({ type: 'progress', phase: 'unzip' });
    const manifest = createArchiveManifestFromArrayBuffer(event.data.buffer);
    respond({ type: 'manifest', manifest }, archiveTransferBuffers(manifest));
  } catch (error) {
    respond({ type: 'error', error: error instanceof Error ? error.message : String(error) });
  }
};
