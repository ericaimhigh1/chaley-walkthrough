import { expect, it, vi } from 'vitest';
import { claimPlayback, releasePlayback, claimTrigger } from '../../src/core/PlaybackCoordinator';
it('stops the previous owner and leaves unrelated documents alone', () => {
  const doc = {} as Document, other = {} as Document;
  const a = { stop: vi.fn() }, b = { stop: vi.fn() }, c = { stop: vi.fn() };
  expect(claimPlayback(doc, a)).toBe(true);
  claimPlayback(other, c);
  expect(claimPlayback(doc, b)).toBe(true);
  expect(a.stop).toHaveBeenCalledOnce(); expect(c.stop).not.toHaveBeenCalled();
  releasePlayback(doc, a);
  claimPlayback(doc, c);
  expect(b.stop).toHaveBeenCalledOnce();
});
it('latest reentrant request wins and stale starts are rejected', () => {
  const doc = {} as Document;
  const b = { stop: vi.fn() }, c = { stop: vi.fn() };
  const a = { stop: () => { claimPlayback(doc, c); } };
  claimPlayback(doc, a);
  expect(claimPlayback(doc, b)).toBe(false);
  expect(b.stop).toHaveBeenCalledOnce();
  expect(claimPlayback(doc, c)).toBe(true);
  expect(c.stop).not.toHaveBeenCalled();
});
it('trigger reservations release only their own assignment', () => {
  const doc = {} as Document, a = { stop() {} }, b = { stop() {} };
  const release = claimTrigger(doc, '#start', a)!;
  expect(claimTrigger(doc, '#start', b)).toBeNull(); release();
  expect(claimTrigger(doc, '#start', b)).not.toBeNull(); release();
  expect(claimTrigger(doc, '#start', a)).toBeNull();
});
