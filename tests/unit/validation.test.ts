import { describe, expect, it } from 'vitest';
import { validateConfig } from '../../src/core/validation';

const valid = () => ({ audio: '/tour.mp3', timeline: [{ time: 0, target: '#wallet' }] });

describe('configuration validation', () => {
  it('supplies documented defaults and supports an empty timeline', () => {
    const result = validateConfig({ audio: '/tour.mp3', timeline: [] });
    expect(result.allowActions).toBe(false);
    expect(result.defaults).toEqual({ scroll: true, effect: 'ripple', transition: 'move', transitionDuration: 400 });
    expect(result.theme).toEqual({ overlayOpacity: 0.1, highlightColor: '#0039a3', padding: 6, borderRadius: 8 });
    expect(result.timeline).toEqual([]);
  });

  it('preserves captions as text and accepts literal IDs and fractional timestamps', () => {
    const result = validateConfig({
      ...valid(), trigger: '#start:tour', timeline: [
        { time: 0.25, target: '#123:a.b', caption: '<strong>Not HTML</strong>', effect: 'none', scroll: false, transitionDuration: 0 },
        { time: 2, target: null },
      ]
    });
    expect(result.timeline[0]?.caption).toBe('<strong>Not HTML</strong>');
    expect(result.timeline[1]?.target).toBeNull();
  });

  it.each([null, [], {}, { audio: '', timeline: [] }, { audio: 1, timeline: [] }, { audio: 'x' }])('rejects invalid required configuration: %j', (input) => {
    expect(() => validateConfig(input)).toThrow(TypeError);
  });

  it.each([-1, NaN, Infinity, -Infinity, '1', null])('rejects invalid timestamp %s', (time) => {
    expect(() => validateConfig({ ...valid(), timeline: [{ time, target: null }] })).toThrow('timeline[0].time');
  });

  it.each([[1, 1], [2, 1]])('rejects duplicate or descending timestamps %j', (a, b) => {
    expect(() => validateConfig({ ...valid(), timeline: [{ time: a, target: null }, { time: b, target: null }] })).toThrow('strictly increasing');
  });

  it.each(['wallet', '#', '#has space', '#has\ttab', 4, undefined])('rejects invalid target %s', (target) => {
    expect(() => validateConfig({ ...valid(), timeline: [{ time: 0, target }] })).toThrow('target');
  });

  it.each([
    { trigger: null }, { trigger: '.button' }, { allowActions: 'true' },
    { defaults: { effect: 'flash' } }, { defaults: { transition: 'slide' } },
    { defaults: { transitionDuration: -1 } }, { defaults: { scroll: 1 } },
    { theme: { overlayOpacity: 1.01 } }, { theme: { overlayOpacity: -0.1 } },
    { theme: { padding: Infinity } }, { theme: { borderRadius: -1 } },
    { theme: { highlightColor: '' } }, { defaults: null }, { theme: [] },
    { typo: true }, { defaults: { typo: 1 } }, { theme: { typo: 1 } },
  ])('rejects invalid option %j', (override) => {
    expect(() => validateConfig({ ...valid(), ...override })).toThrow(TypeError);
  });

  it.each([
    { type: 'unknown' }, { type: 'longpress' }, { type: 'longpress', holdDuration: 0 },
    { type: 'longpress', holdDuration: Infinity }, { type: 'click', holdDuration: 20 },
    { type: 'click', run: () => { } },
  ])('rejects invalid action %j even when actions are disabled', (action) => {
    expect(() => validateConfig({ ...valid(), timeline: [{ time: 0, target: '#wallet', action }] })).toThrow('action');
  });

  it('rejects actions without targets, invalid captions and sparse timelines', () => {
    expect(() => validateConfig({ ...valid(), timeline: [{ time: 0, target: null, action: { type: 'click' } }] })).toThrow('requires a target');
    expect(() => validateConfig({ ...valid(), timeline: [{ time: 0, target: null, caption: () => 'x' }] })).toThrow('caption');
    expect(() => validateConfig({ ...valid(), timeline: Array(1) })).toThrow('timeline[0]');
  });

  it.each(['click', 'longpress', null, false, 1, [], () => { }])('explains the expected action descriptor for %s', action => {
    expect(() => validateConfig({ ...valid(), timeline: [{ time: 0, target: '#wallet', action }] }))
      .toThrow('config.timeline[0].action: expected { type: "click" } or { type: "longpress", holdDuration: 800 }; omit action for a highlight-only cue');
  });

  it('treats developer-authored actions as opt-in', () => {
    const result = validateConfig({
      ...valid(), theme: { overlayOpacity: 1, padding: 0, borderRadius: 0 }, timeline: [
        { time: 0, target: '#wallet', action: { type: 'click' } },
        { time: 1, target: '#wallet', action: { type: 'longpress', holdDuration: 800 } },
      ]
    });
    expect(result.allowActions).toBe(true);
    expect(result.timeline[1]?.action).toEqual({ type: 'longpress', holdDuration: 800 });
  });

  it('owns immutable copies without freezing caller objects', () => {
    const input = {
      ...valid(), defaults: { scroll: false }, theme: { padding: 0 }, timeline: [
        { time: 0, target: '#wallet', action: { type: 'longpress', holdDuration: 800 } },
      ]
    };
    const result = validateConfig(input);
    input.timeline[0]!.action.holdDuration = 99;
    input.theme.padding = 10;
    expect(result.timeline[0]?.action).toEqual({ type: 'longpress', holdDuration: 800 });
    expect(result.theme.padding).toBe(0);
    for (const value of [result, result.timeline, result.timeline[0], result.timeline[0]?.action, result.theme, result.defaults]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(Object.isFrozen(input)).toBe(false);
  });
});

it('validates and copies player settings', () => {
  expect(validateConfig({ ...valid(), player: { position: 'top-left', captions: false } }).player).toEqual({ position: 'top-left', captions: false });
  expect(() => validateConfig({ ...valid(), player: { position: 'middle' } })).toThrow('player.position');
  expect(() => validateConfig({ ...valid(), player: { captions: 'yes' } })).toThrow('player.captions');
});
