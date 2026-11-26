import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { WalkthroughConfig } from '../../src/core/types';

declare global {
  interface Window {
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
    if (path === '/library.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync('dist/chaley-walkthrough.js') });
    if (path === '/style.css') return route.fulfill({ contentType: 'text/css', body: readFileSync('dist/style.css') });
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

const player = '.chaley-walkthrough-player';
test('player controls pause resume seek replay and stop without moving focus', async ({ page }) => {
  await page.locator('#first').focus();
  await setup(page, { timeline: [{ time: 0, target: '#first' }] });
  await expect(page.locator('#first')).toBeFocused();
  await expect(page.getByRole('region', { name: 'Walkthrough player' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(await page.evaluate(() => window.tour.state.status)).toBe('paused');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  expect(await page.evaluate(() => window.tour.state.status)).toBe('playing');
  await page.getByRole('slider', { name: 'Walkthrough progress' }).fill('12');
  expect(await page.evaluate(() => window.tour.state.currentTime)).toBe(12);
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  expect(await page.evaluate(() => window.tour.state.currentTime)).toBe(0);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator(player)).toBeHidden();
});
test('captions are literal text and toggle with a keyboard button', async ({ page }) => {
  await setup(page, { timeline: [{ time: 0, target: '#first', caption: '<img src=x onerror=alert(1)>' }] });
  await expect(page.locator('.chaley-walkthrough-player-caption')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator(player + ' img')).toHaveCount(0);
  const toggle = page.getByRole('button', { name: 'Captions', exact: true });
  await toggle.focus(); await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.chaley-walkthrough-player-caption')).toBeHidden();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.tour.state.status)).toBe('idle');
});
test('slider is labelled and keyboard operable with visible focus', async ({ page }) => {
  await setup(page, { timeline: [] });
  const slider = page.getByRole('slider', { name: 'Walkthrough progress' });
  await slider.focus(); await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.tour.state.currentTime)).toBeCloseTo(0.1);
  await expect(slider).toHaveAttribute('aria-valuetext', '0:00 of 0:30');
  expect(await slider.evaluate(e => getComputedStyle(e).outlineStyle)).toBe('solid');
});
test('unknown duration disables seeking; completion and errors offer replay or retry', async ({ page }) => {
  await page.evaluate(() => Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get: () => NaN }));
  await setup(page, { timeline: [] });
  await expect(page.getByRole('slider')).toBeDisabled();
  await page.evaluate(() => {
    Object.defineProperty(window.actionAudio, 'ended', { configurable: true, value: true });
    window.actionAudio.dispatchEvent(new Event('ended'));
  });
  await expect(page.getByRole('button', { name: 'Play again', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play again', exact: true }).click();
  await page.evaluate(() => window.actionAudio.dispatchEvent(new Event('error')));
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
});
test('position and CSS theme work on a narrow viewport and avoid target overlap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.addStyleTag({ content: ':root { --chaley-walkthrough-player-background: rgb(20, 30, 40); --chaley-walkthrough-player-color: white; --chaley-walkthrough-player-radius: 22px; } #first { position: fixed; bottom: 25px; right: 25px; }' });
  await setup(page, { timeline: [{ time: 0, target: '#first' }], player: { position: 'bottom-right' } });
  await expect(page.locator(player)).toHaveAttribute('data-position', 'top-right');
  expect(await page.locator(player).evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(20, 30, 40)');
  const box = await page.locator(player).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/phase-7-player.png' });
});
test('destroy removes player and its keyboard behavior', async ({ page }) => {
  await setup(page, { timeline: [] });
  await page.evaluate(() => { window.tour.destroy(); window.tour.destroy(); });
  await expect(page.locator(player)).toHaveCount(0);
  expect(await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })))).toBe(true);
});
