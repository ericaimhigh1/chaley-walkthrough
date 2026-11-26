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
test('scrolls distant target while audio continues and then highlights it', async ({ page }) => {
  await setup(page);
  expect(await page.evaluate(() => window.motionClock.paused)).toBe(false);
  await expect(page.locator('#far')).toBeInViewport({ ratio: 1 });
  await expect(page.locator(root)).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
});
test('scrolls nested clipping ancestors and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page, { timeline: [{ time: 0, target: '#nested' }] });
  await expect.poll(() => page.locator('#scroller').evaluate(e => e.scrollTop)).toBeGreaterThan(400);
  await expect(page.locator(root)).toBeVisible();
});
test('visible targets and scroll false do not scroll', async ({ page }) => {
  await setup(page, { timeline: [{ time: 0, target: '#first' }, { time: 2, target: '#far', scroll: false }] });
  await page.evaluate(() => window.tour.seek(2));
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
test('seek and stop cancel stale scrolling and visuals', async ({ page }) => {
  await setup(page, { timeline: [{ time: 0, target: '#far' }, { time: 2, target: null }] });
  await page.evaluate(() => { window.tour.seek(2); window.tour.stop(); });
  const position = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.scrollY)).toBe(position);
  await expect(page.locator(root)).not.toBeVisible();
});
test('unreachable clipping times out recoverably', async ({ page }) => {
  await page.locator('#scroller').evaluate(e => { e.style.overflow = 'clip'; });
  await setup(page, { timeline: [{ time: 0, target: '#nested' }] });
  await expect.poll(() => page.evaluate(() => window.issues.map(e => e.code))).toContain('SCROLL_INCOMPLETE');
  expect(await page.evaluate(() => window.tour.state.status)).toBe('playing');
});

async function clicks(page: Page) {
  await page.evaluate(() => {
    document.querySelector('#first')!.setAttribute('data-clicks', '0');
    document.querySelector('#first')!.addEventListener('click', () => {
      const button = document.querySelector('#first')!;
      button.setAttribute('data-clicks', String(Number(button.getAttribute('data-clicks')) + 1));
      (document.querySelector('#content') as HTMLElement).hidden = false;
    });
  });
}
const clickTimeline = [{ time: 0, target: '#first' as const, action: { type: 'click' as const } }, { time: 2, target: '#content' as const }];
test('explicit false disables actions; authored click opens content for the following cue', async ({ page }) => {
  await clicks(page);
  await setup(page, { allowActions: false, timeline: clickTimeline });
  await page.waitForTimeout(100);
  await expect(page.locator('#first')).toHaveAttribute('data-clicks', '0');
  await page.evaluate(() => window.tour.destroy());
  await setup(page, { timeline: clickTimeline });
  await expect(page.locator('#content')).toBeVisible();
  await page.evaluate(() => { window.motionClock.time = 2; });
  await expect.poll(() => page.evaluate(() => window.tour.state.activeCue?.target)).toBe('#content');
  await expect(page.locator(root)).toBeVisible();
});
test('pause resume and seeking do not repeat clicks; restart creates a fresh run', async ({ page }) => {
  await clicks(page);
  await setup(page, { allowActions: true, timeline: clickTimeline });
  await expect(page.locator('#first')).toHaveAttribute('data-clicks', '1');
  await page.evaluate(async () => { window.tour.pause(); await window.tour.resume(); window.tour.seek(2); window.tour.seek(0); });
  await page.waitForTimeout(100);
  await expect(page.locator('#first')).toHaveAttribute('data-clicks', '1');
  await page.evaluate(() => window.tour.restart());
  await expect(page.locator('#first')).toHaveAttribute('data-clicks', '2');
});
test('seek never executes selected or skipped actions', async ({ page }) => {
  await clicks(page);
  await setup(page, { allowActions: true, timeline: [{ time: 0, target: null }, { ...clickTimeline[0]!, time: 2 }] });
  await page.evaluate(() => window.tour.seek(2));
  await page.waitForTimeout(100);
  await expect(page.locator('#first')).toHaveAttribute('data-clicks', '0');
});
test('click waits for offscreen scrolling and highlight', async ({ page }) => {
  await page.locator('#far').evaluate(e => e.addEventListener('click', () => e.setAttribute('data-highlight', String(!(document.querySelector('.chaley-walkthrough-root') as HTMLElement).hidden))));
  await setup(page, { allowActions: true, timeline: [{ time: 0, target: '#far', action: { type: 'click' } }] });
  await expect(page.locator('#far')).toHaveAttribute('data-highlight', 'true');
  await expect(page.locator('#far')).toBeInViewport({ ratio: 1 });
});
test('developer-authored link and submit actions run without type-based errors', async ({ page }) => {
  for (const target of ['#link', '#submit', '#first'] as const) {
    await page.locator(target).evaluate(e => e.addEventListener('click', event => {
      event.preventDefault(); e.setAttribute('data-clicked', 'true');
    }));
    await setup(page, { timeline: [{ time: 0, target, action: { type: 'click' } }] });
    await expect(page.locator(target)).toHaveAttribute('data-clicked', 'true');
    expect(await page.evaluate(() => window.issues)).toEqual([]);
    await page.evaluate(() => window.tour.destroy());
  }
});
async function pressEvents(page: Page) {
  await page.locator('#first').evaluate(e => {
    e.setAttribute('data-events', '');
    for (const type of ['pointerdown', 'pointerup', 'pointercancel']) e.addEventListener(type, event => {
      e.setAttribute('data-events', e.getAttribute('data-events') + type + ',');
      e.setAttribute('data-trusted', String(event.isTrusted));
    });
  });
}
const holdTimeline = [{ time: 0, target: '#first' as const, action: { type: 'longpress' as const, holdDuration: 400 } }, { time: 2, target: null }];
test('compatible longpress receives pointerdown hold pointerup', async ({ page }) => {
  await pressEvents(page);
  await setup(page, { allowActions: true, timeline: holdTimeline });
  await expect(page.locator('#first')).toHaveAttribute('data-events', 'pointerdown,');
  await expect(page.locator('#first')).toHaveAttribute('data-events', 'pointerdown,pointerup,');
  await expect(page.locator('#first')).toHaveAttribute('data-trusted', 'false');
});
for (const operation of ['pause', 'seek', 'stop', 'destroy', 'remove', 'cue'] as const) {
  test(`longpress cancellation releases press state on ${operation}`, async ({ page }) => {
    await pressEvents(page);
    await setup(page, { allowActions: true, timeline: holdTimeline });
    await expect(page.locator('#first')).toHaveAttribute('data-events', 'pointerdown,');
    await page.evaluate(operation => {
      const element = document.querySelector('#first')!;
      element.addEventListener('pointercancel', () => document.body.setAttribute('data-cancelled', 'true'));
      if (operation === 'remove') element.remove();
      else if (operation === 'cue') window.motionClock.time = 2;
      else if (operation === 'seek') window.tour.seek(2);
      else window.tour[operation]();
    }, operation);
    await expect(page.locator('body')).toHaveAttribute('data-cancelled', 'true');
    if (operation === 'pause') {
      await page.evaluate(() => window.tour.resume());
      await page.waitForTimeout(450);
      await expect(page.locator('#first')).toHaveAttribute('data-events', 'pointerdown,pointercancel,');
    }
  });
}
test('hidden-tab recovery never executes a missed action', async ({ page }) => {
  await clicks(page);
  await setup(page, { allowActions: true, timeline: [{ time: 0, target: null }, { ...clickTimeline[0]!, time: 2 }] });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.motionClock.time = 2;
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(100);
  await expect(page.locator('#first')).toHaveAttribute('data-clicks', '0');
});

