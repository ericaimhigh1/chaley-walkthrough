import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { WalkthroughConfig } from '../../src/core/types';

const root = '.chaley-walkthrough-root';
const highlight = '.chaley-walkthrough-highlight';

test.beforeEach(async ({ page }) => {
  await page.route('http://highlight.test/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/library.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync('dist/chaley-walkthrough.js') });
    if (path === '/style.css') return route.fulfill({ contentType: 'text/css', body: readFileSync('dist/style.css') });
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><link rel="stylesheet" href="/style.css">
      <style>body{margin:0;background:white}button{position:absolute;box-sizing:border-box;background:white;border:1px solid #444}
      #first{left:80px;top:100px;width:160px;height:60px}#second{left:400px;top:240px;width:100px;height:80px}
      #outside{left:700px;top:100px;width:130px;height:50px}</style>
      <button id="first">First target</button><button id="second">Second target</button><button id="outside">Other control</button>
      <button id="123:a.b" style="left:400px;top:400px;width:120px;height:40px">Literal ID</button>` });
  });
  await page.goto('http://highlight.test/');
  // Rendering tests keep the clock deterministic; audio.spec.ts tests real media.
  await page.evaluate(() => {
    // Keep the deterministic fixture from issuing a real native audio request.
    Object.defineProperty(HTMLMediaElement.prototype, 'src', { configurable: true, get: () => '', set: () => {} });
    HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () {};
    HTMLMediaElement.prototype.load = function () {};
  });
});

async function setup(page: import('@playwright/test').Page, overrides: Partial<WalkthroughConfig> = {}) {
  await page.evaluate(async overrides => {
    const moduleUrl = '/library.js';
    const { Walkthrough } = await import(moduleUrl) as typeof import('../../src/core/Walkthrough');
    window.tour = new Walkthrough({ ...overrides,
      audio: '/unused.wav',
      timeline: overrides.timeline ?? [
        { time: 0, target: '#first' }, { time: 2, target: '#second', effect: 'spotlight' },
        { time: 4, target: null }, { time: 6, target: '#missing' },
        { time: 8, target: '#first', effect: 'none' }, { time: 10, target: '#123:a.b' },
      ],
    });
    window.issues = [];
    window.tour.on('error', issue => window.issues.push(issue));
    await window.tour.start();
  }, overrides);
}

test.afterEach(async ({ page }) => { await page.evaluate(() => window.tour?.destroy()); });

test('positions a persistent highlight and backdrop with a transparent cutout', async ({ page }) => {
  await setup(page);
  await expect(page.locator(root)).toBeVisible();
  expect(await page.locator(highlight).boundingBox()).toEqual({ x: 74, y: 94, width: 172, height: 72 });
  const styles = await page.locator(highlight).evaluate(element => {
    const style = getComputedStyle(element);
    return { radius: style.borderRadius, shadow: style.boxShadow, outline: style.outlineColor, background: style.backgroundColor, transition: style.transitionDuration, animation: style.animationName };
  });
  expect(styles).toMatchObject({ radius: '8px', outline: 'rgb(99, 102, 241)', background: 'rgba(0, 0, 0, 0)', transition: '0s', animation: 'none' });
  expect(styles.shadow).toContain('rgba(0, 0, 0, 0.1)');
  await page.locator(highlight).evaluate(element => { element.setAttribute('data-identity-check', 'original'); });
  await page.evaluate(() => window.tour.seek(2));
  await expect(page.locator(highlight)).toHaveAttribute('data-identity-check', 'original');
  expect(await page.locator(highlight).boundingBox()).toEqual({ x: 394, y: 234, width: 112, height: 92 });
  await expect(page.locator(root)).toHaveCount(1);
  await page.screenshot({ path: 'test-results/phase-3-static-highlight.png' });
});

test('preserves pointer interaction, keyboard focus and host DOM', async ({ page }) => {
  await page.locator('#first').focus();
  const original = await page.locator('#first').evaluate(element => element.outerHTML);
  await setup(page);
  await expect(page.locator('#first')).toBeFocused();
  await expect(page.locator(root)).toHaveAttribute('aria-hidden', 'true');
  expect(await page.locator(root).evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none');
  await page.evaluate(() => {
    document.getElementById('first')!.onclick = () => { document.getElementById('first')!.textContent = 'Clicked'; };
    document.getElementById('outside')!.onclick = () => { document.getElementById('outside')!.textContent = 'Outside clicked'; };
  });
  expect(await page.locator('#first').evaluate(element => element.outerHTML)).toBe(original);
  await page.locator('#first').click(); await expect(page.locator('#first')).toHaveText('Clicked');
  await page.locator('#outside').click(); await expect(page.locator('#outside')).toHaveText('Outside clicked');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('.chaley-walkthrough-root') === null)).toBe(true);
});

test('applies configured theme and cue effect overrides', async ({ page }) => {
  await setup(page, { theme: { overlayOpacity: 0.25, highlightColor: '#ef4444', padding: 10, borderRadius: 14 }, defaults: { effect: 'none' } });
  await expect(page.locator(root)).toHaveCount(0);
  await page.evaluate(() => window.tour.seek(2));
  expect(await page.locator(highlight).boundingBox()).toEqual({ x: 390, y: 230, width: 120, height: 100 });
  const style = await page.locator(highlight).evaluate(element => ({ radius: getComputedStyle(element).borderRadius, shadow: getComputedStyle(element).boxShadow, outline: getComputedStyle(element).outlineColor }));
  expect(style.radius).toBe('14px'); expect(style.shadow).toContain('0.25'); expect(style.outline).toBe('rgb(239, 68, 68)');
  await page.evaluate(() => window.tour.seek(8)); await expect(page.locator(root)).toBeHidden();
});

test('clears null/missing targets, warns once, and resolves literal IDs', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => window.tour.seek(4)); await expect(page.locator(root)).toBeHidden();
  await page.evaluate(() => { window.tour.seek(6); window.tour.seek(6); });
  await expect(page.locator(root)).toBeHidden();
  expect(await page.evaluate(() => window.issues.map(issue => issue.code))).toEqual(['TARGET_NOT_FOUND']);
  expect(await page.evaluate(() => window.tour.state.status)).not.toBe('error');
  await page.evaluate(() => window.tour.seek(10));
  expect(await page.locator(highlight).boundingBox()).toEqual({ x: 394, y: 394, width: 132, height: 52 });
});

test('re-resolves same-cue seeks after removal, replacement and hidden targets', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { document.getElementById('first')!.remove(); window.tour.seek(0); });
  await expect(page.locator(root)).toBeHidden();
  await page.evaluate(() => {
    const replacement = document.createElement('button'); replacement.id = 'first';
    replacement.style.left = '200px'; document.body.append(replacement); window.tour.seek(0);
  });
  expect((await page.locator(highlight).boundingBox())!.x).toBe(194);
  await page.evaluate(() => { document.getElementById('first')!.style.display = 'none'; window.tour.seek(0); });
  await expect(page.locator(root)).toBeHidden();
  expect(await page.evaluate(() => window.issues.map(issue => issue.code))).toEqual(['TARGET_NOT_FOUND', 'TARGET_NOT_RENDERABLE']);
});

test('clears stop visuals, reuses nodes on restart and removes them on destroy', async ({ page }) => {
  await setup(page);
  await page.locator(highlight).evaluate(element => element.setAttribute('data-identity-check', 'original'));
  await page.evaluate(() => window.tour.stop()); await expect(page.locator(root)).toBeHidden();
  await page.evaluate(() => window.tour.seek(2)); await expect(page.locator(root)).toBeHidden();
  await page.evaluate(() => window.tour.start());
  await expect(page.locator(highlight)).toHaveAttribute('data-identity-check', 'original');
  await page.evaluate(() => { window.tour.destroy(); window.tour.destroy(); });
  await expect(page.locator(root)).toHaveCount(0);
  for (let index = 0; index < 3; index++) {
    await setup(page); await page.evaluate(() => window.tour.destroy());
  }
  await expect(page.locator(root)).toHaveCount(0);
});

test('a warning subscriber can destroy without resurrecting visuals', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { window.tour.on('error', () => window.tour.destroy()); window.tour.seek(6); });
  expect(await page.evaluate(() => window.tour.state.status)).toBe('destroyed');
  await expect(page.locator(root)).toHaveCount(0);
});

test('zero opacity removes dimming and reduced motion remains static', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page, { theme: { overlayOpacity: 0, padding: 0, borderRadius: 0 } });
  expect(await page.locator(highlight).boundingBox()).toEqual({ x: 80, y: 100, width: 160, height: 60 });
  const styles = await page.locator(highlight).evaluate(element => ({ shadow: getComputedStyle(element).boxShadow, radius: getComputedStyle(element).borderRadius, animation: getComputedStyle(element).animationName }));
  expect(styles.shadow).toContain('rgba(0, 0, 0, 0)'); expect(styles.radius).toBe('0px'); expect(styles.animation).toBe('none');
});
