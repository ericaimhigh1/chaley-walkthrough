import { expect, it } from 'vitest';
import { validateConfig } from '../../src/core/validation';
it('runs developer-authored actions unless explicitly disabled', () => {
  const config = { audio: '/tour.mp3', timeline: [{ time: 0, target: '#link', action: { type: 'click' } }] };
  expect(validateConfig(config).allowActions).toBe(true);
  expect(validateConfig({ ...config, allowActions: false }).allowActions).toBe(false);
});
