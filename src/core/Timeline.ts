import type { TimelineCue } from './types';

/** Latest cue at or before time; input must already be validated and sorted. */
export function findActiveCueIndex(timeline: readonly TimelineCue[], time: number): number {
  if (!Number.isFinite(time) || time < 0) throw new RangeError('time must be finite and non-negative');
  let low = 0;
  let high = timeline.length;

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (timeline[middle]!.time <= time) low = middle + 1;
    else high = middle;
  }

  return low - 1;
}

export function findActiveCue(timeline: readonly TimelineCue[], time: number): TimelineCue | null {
  return timeline[findActiveCueIndex(timeline, time)] ?? null;
}
