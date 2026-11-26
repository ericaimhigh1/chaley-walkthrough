# Chaley Walkthrough

A framework-independent web library for synchronising recorded narration with guided interface highlights.

**Status: Phase 4 animated highlighting.** Audio playback, lifecycle controls, cue/state subscriptions, runtime ID resolution, animated highlights, ripple, backdrop and geometry tracking are implemented. Automatic scrolling, actions, the player, trigger binding and exclusive playback remain for later phases.

See [usage and development instructions](docs/USAGE.md) and the governing [project specification](PROJECT_SPEC.md).

Phase assessments: [Phase 1 foundation](docs/phases/PHASE_1.md), [Phase 2 audio playback](docs/phases/PHASE_2.md), [Phase 3 static highlighting](docs/phases/PHASE_3.md) and [Phase 4 motion and tracking](docs/phases/PHASE_4.md). Each phase has its own capabilities, checks and limitations document.

```sh
npm install
npm run typecheck
npm test
npm run build
npm run test:browser
```

Browser tests use installed Chrome in headless mode and minimal automated fixtures. No runtime dependencies. MIT licensed. Package name availability and external vanilla/React compatibility remain unverified. The owner reported successful Phase 1 export testing.
