import type { OszArchiveManifest } from '@oszillator/osz-loader';

import type { ImportWorkerRequest, ImportWorkerResponse } from './workers/import-worker';

let activeWorker: Worker | null = null;

/**
 * Unzips and parses a local .osz archive in a worker. Starting a new import
 * terminates any import still in flight, whose promise then never settles.
 */
export const importOszFile = async (file: File, onPhase: (phase: string) => void): Promise<OszArchiveManifest> => {
  activeWorker?.terminate();
  const worker = new Worker(new URL('./workers/import-worker.ts', import.meta.url), { type: 'module' });
  activeWorker = worker;

  const buffer = await file.arrayBuffer();
  return new Promise<OszArchiveManifest>((resolve, reject) => {
    const finish = (): void => {
      worker.terminate();
      if (activeWorker === worker) activeWorker = null;
    };

    worker.onmessage = (event: MessageEvent<ImportWorkerResponse>) => {
      const message = event.data;
      if (message.type === 'progress') {
        onPhase(message.phase);
        return;
      }
      finish();
      if (message.type === 'manifest') {
        resolve(message.manifest);
      } else {
        reject(new Error(message.error));
      }
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || 'Import worker failed'));
    };

    const request: ImportWorkerRequest = { type: 'import-osz', buffer };
    worker.postMessage(request, [buffer]);
  });
};
