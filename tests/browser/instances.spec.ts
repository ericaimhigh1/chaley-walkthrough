import { packageAsset } from './assets';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { WalkthroughConfig } from '../../src/core/types';

declare global {
  interface Window {
    otherTour: import('../../src/core/Walkthrough').Walkthrough;
    actionAudio: HTMLMediaElement;
    motionClock: { time: number; paused: boolean };
    motionMetrics: { observed: number; frames: Set<number>; listeners: Set<{ target: EventTarget; type: string; listener: EventListenerOrEventListenerObject; capture: boolean }>; reads: number };
  }
}

const highlight = '.chaley-walkthrough-highlight';
const root = '.chaley-walkthrough-root';

test.beforeEach(async ({ page }) => {
  await page.route('http://motion.test/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/library.js') return route.fulfill({ contentType: 'text/javascript', body: packageAsset('chaley-walkthrough.js') });
    if (path === '/style.css') return route.fulfill({ contentType: 'text/css', body: packageAsset('style.css') });
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><link rel="stylesheet" href="/style.css">
    <style>body{margin:0;height:3000px}#far{position:absolute;top:1800px;scroll-margin-top:100px}
    #scroller{position:absolute;top:150px;height:120px;width:300px;overflow:auto}#nested{margin-top:600px}</style>
    <button id="first" type="button">Open</button><div id="content" hidden>Dropdown content</div>
    <button id="far" type="button">Far</button><div id="scroller"><button id="nested">Nested</button></div>
    <a id="link" href="/navigate">Link</a><form><button id="submit">Submit</button></form>` });
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
    HTMLMediaElement.prototype.play = function () { window.actionAudio = this; window.motionClock.paused = false; return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { window.motionClock.paused = true; };
    HTMLMediaElement.prototype.load = function () {};
  });
});
async function setup(page: Page, overrides: Partial<WalkthroughConfig> = {}) {
  await page.evaluate(async overrides => {
    const moduleUrl = '/library.js';
    const { Walkthrough } = await import(moduleUrl) as typeof import('../../src/core/Walkthrough');
    window.issues = [];
    window.tour = new Walkthrough({ audio: '/unused.wav', timeline: [{ time: 0, target: '#far' }], ...overrides });
    window.tour.on('error', issue => window.issues.push(issue));
    await window.tour.start();
  }, overrides);
}
test.afterEach(async ({ page }) => { await page.evaluate(() => window.tour?.destroy()); });


async function instances(page: Page, firstTrigger = '#first', secondTrigger = '#nested') {
  await page.evaluate(async ({ firstTrigger, secondTrigger }) => {
    const moduleUrl = '/library.js';
    const { Walkthrough } = await import(moduleUrl) as typeof import('../../src/core/Walkthrough');
    window.issues = [];
    window.tour = new Walkthrough({ audio: '/one.wav', trigger: firstTrigger as `#${string}`, timeline: [{ time: 0, target: '#first' }] });
    window.otherTour = new Walkthrough({ audio: '/two.wav', trigger: secondTrigger as `#${string}`, timeline: [{ time: 0, target: '#nested' }] });
    window.tour.on('error', e => window.issues.push(e)); window.otherTour.on('error', e => window.issues.push(e));
  }, { firstTrigger, secondTrigger });
}
test.afterEach(async ({ page }) => { await page.evaluate(() => window.otherTour?.destroy()); });
test('distinct triggers start independent tours and switching stops paused sessions', async ({ page }) => {
  await instances(page);
  expect(await page.evaluate(() => [window.tour.state.status, window.otherTour.state.status])).toEqual(['idle', 'idle']);
  await page.locator('#first').click();
  await expect.poll(() => page.evaluate(() => window.tour.state.status)).toBe('playing');
  await page.evaluate(() => window.tour.pause());
  await page.locator('#nested').click();
  await expect.poll(() => page.evaluate(() => window.otherTour.state.status)).toBe('playing');
  expect(await page.evaluate(() => window.tour.state.status)).toBe('idle');
  await expect(page.locator('.chaley-walkthrough-player:visible')).toHaveCount(1);
  await expect(page.locator('.chaley-walkthrough-root:visible')).toHaveCount(1);
  await page.evaluate(() => window.tour.destroy());
  expect(await page.evaluate(() => window.otherTour.state.status)).toBe('playing');
});
test('duplicate and missing triggers warn without conflicting handlers', async ({ page }) => {
  await instances(page, '#first', '#first');
  await expect.poll(() => page.evaluate(() => window.issues.map(e => e.code))).toContain('TRIGGER_CONFLICT');
  await page.locator('#first').click();
  await expect.poll(() => page.evaluate(() => window.tour.state.status)).toBe('playing');
  expect(await page.evaluate(() => window.otherTour.state.status)).toBe('idle');
  await page.evaluate(() => { window.tour.destroy(); window.otherTour.destroy(); });
  await instances(page, '#missing', '#nested');
  await expect.poll(() => page.evaluate(() => window.issues.map(e => e.code))).toContain('TRIGGER_NOT_FOUND');
  await page.evaluate(() => window.tour.start());
  expect(await page.evaluate(() => window.tour.state.status)).toBe('playing');
});
test('destroy releases trigger for remount and removes old click listeners', async ({ page }) => {
  for (let i = 0; i < 4; i++) {
    await instances(page);
    await page.locator('#first').click();
    await expect.poll(() => page.evaluate(() => window.tour.state.status)).toBe('playing');
    await page.evaluate(() => { window.tour.destroy(); window.otherTour.destroy(); });
    await page.locator('#first').click();
    expect(await page.evaluate(() => window.tour.state.status)).toBe('destroyed');
    await expect(page.locator('.chaley-walkthrough-player')).toHaveCount(0);
    await expect(page.locator('.chaley-walkthrough-root')).toHaveCount(0);
  }
});
test('switching releases an in-progress simulated press before starting another tour', async ({ page }) => {
  await setup(page, { timeline: [{ time: 0, target: '#first', action: { type: 'longpress', holdDuration: 5000 } }] });
  // Register before the next animation frame dispatches the press.
  await page.locator('#first').evaluate(e => e.addEventListener('pointercancel', () => e.setAttribute('data-cancelled', 'true')));
  await page.waitForTimeout(100);
  await page.evaluate(async () => {
    const moduleUrl = '/library.js';
    const { Walkthrough } = await import(moduleUrl) as typeof import('../../src/core/Walkthrough');
    window.otherTour = new Walkthrough({ audio: '/two.wav', timeline: [] });
    await window.otherTour.start();
  });
  await expect(page.locator('#first')).toHaveAttribute('data-cancelled', 'true');
  expect(await page.evaluate(() => window.tour.state.status)).toBe('idle');
});
test('trigger playback rejection is reported without unhandled promise rejection', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await instances(page);
  await page.evaluate(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('blocked', 'NotAllowedError')); });
  await page.locator('#first').click();
  await expect.poll(() => page.evaluate(() => window.issues.map(e => e.code))).toContain('PLAYBACK_REJECTED');
  expect(errors).toEqual([]);
});
