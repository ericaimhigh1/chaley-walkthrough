import { defineConfig } from '@playwright/test';
import type { Project } from '@playwright/test';
const available: Record<string, Project> = {
  chrome: { name: 'chrome', use: { browserName: 'chromium', channel: 'chrome' } },
  edge: { name: 'edge', use: { browserName: 'chromium', channel: 'msedge' } },
  chromium: { name: 'chromium', use: { browserName: 'chromium' } },
  firefox: { name: 'firefox', use: { browserName: 'firefox' } },
  webkit: { name: 'webkit', use: { browserName: 'webkit' } },
};
const selected = process.env.CHALEY_BROWSER ?? 'chrome';
if (!available[selected]) throw new Error(`Unknown CHALEY_BROWSER: ${selected}`);
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 30_000,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { headless: true, trace: 'retain-on-failure' },
  projects: [available[selected]!],
});
