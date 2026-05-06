export type ParseWarning = {
  code: string;
  message: string;
  line?: number;
};

export const createParseWarning = (code: string, message: string, line?: number): ParseWarning => {
  if (line === undefined) {
    return { code, message };
  }

  return { code, message, line };
};
