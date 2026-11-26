import { packageAsset } from './assets';
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

async function addDialogs(page: Page) {
  await page.evaluate(() => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `<dialog id="modal" style="transform:translate(25px, 15px);overflow:hidden;width:250px;height:180px">
      <button id="dialog-target">Dialog target</button><button id="dialog-close">Close dialog</button>
      </dialog><dialog id="second-modal"><button id="second-target">Second target</button></dialog>`;
    document.body.append(wrapper);
    document.getElementById('dialog-close')!.onclick = () => (document.getElementById('modal') as HTMLDialogElement).close();
  });
}

async function assertDialogHighlight(page: Page, id: string) {
  await expect.poll(async () => {
    const target = await page.locator(id).boundingBox();
    const box = await page.locator(highlight).boundingBox();
    return !!target && !!box && Math.abs(box.x - target.x + 6) < 1 && Math.abs(box.y - target.y + 6) < 1;
  }).toBe(true);
  expect(await page.locator('.chaley-walkthrough-layer-host').evaluate(e => e.matches(':popover-open'))).toBe(true);
}

test('modal player and highlight escape transformed clipping and preserve native controls', async ({ page }) => {
  await addDialogs(page);
  await page.evaluate(() => (document.getElementById('modal') as HTMLDialogElement).showModal());
  await setup(page, { timeline: [{ time: 0, target: '#dialog-target' }] });
  await expect(page.locator('#dialog-target')).toBeFocused();
  await assertDialogHighlight(page, '#dialog-target');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.tour.state.status)).toBe('paused');
  // The player remains outside the small dialog's clipping rectangle.
  const box = await page.locator(player).boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(1280);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('.chaley-walkthrough-layer-host')).toHaveCount(0);
  await expect(page.locator('body > ' + player)).toBeVisible();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  expect(await page.evaluate(() => window.tour.state.status)).toBe('playing');
});

test('modal lifecycle is tracked while paused on a caption-only cue', async ({ page }) => {
  await addDialogs(page);
  await setup(page, { timeline: [{ time: 0, target: null, caption: 'Narration' }] });
  await page.evaluate(() => window.tour.pause());
  await page.evaluate(() => (document.getElementById('modal') as HTMLDialogElement).showModal());
  await expect(page.locator('#modal ' + player)).toBeVisible();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.evaluate(() => document.getElementById('modal')!.remove());
  await expect(page.locator('body > ' + player)).toBeVisible();
  await expect(page.locator('.chaley-walkthrough-layer-host')).toHaveCount(0);
});

test('sibling modals follow opening order and restore the earlier modal', async ({ page }) => {
  await addDialogs(page);
  await setup(page, { timeline: [{ time: 0, target: null }] });
  // Reverse DOM order, with both opens in one task.
  await page.evaluate(() => {
    (document.getElementById('second-modal') as HTMLDialogElement).showModal();
    (document.getElementById('modal') as HTMLDialogElement).showModal();
  });
  await expect(page.locator('#modal ' + player)).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.evaluate(() => (document.getElementById('modal') as HTMLDialogElement).close());
  await expect(page.locator('#second-modal ' + player)).toBeVisible();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.tour.state.status)).toBe('idle');
  expect(await page.locator('#second-modal').evaluate(e => e.matches(':modal'))).toBe(true);
  await expect(page.locator('.chaley-walkthrough-layer-host')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#second-modal')).not.toBeVisible();
});

test('a developer click opens a modal and the next cue highlights its content', async ({ page }) => {
  await addDialogs(page);
  await page.evaluate(() => { document.getElementById('first')!.onclick = () => (document.getElementById('modal') as HTMLDialogElement).showModal(); });
  await setup(page, { defaults: { transition: 'instant' }, timeline: [
    { time: 0, target: '#first', action: { type: 'click' } },
    { time: 1, target: '#dialog-target' },
  ] });
  await expect(page.locator('#modal')).toBeVisible();
  await page.evaluate(() => { window.motionClock.time = 1; window.actionAudio.dispatchEvent(new Event('timeupdate')); });
  await assertDialogHighlight(page, '#dialog-target');
  await page.evaluate(() => window.tour.destroy());
  await expect(page.locator('.chaley-walkthrough-layer-host')).toHaveCount(0);
  await expect(page.locator(player)).toHaveCount(0);
  await expect(page.locator(root)).toHaveCount(0);
  expect(await page.locator('#modal').evaluate(e => e.matches(':modal'))).toBe(true);
});


test('dialog scrolling tracks highlight and reopening restores the modal host', async ({ page }) => {
  await addDialogs(page);
  await page.evaluate(() => {
    const dialog = document.getElementById('modal') as HTMLDialogElement;
    dialog.style.overflow = 'auto';
    document.getElementById('dialog-target')!.style.marginTop = '600px';
    dialog.showModal();
  });
  await setup(page, { timeline: [{ time: 0, target: '#dialog-target' }] });
  await expect.poll(() => page.locator('#modal').evaluate(e => e.scrollTop)).toBeGreaterThan(0);
  await assertDialogHighlight(page, '#dialog-target');
  await page.evaluate(() => {
    window.tour.pause();
    (document.getElementById('modal') as HTMLDialogElement).close();
  });
  await expect(page.locator('body > ' + player)).toBeVisible();
  await page.evaluate(() => (document.getElementById('modal') as HTMLDialogElement).showModal());
  await assertDialogHighlight(page, '#dialog-target');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  expect(await page.evaluate(() => window.tour.state.status)).toBe('playing');
});

test('non-modal dialogs use the body overlay and respect prevented Escape', async ({ page }) => {
  await addDialogs(page);
  await page.evaluate(() => {
    (document.getElementById('modal') as HTMLDialogElement).show();
    document.addEventListener('keydown', event => { if (event.key === 'Escape') event.preventDefault(); });
  });
  await setup(page, { timeline: [{ time: 0, target: '#dialog-target' }] });
  await expect(page.locator('body > ' + player)).toBeVisible();
  await expect(page.locator('.chaley-walkthrough-layer-host')).toHaveCount(0);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.tour.state.status)).toBe('playing');
});
