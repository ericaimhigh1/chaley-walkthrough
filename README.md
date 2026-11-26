# Chaley Walkthrough

A framework-independent web library for synchronising recorded narration with guided interface highlights.

**Status: 0.1.0-rc.1, unpublished. Phase 9 release preparation is implemented; Phase 10 handoff is ready, with React acceptance pending.** Audio-driven highlights, scrolling, developer-controlled click/long-press actions, a keyboard-operable player with captions, trigger binding and exclusive playback are available. Adding an action opts in; `allowActions: false` explicitly disables it. No element-type safety filtering is applied.

See [usage and development instructions](docs/USAGE.md) and the governing [project specification](PROJECT_SPEC.md).

Phase assessments: [Phase 1 foundation](docs/phases/PHASE_1.md), [Phase 2 audio playback](docs/phases/PHASE_2.md), [Phase 3 static highlighting](docs/phases/PHASE_3.md) and [Phase 4 motion and tracking](docs/phases/PHASE_4.md), [Phase 5 scrolling](docs/phases/PHASE_5.md) and [Phase 6 actions](docs/phases/PHASE_6.md), [Phase 7 player](docs/phases/PHASE_7.md) and [Phase 8 instances](docs/phases/PHASE_8.md), [Phase 9 package checks](docs/phases/PHASE_9.md) and [Phase 10 owner handoff](docs/phases/PHASE_10.md). Each phase has its own capabilities, checks and limitations document.

```sh
npm ci
npm run check
```

Package tests verify exports, declarations and the npm archive, then run minimal browser fixtures against its extracted contents. Local default: installed Chrome; other browser configurations are available. No runtime dependencies. MIT licensed.

The owner reports successful separate vanilla testing. React, Safari and real mobile assessment remain pending. See [release readiness](docs/RELEASE_CHECKLIST.md), [contribution guidance](CONTRIBUTING.md) and [changelog](CHANGELOG.md). Nothing has been published.
