import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Walkthrough } from '../../src/core/Walkthrough';
import type { CueChangeEvent, WalkthroughIssue } from '../../src/core/types';

declare global {
  interface Window {
    tour: Walkthrough;
    cues: CueChangeEvent[];
    issues: WalkthroughIssue[];
    playError: string | null;
    completeCount: number;
    audioCreates: number;
    ChaleyWalkthrough: { Walkthrough: typeof Walkthrough };
  }
}

// Original generated PCM test tone; no copyrighted recording or external media service.
function wave(): Buffer {
  const rate = 8000;
  const samples = rate * 6;
  const data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) data.writeInt16LE(Math.round(600 * Math.sin(2 * Math.PI * 440 * index / rate)), 44 + index * 2);
  return data;
}

test.beforeEach(async ({ page }) => {
  const audio = wave();
  await page.route('http://walkthrough.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/library.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync('dist/chaley-walkthrough.js') });
    if (path === '/style.css') return route.fulfill({ contentType: 'text/css', body: readFileSync('dist/style.css') });
    if (path === '/library.iife.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync('dist/chaley-walkthrough.iife.js') });
    if (path === '/tone.wav') {
      const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
      if (range) {
        const start = Number(range[1]);
        const end = range[2] ? Math.min(Number(range[2]), audio.length - 1) : audio.length - 1;
        return route.fulfill({ status: 206, contentType: 'audio/wav', headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${audio.length}` }, body: audio.subarray(start, end + 1) });
      }
      return route.fulfill({ contentType: 'audio/wav', headers: { 'Accept-Ranges': 'bytes' }, body: audio });
    }
    if (path === '/broken.wav') return route.fulfill({ status: 404, body: 'missing audio' });
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><link rel="stylesheet" href="/style.css"><button id="start">Start</button><button id="resume">Resume</button><button id="restart">Replay</button><div id="one">First target</div><div id="two">Second target</div><div id="four">Fourth target</div>' });
  });
  await page.goto('http://walkthrough.test/');
  await page.evaluate(async () => {
    // A minimal library fixture, not an application or external consumer project.
    const moduleUrl = '/library.js';
    const { Walkthrough } = await import(/* @vite-ignore */ moduleUrl) as typeof import('../../src/core/Walkthrough');
    window.audioCreates = 0;
    const create = document.createElement.bind(document);
    document.createElement = ((name: string, options?: ElementCreationOptions) => {
      if (name === 'audio') window.audioCreates++;
      return create(name, options);
    }) as typeof document.createElement;
    window.tour = new Walkthrough({ audio: '/tone.wav', timeline: [
      { time: 0, target: '#one' }, { time: 1, target: '#two' }, { time: 2, target: null }, { time: 3, target: '#four' },
    ] });
    window.cues = []; window.issues = []; window.playError = null; window.completeCount = 0;
    window.tour.on('cuechange', event => window.cues.push(event));
    window.tour.on('error', issue => window.issues.push(issue));
    window.tour.on('complete', () => window.completeCount++);
    for (const [id, method] of [['start', 'start'], ['resume', 'resume'], ['restart', 'restart']] as const) {
      document.getElementById(id)!.onclick = () => { void window.tour[method]().catch(error => { window.playError = error.name; }); };
    }
  });
});

test.afterEach(async ({ page }) => { await page.evaluate(() => window.tour?.destroy()); });

test('real audio drives cues, pause/resume, seeking, completion and replay', async ({ page }) => {
  expect(await page.evaluate(() => window.audioCreates)).toBe(0);
  await page.click('#start');
  await expect.poll(() => page.evaluate(() => window.tour.state.status)).toBe('playing');
  await expect.poll(() => page.evaluate(() => window.tour.state.activeCue?.target), { timeout: 8000 }).toBe('#four');
  await expect(page.locator('.chaley-walkthrough-root')).toBeVisible();
  const cues = await page.evaluate(() => window.cues.filter(event => event.cue).map(event => ({ cueTime: event.cue!.time, clock: event.state.currentTime })));
  expect(cues.map(cue => cue.cueTime)).toEqual([0, 1, 2, 3]);
  for (const cue of cues) expect(Math.abs(cue.clock - cue.cueTime)).toBeLessThan(0.5);
  await page.evaluate(() => window.tour.pause());
  const paused = await page.evaluate(() => window.tour.state.currentTime);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.tour.state.currentTime)).toBe(paused);
  await page.evaluate(() => window.tour.seek(1.2));
  expect(await page.evaluate(() => window.tour.state.activeCue?.target)).toBe('#two');
  expect(await page.evaluate(() => window.tour.state.status)).toBe('paused');
  await page.click('#resume');
  await expect.poll(() => page.evaluate(() => window.tour.state.currentTime)).toBeGreaterThan(1.2);
  await page.evaluate(() => window.tour.seek(5.7));
  await expect.poll(() => page.evaluate(() => window.tour.state.status)).toBe('ended');
  expect(await page.evaluate(() => window.completeCount)).toBe(1);
  expect(await page.evaluate(() => window.tour.state.activeCue)).toBeNull();
  await expect(page.locator('.chaley-walkthrough-root')).toBeHidden();
  await page.click('#restart');
  await expect.poll(() => page.evaluate(() => window.tour.state.status)).toBe('playing');
  expect(await page.evaluate(() => window.tour.state.currentTime)).toBeLessThan(1);
  await page.evaluate(() => window.tour.stop());
  expect(await page.evaluate(() => window.tour.state)).toMatchObject({ status: 'idle', currentTime: 0, activeCue: null });
  expect(await page.evaluate(() => window.issues)).toEqual([]);
});

test('real missing audio reports error and rejects start', async ({ page }) => {
  await page.evaluate(async () => {
    window.tour.destroy();
    const moduleUrl = '/library.js';
    const { Walkthrough } = await import(/* @vite-ignore */ moduleUrl) as typeof import('../../src/core/Walkthrough');
    window.tour = new Walkthrough({ audio: '/broken.wav', timeline: [{ time: 0, target: '#one' }] });
    window.tour.on('error', issue => window.issues.push(issue));
  });
  await page.click('#start');
  await expect.poll(() => page.evaluate(() => window.tour.state.status)).toBe('error');
  expect(await page.evaluate(() => window.issues[0]?.code)).toBe('MEDIA_ERROR');
  await expect(page.locator('.chaley-walkthrough-root')).toBeHidden();
});

test('IIFE browser build supports user-initiated audio', async ({ page }) => {
  await page.addScriptTag({ url: 'http://walkthrough.test/library.iife.js' });
  await page.evaluate(() => {
    window.tour.destroy();
    window.tour = new window.ChaleyWalkthrough.Walkthrough({ audio: '/tone.wav', timeline: [] });
  });
  await page.click('#start');
  await expect.poll(() => page.evaluate(() => window.tour.state.currentTime)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.tour.state.status)).toBe('playing');
});
