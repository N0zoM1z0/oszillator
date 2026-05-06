export type TimeRange = {
  startIndex: number;
  endIndex: number;
};

export const lowerBound = <T>(items: readonly T[], target: number, selector: (item: T) => number): number => {
  let low = 0;
  let high = items.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (selector(items[middle] as T) < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
};

export const upperBound = <T>(items: readonly T[], target: number, selector: (item: T) => number): number => {
  let low = 0;
  let high = items.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (selector(items[middle] as T) <= target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
};

export const queryVisibleTimeRange = <T>(
  items: readonly T[],
  startTimeMs: number,
  endTimeMs: number,
  selector: (item: T) => number
): TimeRange => ({
  startIndex: lowerBound(items, startTimeMs, selector),
  endIndex: upperBound(items, endTimeMs, selector)
});
