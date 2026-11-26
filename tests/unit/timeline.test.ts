import { describe, expect, it } from 'vitest';
import { findActiveCue, findActiveCueIndex } from '../../src/core/Timeline';
import type { TimelineCue } from '../../src/core/types';

const cues: readonly TimelineCue[] = [
  { time: 1, target: '#one' }, { time: 2.5, target: '#two' },
  { time: 4, target: null }, { time: 8, target: '#four' },
];

describe('timeline lookup', () => {
  it.each([[0, -1], [1, 0], [2.4999, 0], [2.5, 1], [4, 2], [7.9, 2], [8, 3], [999, 3]])('selects cue at %s seconds', (time, index) => {
    expect(findActiveCueIndex(cues, time)).toBe(index);
    expect(findActiveCue(cues, time)).toBe(cues[index] ?? null);
  });
  it('handles empty timelines and a zero-time first cue', () => {
    expect(findActiveCue([], 0)).toBeNull();
    expect(findActiveCueIndex([{ time: 0, target: null }], 0)).toBe(0);
  });
  it('is stateless across backward and forward seeks', () => {
    expect([8, 1, 4, 0, 2.5].map(time => findActiveCueIndex(cues, time))).toEqual([3, 0, 2, -1, 1]);
  });
  it.each([-1, NaN, Infinity, -Infinity])('rejects invalid clock %s', (time) => {
    expect(() => findActiveCue(cues, time)).toThrow(RangeError);
  });
  it('matches a linear reference across a large timeline', () => {
    const timeline = Array.from({ length: 4096 }, (_, i) => ({ time: i * 0.25, target: null }));
    for (let time = 0; time < 1030; time += 0.37) {
      const expected = timeline.filter(cue => cue.time <= time).length - 1;
      expect(findActiveCueIndex(timeline, time)).toBe(expected);
    }
  });
});
