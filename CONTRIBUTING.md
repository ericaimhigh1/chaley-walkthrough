# Contributing

Read [PROJECT_SPEC.md](PROJECT_SPEC.md) and [USAGE.md](docs/USAGE.md) first. Keep this repository a standalone library. Do not add dashboards, external consumer projects, runtime dependencies or unrelated features without agreement. Minimal automated fixtures are allowed.

## Setup and checks

Use Node 22.12+ (or a newer supported release) and npm. CI selects Node 24. The package's browser runtime is independent of the development Node version.

```sh
npm ci
npm run typecheck
npm test
npm run test:package
```

The package check builds, creates an archive, verifies its allowlist/exports/SSR/declarations, then runs browser tests against extracted files. Local runs default to installed Chrome. `tar` must be available (provided by current Windows and the Linux CI runner). Generated fixtures remain under ignored `.package-check/`; no consumer app is created. `npm run dev` watches and rebuilds library output only.

For another browser, set CHALEY_BROWSER to chrome, edge, chromium, firefox or webkit. Install Playwright-managed binaries before selecting chromium/firefox/webkit:

```sh
npx playwright install chromium firefox webkit
```

PowerShell example:

```powershell
$env:CHALEY_BROWSER = 'edge'
npm.cmd run test:package
Remove-Item Env:CHALEY_BROWSER
```

The GitHub workflow runs packaged checks for Chromium, Firefox and WebKit, retains reports and never publishes. Configuring CI is not evidence it has run. WebKit coverage is not equivalent to testing Safari on Apple hardware. See [release assessment](docs/RELEASE_CHECKLIST.md) for actual results.

## Changes and reports

Add a regression test for meaningful behavior changes. Use deterministic media clocks for lifecycle assertions and real media tests for playback integration. Never report browser or external framework results unless executed. Maintain usage, changelog and the relevant phase assessment. Keep audio original or licensed. Use issue templates with reproducible configurations; avoid private URLs or secrets.

## Release

Follow [RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md). Publication is a separate owner action after external testing and metadata/name ownership checks. Do not add invented repository URLs, maintainers or test results.

CI setup references: [Playwright CI](https://playwright.dev/docs/ci), [GitHub Node setup](https://github.com/actions/setup-node). No publishing credentials are required by the workflow.
