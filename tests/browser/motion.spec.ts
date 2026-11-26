import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { WalkthroughConfig } from '../../src/core/types';

declare global {
  interface Window {
    motionClock: { time: number; paused: boolean };
    motionMetrics: { observed: number; frames: Set<number>; listeners: Set<{ target: EventTarget; type: string; listener: EventListenerOrEventListenerObject; capture: boolean }>; reads: number };
  }
}

const highlight = '.chaley-walkthrough-highlight';
const root = '.chaley-walkthrough-root';

test.beforeEach(async ({ page }) => {
  await page.route('http://motion.test/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/library.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync('dist/chaley-walkthrough.js') });
    if (path === '/style.css') return route.fulfill({ contentType: 'text/css', body: readFileSync('dist/style.css') });
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><link rel="stylesheet" href="/style.css">
      <style>body{margin:0;background:white;min-height:1800px}button{position:absolute;box-sizing:border-box}
      #first{left:80px;top:100px;width:160px;height:60px}#second{left:400px;top:240px;width:100px;height:80px}
      #third{left:650px;top:350px;width:180px;height:100px}
      #scroller{position:absolute;left:50px;top:500px;width:300px;height:180px;overflow:auto}
      #nested{position:absolute;left:40px;top:50px;width:100px;height:50px}</style>
      <button id="first">First</button><button id="second">Second</button><button id="third">Third</button>
      <div id="scroller"><div style="position:relative;height:800px"><button id="nested">Nested</button></div></div>` });
  });
  await page.goto('http://motion.test/');
  await page.evaluate(() => {
    window.motionClock = { time: 0, paused: true };
    window.motionMetrics = { observed: 0, frames: new Set(), listeners: new Set(), reads: 0 };
    Object.defineProperties(HTMLMediaElement.prototype, {
      src: { configurable: true, get: () => '', set: () => {} },
      paused: { configurable: true, get: () => window.motionClock.paused },
      currentTime: { configurable: true, get: () => window.motionClock.time, set: value => { window.motionClock.time = value; } },
      readyState: { configurable: true, get: () => 1 },
      duration: { configurable: true, get: () => 30 },
    });
    HTMLMediaElement.prototype.play = function () { window.motionClock.paused = false; return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { window.motionClock.paused = true; };
    HTMLMediaElement.prototype.load = function () {};
    const raf = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => {
      const id = raf(time => { window.motionMetrics.frames.delete(id); callback(time); });
      window.motionMetrics.frames.add(id); return id;
    };
    window.cancelAnimationFrame = id => { window.motionMetrics.frames.delete(id); cancel(id); };
    const NativeObserver = window.ResizeObserver;
    window.ResizeObserver = class extends NativeObserver {
      private tracked = new Set<Element>();
      override observe(target: Element, options?: ResizeObserverOptions) {
        if (!this.tracked.has(target)) { this.tracked.add(target); window.motionMetrics.observed++; }
        super.observe(target, options);
      }
      override disconnect() { window.motionMetrics.observed -= this.tracked.size; this.tracked.clear(); super.disconnect(); }
    };
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (listener && ['scroll', 'resize', 'visibilitychange', 'change'].includes(type)) {
        const capture = typeof options === 'boolean' ? options : options?.capture ?? false;
        window.motionMetrics.listeners.add({ target: this, type, listener, capture });
      }
      add.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      const capture = typeof options === 'boolean' ? options : options?.capture ?? false;
      for (const entry of window.motionMetrics.listeners) {
        if (entry.target === this && entry.type === type && entry.listener === listener && entry.capture === capture) window.motionMetrics.listeners.delete(entry);
      }
      remove.call(this, type, listener, options);
    };
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      if (['first', 'second', 'third', 'nested'].includes(this.id)) window.motionMetrics.reads++;
      return rect.call(this);
    };
  });
});

async function setup(page: Page, overrides: Partial<WalkthroughConfig> = {}) {
  await page.evaluate(async overrides => {
    const moduleUrl = '/library.js';
    const { Walkthrough } = await import(moduleUrl) as typeof import('../../src/core/Walkthrough');
    window.tour = new Walkthrough({ audio: '/unused.wav', timeline: [
      { time: 0, target: '#first' }, { time: 2, target: '#second' },
      { time: 4, target: '#third', transitionDuration: 800 }, { time: 6, target: null },
    ], ...overrides });
    window.issues = [];
    window.tour.on('error', issue => window.issues.push(issue));
    await window.tour.start();
  }, overrides);
}

async function advance(page: Page, time: number) {
  await page.evaluate(time => { window.motionClock.time = time; }, time);
  await expect.poll(() => page.evaluate(() => window.tour.state.currentTime)).toBe(time);
}

async function aligned(page: Page, id: string) {
  await expect.poll(() => page.evaluate(id => {
    const box = document.querySelector('.chaley-walkthrough-highlight')!.getBoundingClientRect();
    const target = document.getElementById(id)!.getBoundingClientRect();
    return Math.max(Math.abs(box.x - target.x + 6), Math.abs(box.y - target.y + 6), Math.abs(box.width - target.width - 12), Math.abs(box.height - target.height - 12));
  }, id)).toBeLessThan(0.5);
}

test.afterEach(async ({ page }) => { await page.evaluate(() => window.tour?.destroy()); });

test('animates natural cue changes with configured timing and reuses the highlighter', async ({ page }) => {
  await setup(page, { defaults: { effect: 'spotlight', transitionDuration: 2000 } });
  await page.locator(highlight).evaluate(element => element.setAttribute('data-identity', 'original'));
  await advance(page, 2);
  const animation = await page.locator(highlight).evaluate(element => {
    const movement = element.getAnimations()[0]!;
    movement.pause(); movement.currentTime = 1000;
    return { duration: movement.effect!.getTiming().duration, frames: (movement.effect as KeyframeEffect).getKeyframes() };
  });
  expect(animation.duration).toBe(2000);
  expect(animation.frames[0]).toMatchObject({ left: '74px', width: '172px', borderRadius: '8px' });
  expect(animation.frames[1]).toMatchObject({ left: '394px', width: '112px', borderRadius: '8px' });
  const halfway = await page.locator(highlight).boundingBox();
  expect(halfway!.x).toBeGreaterThan(74); expect(halfway!.x).toBeLessThan(394);
  expect(halfway!.width).toBeGreaterThan(112); expect(halfway!.width).toBeLessThan(172);
  await page.screenshot({ path: 'test-results/phase-4-movement.png' });
  await page.locator(highlight).evaluate(element => element.getAnimations()[0]!.finish());
  await aligned(page, 'second');
  await advance(page, 4);
  expect(await page.locator(highlight).evaluate(element => element.getAnimations()[0]!.effect!.getTiming().duration)).toBe(800);
  await expect(page.locator(highlight)).toHaveAttribute('data-identity', 'original');
});

test('rapid cues replace movement; seeking cancels it and snaps immediately', async ({ page }) => {
  await setup(page, { defaults: { effect: 'spotlight', transitionDuration: 3000 } });
  await advance(page, 2); await advance(page, 4);
  expect(await page.locator(highlight).evaluate(element => element.getAnimations().length)).toBe(1);
  await page.evaluate(() => window.tour.seek(0));
  await aligned(page, 'first');
  expect(await page.locator(highlight).evaluate(element => element.getAnimations().length)).toBe(0);
});

test('instant and zero-duration overrides do not animate', async ({ page }) => {
  await setup(page, { timeline: [
    { time: 0, target: '#first', effect: 'spotlight' },
    { time: 2, target: '#second', effect: 'spotlight', transition: 'instant' },
    { time: 4, target: '#third', effect: 'spotlight', transitionDuration: 0 },
  ] });
  await advance(page, 2); await aligned(page, 'second');
  expect(await page.locator(highlight).evaluate(element => element.getAnimations().length)).toBe(0);
  await advance(page, 4); await aligned(page, 'third');
  expect(await page.locator(highlight).evaluate(element => element.getAnimations().length)).toBe(0);
});

test('ripple rings expand and fade, pause with playback and disappear for spotlight', async ({ page }) => {
  await setup(page, { timeline: [{ time: 0, target: '#first' }, { time: 2, target: '#second', effect: 'spotlight' }] });
  const ripple = await page.locator(highlight).evaluate(element => {
    const rings = element.getAnimations({ subtree: true });
    const frames = (rings[0]!.effect as KeyframeEffect).getKeyframes();
    return { count: rings.length, first: frames[0], last: frames.at(-1), pointer: getComputedStyle(element, '::before').pointerEvents };
  });
  expect(ripple.count).toBe(2); expect(ripple.first).toMatchObject({ opacity: '0.55', transform: 'scale(1)' });
  expect(ripple.last).toMatchObject({ opacity: '0', transform: 'scale(1.18)' }); expect(ripple.pointer).toBe('none');
  await page.screenshot({ path: 'test-results/phase-4-ripple.png' });
  await page.evaluate(() => window.tour.pause());
  expect(await page.locator(highlight).evaluate(element => getComputedStyle(element, '::before').animationPlayState)).toBe('paused');
  await page.evaluate(() => window.tour.resume());
  expect(await page.locator(highlight).evaluate(element => getComputedStyle(element, '::before').animationPlayState)).toBe('running');
  await page.evaluate(() => window.tour.seek(2));
  expect(await page.locator(highlight).evaluate(element => getComputedStyle(element, '::before').content)).toBe('none');
});

test('reduced motion disables movement and ripple initially and when changed live', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page, { defaults: { transitionDuration: 3000 } });
  await advance(page, 2); await aligned(page, 'second');
  expect(await page.locator(highlight).evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await advance(page, 4);
  expect(await page.locator(highlight).evaluate(element => element.getAnimations({ subtree: true }).length)).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' }); await aligned(page, 'third');
  expect(await page.locator(highlight).evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
});

test('tracks viewport and nested scrolling, resizing and transform-only movement while paused', async ({ page }) => {
  await setup(page, { defaults: { effect: 'spotlight' }, timeline: [{ time: 0, target: '#nested' }] });
  await page.evaluate(() => window.tour.pause());
  await page.evaluate(() => { document.getElementById('scroller')!.scrollTop = 25; window.scrollTo(0, 100); });
  await aligned(page, 'nested');
  await page.evaluate(() => {
    const target = document.getElementById('nested')!;
    target.style.width = '170px'; target.style.transform = 'translateX(35px)';
  });
  await aligned(page, 'nested');
  await page.setViewportSize({ width: 1000, height: 700 }); await aligned(page, 'nested');
  expect(await page.locator(highlight).evaluate(element => element.getAnimations().length)).toBe(0);
  expect(await page.evaluate(() => window.motionMetrics.observed)).toBe(1);
});

test('recovers removed, hidden and replaced targets automatically without seeking', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { document.getElementById('first')!.remove(); });
  await expect(page.locator(root)).toBeHidden();
  expect(await page.evaluate(() => window.issues.map(issue => issue.code))).toEqual(['TARGET_NOT_FOUND']);
  await page.evaluate(() => {
    const element = document.createElement('button'); element.id = 'first'; element.style.left = '250px'; document.body.append(element);
  });
  await expect(page.locator(root)).toBeVisible(); await aligned(page, 'first');
  await page.evaluate(() => { document.getElementById('first')!.style.visibility = 'hidden'; });
  await expect(page.locator(root)).toBeHidden();
  await page.evaluate(() => { document.getElementById('first')!.style.visibility = 'visible'; });
  await expect(page.locator(root)).toBeVisible(); await aligned(page, 'first');
  expect(await page.evaluate(() => window.issues.map(issue => issue.code))).toEqual(['TARGET_NOT_FOUND', 'TARGET_NOT_RENDERABLE']);
});

test('scrolling cancels a moving transition without repeatedly restarting it', async ({ page }) => {
  await setup(page, { defaults: { effect: 'spotlight', transitionDuration: 3000 } });
  await advance(page, 2);
  await page.evaluate(() => window.scrollTo(0, 20)); await aligned(page, 'second');
  expect(await page.locator(highlight).evaluate(element => element.getAnimations().length)).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 40)); await aligned(page, 'second');
  expect(await page.locator(highlight).evaluate(element => element.getAnimations().length)).toBe(0);
});

test('stop and destroy release tracking, observers and pending animation work', async ({ page }) => {
  await setup(page);
  expect(await page.evaluate(() => window.motionMetrics.observed)).toBe(1);
  await page.evaluate(() => window.tour.stop());
  expect(await page.evaluate(() => ({ frames: window.motionMetrics.frames.size, observed: window.motionMetrics.observed, listeners: window.motionMetrics.listeners.size }))).toEqual({ frames: 0, observed: 0, listeners: 0 });
  const reads = await page.evaluate(() => window.motionMetrics.reads);
  await page.evaluate(() => { window.scrollTo(0, 20); document.getElementById('first')!.style.width = '200px'; });
  await page.waitForTimeout(80);
  expect(await page.evaluate(() => window.motionMetrics.reads)).toBe(reads);
  await page.evaluate(() => window.tour.start());
  await page.evaluate(() => { window.tour.destroy(); window.tour.destroy(); });
  await expect(page.locator(root)).toHaveCount(0);
  expect(await page.evaluate(() => ({ frames: window.motionMetrics.frames.size, observed: window.motionMetrics.observed, listeners: window.motionMetrics.listeners.size }))).toEqual({ frames: 0, observed: 0, listeners: 0 });
});

test('an asynchronous target warning can destroy during tracking without stale callbacks', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { window.tour.on('error', () => window.tour.destroy()); document.getElementById('first')!.remove(); });
  await expect.poll(() => page.evaluate(() => window.tour.state.status)).toBe('destroyed');
  await expect(page.locator(root)).toHaveCount(0);
  expect(await page.evaluate(() => window.motionMetrics.frames.size)).toBe(0);
});

test('coalesces scroll and resize bursts without synchronous layout reads', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(() => {
    const before = window.motionMetrics.reads;
    for (let index = 0; index < 100; index++) {
      document.dispatchEvent(new Event('scroll')); window.dispatchEvent(new Event('resize'));
    }
    return { reads: window.motionMetrics.reads - before, frames: window.motionMetrics.frames.size };
  });
  expect(result.reads).toBe(0);
  // One media-clock frame and one geometry frame, not one frame per event.
  expect(result.frames).toBe(2);
});

test('suspends frames while hidden and reconciles geometry on visibility recovery', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => window.motionMetrics.frames.size)).toBe(0);
  expect(await page.locator(highlight).evaluate(element => getComputedStyle(element, '::before').animationPlayState)).toBe('paused');
  await page.evaluate(() => {
    document.getElementById('first')!.style.left = '320px';
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await aligned(page, 'first');
  expect(await page.locator(highlight).evaluate(element => getComputedStyle(element, '::before').animationPlayState)).toBe('running');
  expect(await page.evaluate(() => window.motionMetrics.frames.size)).toBe(2);
});
