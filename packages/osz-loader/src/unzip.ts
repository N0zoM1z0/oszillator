import { unzipSync } from 'fflate';

import { normalizeArchivePath } from './asset-resolver';

export type ArchiveEntry = {
  path: string;
  normalizedPath: string;
  bytes: Uint8Array;
};

export const unzipOszArchive = (source: ArrayBuffer | Uint8Array): ArchiveEntry[] => {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const archive = unzipSync(bytes);

  return Object.entries(archive).map(([path, entryBytes]) => ({
    path,
    normalizedPath: normalizeArchivePath(path),
    bytes: entryBytes
  }));
};
