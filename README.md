# Chaley Walkthrough

A framework-independent web library for synchronising recorded narration with guided interface highlights.

**Status: Phases 1-8 implemented.** Audio-driven highlights, scrolling, developer-controlled click/long-press actions, a keyboard-operable player with captions, trigger binding and exclusive playback are available. Adding an action opts in; `allowActions: false` explicitly disables it. No element-type safety filtering is applied.

See [usage and development instructions](docs/USAGE.md) and the governing [project specification](PROJECT_SPEC.md).

Phase assessments: [Phase 1 foundation](docs/phases/PHASE_1.md), [Phase 2 audio playback](docs/phases/PHASE_2.md), [Phase 3 static highlighting](docs/phases/PHASE_3.md) and [Phase 4 motion and tracking](docs/phases/PHASE_4.md), [Phase 5 scrolling](docs/phases/PHASE_5.md) and [Phase 6 actions](docs/phases/PHASE_6.md), [Phase 7 player](docs/phases/PHASE_7.md) and [Phase 8 instances](docs/phases/PHASE_8.md). Each phase has its own capabilities, checks and limitations document.

```sh
npm install
npm run typecheck
npm test
npm run build
npm run test:browser
```

Browser tests use installed Chrome in headless mode and minimal automated fixtures. No runtime dependencies. MIT licensed. Package name availability and external vanilla/React compatibility remain unverified. The owner reported successful Phase 1 export testing.
