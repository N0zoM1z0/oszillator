declare const millisecondsBrand: unique symbol;

export type Milliseconds = number & {
  readonly [millisecondsBrand]: 'Milliseconds';
};

export const ms = (value: number): Milliseconds => value as Milliseconds;

export const asNumberMs = (value: Milliseconds): number => value;

export const clampMs = (value: Milliseconds, minValue: Milliseconds, maxValue: Milliseconds): Milliseconds =>
  ms(Math.min(Math.max(asNumberMs(value), asNumberMs(minValue)), asNumberMs(maxValue)));

export const addMs = (left: Milliseconds, right: Milliseconds): Milliseconds =>
  ms(asNumberMs(left) + asNumberMs(right));

export const subtractMs = (left: Milliseconds, right: Milliseconds): Milliseconds =>
  ms(asNumberMs(left) - asNumberMs(right));
