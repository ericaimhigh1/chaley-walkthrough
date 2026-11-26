import { afterEach, expect, it, vi } from 'vitest';
import { Walkthrough } from '../../src/index';

afterEach(() => vi.unstubAllGlobals());

it('imports without browser globals but requires a browser to construct', () => {
  expect(typeof document).toBe('undefined');
  expect(() => new Walkthrough({ audio: '/tour.mp3', timeline: [] })).toThrow('only in a browser');
});

it('validates construction without creating media, DOM or trigger listeners', () => {
  vi.stubGlobal('document', {});
  expect(() => new Walkthrough({ audio: '/tour.mp3', timeline: [] })).not.toThrow();
  expect(() => new Walkthrough({ audio: '', timeline: [] })).toThrow('config.audio');
});