test('buffering reconciliation suppresses missed actions', async ({ page }) => {
  await clicks(page);
  await setup(page, { allowActions: true, timeline: [{ time: 0, target: null }, { ...clickTimeline[0]!, time: 2 }] });
  await page.evaluate(() => {
    window.actionAudio.dispatchEvent(new Event('waiting'));
    window.motionClock.time = 2;
    window.actionAudio.dispatchEvent(new Event('timeupdate'));
    window.actionAudio.dispatchEvent(new Event('playing'));
  });
  await page.waitForTimeout(100);
  await expect(page.locator('#first')).toHaveAttribute('data-clicks', '0');
});
test('action waits for highlight movement to finish', async ({ page }) => {
  await clicks(page);
  await setup(page, { allowActions: true, defaults: { transitionDuration: 600 }, timeline: [
    { time: 0, target: '#link' }, { ...clickTimeline[0]!, time: 2 },
  ] });
  await page.evaluate(() => { window.motionClock.time = 2; });
  await expect.poll(() => page.evaluate(() => window.tour.state.currentTime)).toBe(2);
  await expect(page.locator('#first')).toHaveAttribute('data-clicks', '0');
  await expect(page.locator('#first')).toHaveAttribute('data-clicks', '1');
});
test('scroll false never permits an offscreen action', async ({ page }) => {
  await page.locator('#far').evaluate(e => e.addEventListener('click', () => e.setAttribute('data-clicked', 'true')));
  await setup(page, { allowActions: true, timeline: [{ time: 0, target: '#far', scroll: false, action: { type: 'click' } }] });
  await expect.poll(() => page.evaluate(() => window.issues.map(e => e.code))).toContain('ACTION_SKIPPED');
  await expect(page.locator('#far')).not.toHaveAttribute('data-clicked', 'true');
});
test('native scrolling honours target scroll margins', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  await expect(page.locator(root)).toBeVisible();
  const offset = await page.locator('#far').evaluate(e => {
    const rect = e.getBoundingClientRect();
    return rect.top + rect.height / 2 - innerHeight / 2;
  });
  expect(Math.abs(offset - 50)).toBeLessThan(2);
});
test('pointerdown handler may destroy synchronously without a stale release', async ({ page }) => {
  await pressEvents(page);
  await page.locator('#first').evaluate(e => e.addEventListener('pointerdown', () => window.tour.destroy()));
  await setup(page, { allowActions: true, timeline: holdTimeline });
  await expect(page.locator('#first')).toHaveAttribute('data-events', 'pointerdown,pointercancel,');
  await page.waitForTimeout(450);
  await expect(page.locator('#first')).toHaveAttribute('data-events', 'pointerdown,pointercancel,');
});
