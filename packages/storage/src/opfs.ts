export const isOpfsAvailable = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
