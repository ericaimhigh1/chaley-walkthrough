import type { NormalizedWalkthroughConfig, TimelineCue } from './types';

function fail(path: string, message: string): never {
  throw new TypeError(`${path}: ${message}`);
}

function object(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(path, 'expected an object');
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!keys.includes(key)) fail(`${path}.${key}`, 'unknown field');
  }
  return record;
}

function number(value: unknown, path: string, positive = false): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || (positive ? value <= 0 : value < 0)) {
    fail(path, `expected a finite ${positive ? 'positive' : 'non-negative'} number`);
  }
}

function string(value: unknown, path: string): void {
  if (typeof value !== 'string' || !value.trim()) fail(path, 'expected a non-empty string');
}

function id(value: unknown, path: string): void {
  // ID references are literal IDs, not CSS selectors. HTML forbids ASCII whitespace in IDs.
  if (typeof value !== 'string' || !/^#[^\t\n\f\r ]+$/.test(value)) {
    fail(path, 'expected # followed by a non-empty HTML ID without ASCII whitespace');
  }
}

const optionKeys = ['scroll', 'effect', 'transition', 'transitionDuration'] as const;

function options(value: Record<string, unknown>, path: string): void {
  if (value.scroll !== undefined && typeof value.scroll !== 'boolean') fail(`${path}.scroll`, 'expected a boolean');
  if (value.effect !== undefined && !['ripple', 'spotlight', 'none'].includes(value.effect as string)) {
    fail(`${path}.effect`, 'expected ripple, spotlight or none');
  }
  if (value.transition !== undefined && !['move', 'instant'].includes(value.transition as string)) {
    fail(`${path}.transition`, 'expected move or instant');
  }
  if (value.transitionDuration !== undefined) number(value.transitionDuration, `${path}.transitionDuration`);
}

/** Validate untrusted configuration and return an owned, deeply frozen snapshot. No DOM access. */
export function validateConfig(input: unknown): NormalizedWalkthroughConfig {
  const config = object(input, 'config', ['audio', 'timeline', 'trigger', 'allowActions', 'theme', 'defaults', 'player']);
  string(config.audio, 'config.audio');
  if (config.trigger !== undefined) id(config.trigger, 'config.trigger');
  if (config.allowActions !== undefined && typeof config.allowActions !== 'boolean') fail('config.allowActions', 'expected a boolean');
  const player = config.player === undefined ? {} : object(config.player, 'config.player', ['position', 'captions']);
  if (player.position !== undefined && !['bottom-right', 'bottom-left', 'top-right', 'top-left'].includes(player.position as string)) fail('config.player.position', 'expected a corner position');
  if (player.captions !== undefined && typeof player.captions !== 'boolean') fail('config.player.captions', 'expected a boolean');
  const defaults = config.defaults === undefined ? {} : object(config.defaults, 'config.defaults', optionKeys);
  options(defaults, 'config.defaults');
  const theme = config.theme === undefined ? {} : object(config.theme, 'config.theme', ['overlayOpacity', 'highlightColor', 'padding', 'borderRadius']);
  for (const key of ['overlayOpacity', 'padding', 'borderRadius']) {
    if (theme[key] !== undefined) number(theme[key], `config.theme.${key}`);
  }
  if (typeof theme.overlayOpacity === 'number' && theme.overlayOpacity > 1) fail('config.theme.overlayOpacity', 'must be between 0 and 1');
  if (theme.highlightColor !== undefined) string(theme.highlightColor, 'config.theme.highlightColor');
  if (!Array.isArray(config.timeline)) fail('config.timeline', 'expected an array');
  let previous = -1;
  const timeline: TimelineCue[] = [];
  // A loop also validates sparse array slots instead of silently skipping them.
  for (let index = 0; index < config.timeline.length; index++) {
    const path = `config.timeline[${index}]`;
    const cue = object(config.timeline[index], path, ['time', 'target', 'caption', 'action', ...optionKeys]);
    number(cue.time, `${path}.time`);
    if ((cue.time as number) <= previous) fail(`${path}.time`, 'timestamps must be strictly increasing');
    previous = cue.time as number;
    if (cue.target !== null) id(cue.target, `${path}.target`);
    if (cue.caption !== undefined && typeof cue.caption !== 'string') fail(`${path}.caption`, 'expected a string');
    options(cue, path);
    let action;
    if (cue.action !== undefined) {
      if (cue.target === null) fail(`${path}.action`, 'requires a target');
      if (cue.action === null || typeof cue.action !== 'object' || Array.isArray(cue.action)) {
        fail(`${path}.action`, 'expected { type: "click" } or { type: "longpress", holdDuration: 800 }; omit action for a highlight-only cue');
      }
      const descriptor = object(cue.action, `${path}.action`, ['type', 'holdDuration']);
      if (descriptor.type === 'longpress') number(descriptor.holdDuration, `${path}.action.holdDuration`, true);
      else if (descriptor.type === 'click') {
        if ('holdDuration' in descriptor) fail(`${path}.action.holdDuration`, 'only valid for longpress');
      } else fail(`${path}.action.type`, 'expected click or longpress');
      action = Object.freeze({ ...descriptor });
    }
    timeline.push(Object.freeze({ ...cue, ...(action ? { action } : {}) }) as unknown as TimelineCue);
  }
  return Object.freeze({
    audio: config.audio,
    ...(config.trigger !== undefined ? { trigger: config.trigger } : {}),
    allowActions: config.allowActions ?? timeline.some(cue => cue.action !== undefined),
    player: Object.freeze({ position: player.position ?? 'bottom-right', captions: player.captions ?? true }),
    defaults: Object.freeze({ scroll: defaults.scroll ?? true, effect: defaults.effect ?? 'ripple', transition: defaults.transition ?? 'move', transitionDuration: defaults.transitionDuration ?? 400 }),
    theme: Object.freeze({ overlayOpacity: theme.overlayOpacity ?? 0.1, highlightColor: theme.highlightColor ?? '#0039a3', padding: theme.padding ?? 6, borderRadius: theme.borderRadius ?? 8 }),
    timeline: Object.freeze(timeline),
  }) as NormalizedWalkthroughConfig;
}
