# Phase 1 assessment: package foundation and timeline logic

**Baseline:** `0.1.0-phase.1`  
**Status:** Implemented; automated foundation checks passed. Owner reports that export testing works.  
**Governing specification:** [PROJECT_SPEC.md](../../PROJECT_SPEC.md), particularly Sections 3, 4, 10–13 and 15.

This document records capabilities at the end of Phase 1. Later phase reports should describe their own additions and changes; this report remains a baseline for regression assessment. [USAGE.md](../USAGE.md) describes the current package.

## 1. Implemented capabilities

| Capability               | Phase 1 behaviour                                                                                                                     | Assessment location                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Public class             | Named `Walkthrough` export. Browser-only construction validates and stores an owned configuration snapshot.                           | `src/core/Walkthrough.ts`, export tests        |
| ESM distribution         | `import { Walkthrough } from 'chaley-walkthrough'` resolves to the built ESM file.                                                    | `package.json`, `dist/chaley-walkthrough.js`   |
| Browser distribution     | IIFE exposes `ChaleyWalkthrough.Walkthrough`.                                                                                         | `dist/chaley-walkthrough.iife.js`              |
| Separate CSS             | `chaley-walkthrough/style.css` resolves to generated CSS. This is a minimal namespaced stylesheet, not a working highlight or player. | `src/styles/walkthrough.css`, `dist/style.css` |
| Type declarations        | Public configuration, cue, theme and state types are generated with the build.                                                        | `src/core/types.ts`, `dist/index.d.ts`         |
| SSR-safe imports         | Importing the built module does not require `document` or `window`. Constructing without `document` throws a descriptive error.       | Export tests and built ESM smoke check         |
| Configuration validation | Required fields, ID syntax, enums, numeric bounds, actions and unknown fields are checked synchronously.                              | `src/core/validation.ts`, validation tests     |
| Configuration ownership  | Validated configuration, nested options, cues, actions and timeline are copied and frozen. The caller's object remains mutable.       | Validation tests                               |
| Timeline lookup          | Internal binary search selects the latest cue at or before a supplied time. It has no audio, DOM or timer dependency.                 | `src/core/Timeline.ts`, timeline tests         |
| Development builds       | `npm run dev` rebuilds distributable JavaScript, CSS and declarations, including after type-only source changes.                      | `vite.config.ts`, watch-mode check             |
| Package preparation      | `npm pack` runs type checking, tests and the build before creating a local archive. No publication occurs.                            | `package.json`, package verification           |

There are no runtime dependencies. TypeScript, Vite, Vitest and Node type declarations are development dependencies. No test application or dashboard is included.

## 2. Public API boundary

The only runtime package export in Phase 1 is `Walkthrough`. Its constructor accepts `WalkthroughConfig`. It does not expose a public configuration getter.

The following are type-only exports:

- `WalkthroughConfig`, `WalkthroughTheme`, `WalkthroughState`, `WalkthroughStatus`
- `TimelineCue`, `CueOptions`, `CueAction`
- `IdReference`, `Effect`, `Transition`

`WalkthroughState` defines read-only `status`, `currentTime`, `duration` and `activeCue`. Unknown duration is represented by `null`. This is a type contract only; a runtime state getter and subscriptions are not present in Phase 1.

Validation and timeline functions are internal modules, not supported package imports. Assess them through the repository's unit tests.

## 3. Configuration rules to assess

| Input                                 | Accepted behaviour                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audio`                               | Required non-empty string. Reachability, URL syntax, codec support and actual media duration are not checked in this phase.                       |
| `timeline`                            | Required array. Empty arrays are accepted. Sparse entries are rejected.                                                                           |
| Cue `time`                            | Required finite, non-negative number. Fractional seconds are accepted. Timestamps must be strictly increasing; input is not automatically sorted. |
| Cue `target`                          | Required `null` or a non-empty literal ID prefixed with `#`, without ASCII whitespace. Punctuation in IDs is accepted.                            |
| `trigger`                             | Optional ID reference with the same syntax. Its existence is not checked and no listener is bound yet.                                            |
| `caption`                             | Optional string, including an empty string. Markup remains a string; there is no caption renderer yet.                                            |
| `allowActions`                        | Boolean; defaults to `false`. Valid action descriptors do not implicitly enable actions.                                                          |
| `scroll`                              | Boolean; defaults to `true`.                                                                                                                      |
| `effect`                              | `ripple`, `spotlight` or `none`; defaults to `ripple`.                                                                                            |
| `transition`                          | `move` or `instant`; defaults to `move`.                                                                                                          |
| `transitionDuration`                  | Finite non-negative milliseconds; defaults to `400`. Zero is accepted.                                                                            |
| `theme.overlayOpacity`                | Finite number from `0` to `1` inclusive; defaults to `0.1`.                                                                                       |
| `theme.highlightColor`                | Non-empty string; defaults to `#0039a3`. CSS color syntax is not parsed in Phase 1.                                                               |
| `theme.padding`, `theme.borderRadius` | Finite non-negative pixel values; defaults to `6` and `8` respectively.                                                                           |
| Click action                          | `{ type: 'click' }`. Supplying `holdDuration` is rejected.                                                                                        |
| Long-press action                     | `{ type: 'longpress', holdDuration: 800 }`, with a finite positive hold duration.                                                                 |
| Action target                         | Must be non-null, even when actions are disabled.                                                                                                 |
| Unknown fields                        | Rejected at configuration, defaults, theme, cue and action levels.                                                                                |

Cue-level visual options are validated and preserved. Their eventual application over instance defaults belongs to the rendering phases. DOM ID uniqueness and target existence are host/runtime concerns, not Phase 1 validation checks.

## 4. Timeline expectations

For cue times `[1, 2.5, 4, 8]`, the internal lookup must produce:

| Clock in seconds | Active cue index                         |
| ---------------- | ---------------------------------------- |
| `0`              | `-1` (no cue)                            |
| `1`              | `0`                                      |
| `2.4999`         | `0`                                      |
| `2.5`            | `1`                                      |
| `4`              | `2`, even if that cue has `target: null` |
| `8`              | `3`                                      |
| `999`            | `3`                                      |

An empty timeline returns index `-1` and cue `null`. A first cue at time zero is selected at zero. Backward and forward queries are independent of previous calls. Negative and non-finite clock values throw `RangeError`.

The helper does not know audio duration. Returning the last cue after its timestamp is expected; clearing on media completion belongs to Phase 2. These tests establish lookup correctness, not real-audio synchronisation or drift performance.

## 5. Repeatable assessment steps

Run these commands from the library repository. On PowerShell installations that block `npm.ps1`, substitute `npm.cmd` for `npm`.

| Step                 | Command/action                           | Expected result                                                                                                                                    |
| -------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install dependencies | `npm ci` with the committed lockfile     | Dependencies install successfully. Requires registry access if not cached.                                                                         |
| Check types          | `npm run typecheck`                      | Exit code zero; no TypeScript errors.                                                                                                              |
| Run unit tests       | `npm test`                               | Phase 1 baseline: 3 test files, 65 passing tests. Later phases may increase the count.                                                             |
| Build                | `npm run build`                          | ESM, IIFE, CSS and declarations appear under `dist/`.                                                                                              |
| Check watch mode     | `npm run dev`, then save a source change | Rebuild occurs. Saving a type-only change also regenerates declarations. Revert any temporary edit and stop with Ctrl+C.                           |
| Verify package       | Stop watch mode, then run `npm pack`     | Prepack checks pass and a `.tgz` archive is created. The package contains built output, usage documentation, README, licence and package metadata. |

Keep temporary assessment edits within this repository and restore them afterward. `dev` is a build watcher, not an application server.

### Browser construction check

Use an already owner-created consumer environment. This snippet is an assessment instruction, not a request to scaffold another application:

```js
import { Walkthrough } from "chaley-walkthrough";
import "chaley-walkthrough/style.css";

const tour = new Walkthrough({
  audio: "/audio/tour.mp3",
  timeline: [
    { time: 0, target: null, caption: "Welcome." },
    { time: 2.5, target: "#wallet" },
  ],
});

console.assert(tour instanceof Walkthrough);
```

Expected: construction succeeds. No audio request, playback, highlight, scrolling, click or player appears. The audio URL and target need not exist for this Phase 1 check because they are not resolved yet.

For script-tag assessment, serve `dist/chaley-walkthrough.iife.js` and `dist/style.css` as described in [USAGE.md](../USAGE.md#direct-script-tags). The expected constructor is `ChaleyWalkthrough.Walkthrough`.

### Error checks

Run constructor checks in a browser; outside a browser, the environment error occurs before configuration validation.

| Deliberate error                                             | Expected result                                                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `audio: ''`                                                  | `TypeError` identifying `config.audio`.                                                       |
| Two cues with the same timestamp                             | `TypeError` identifying the later cue's `.time` and requiring strictly increasing timestamps. |
| Descending timestamps                                        | Same ordering error; no automatic sorting.                                                    |
| Negative, `NaN` or infinite cue time                         | `TypeError` identifying the cue's `.time`.                                                    |
| `target: 'wallet'`, `target: '#'`, or a missing target field | `TypeError` identifying `.target`.                                                            |
| `theme: { overlayOpacity: 1.1 }`                             | `TypeError` identifying `config.theme.overlayOpacity`.                                        |
| `defaults: { effect: 'flash' }`                              | `TypeError` identifying `config.defaults.effect`.                                             |
| `allowActions: 'true'`                                       | `TypeError` identifying `config.allowActions`.                                                |
| Long press with `holdDuration: 0`                            | `TypeError` requiring a positive hold duration.                                               |
| Click action on `target: null`                               | `TypeError` stating the action requires a target.                                             |
| An unknown configuration key                                 | `TypeError` identifying the unknown field.                                                    |
| Construct with no browser `document`                         | `Error`: `Instantiate Walkthrough only in a browser. Module imports are SSR-safe.`            |

## 6. Verification record

These are recorded Phase 1 results, not claims that checks were rerun whenever this document is read.

| Check                                             | Recorded result    | Evidence/qualification                                                                                             |
| ------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Type checking                                     | Passed             | `npm run typecheck` and prepack type check.                                                                        |
| Unit tests                                        | Passed             | 65 tests across `validation.test.ts`, `timeline.test.ts` and `exports.test.ts`.                                    |
| Production build                                  | Passed             | ESM, IIFE, CSS and declarations generated.                                                                         |
| Watch rebuild                                     | Passed after a fix | Type-only source modification triggered rebuilds and refreshed declaration timestamps.                             |
| Built ESM import                                  | Passed             | Node smoke check imported the package without browser globals.                                                     |
| IIFE global                                       | Passed in Node VM  | Verified `ChaleyWalkthrough.Walkthrough`; this was not a real-browser test.                                        |
| CSS export/declaration entry                      | Passed             | CSS export resolved; public declaration entry did not retain an unresolved source CSS import.                      |
| Package archive                                   | Passed             | `npm pack` completed after rerunning outside sandbox restrictions.                                                 |
| Owner export assessment                           | Reported working   | Owner stated: “I tested the exports and it works.” Specific browser, framework and export paths were not supplied. |
| Full external vanilla/React integration           | Pending            | Export success alone does not establish playback, React lifecycle or complete integration compatibility.           |
| Chrome, Firefox, Safari, Edge and mobile coverage | Pending            | No complete browser matrix executed.                                                                               |

## 7. Troubleshooting and known limits

| Symptom                                                       | Interpretation / next check                                                                                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nothing visible or audible after construction                 | Expected in Phase 1. This is a configuration scaffold.                                                                                                                    |
| `tour.start is not a function` or no `destroy` method         | Expected in the Phase 1 baseline. Playback/lifecycle methods have not been implemented.                                                                                   |
| A configured trigger does nothing                             | Expected until trigger binding is implemented in Phase 8.                                                                                                                 |
| A nonexistent target or audio URL is accepted                 | Expected. Phase 1 validates data shape, not DOM existence or media availability.                                                                                          |
| CSS imports but no player appears                             | Expected. Stylesheet packaging is implemented; player UI is not.                                                                                                          |
| Linked consumer shows stale output                            | Confirm the library was built; restart the consumer dev server or clear its dependency cache.                                                                             |
| PowerShell blocks `npm.ps1`                                   | Use `npm.cmd` or `cmd /c npm`; changing system execution policy is unnecessary.                                                                                           |
| Installation reports `ENOTCACHED` in a restricted environment | Registry access is needed; the sandbox initially lacked the required cached packages.                                                                                     |
| Test subprocess reports `spawn EPERM`                         | Process execution was blocked during the initial sandboxed prepack attempt. Rerun with the environment's approved process permissions. This is not a passing test result. |

Phase 1 does not assess audio loading, rejected play promises, media state transitions, cue synchronisation, seeking, completion, action safety at runtime, highlighting, scrolling, accessibility, captions, reduced motion, trigger conflicts or exclusive playback. Those capabilities must be assessed in their implementation phases.

## 8. Defect reporting and next phase

For a suspected Phase 1 defect, record:

1. Package version and import path/build format.
2. Node/npm versions, operating system, and browser/framework if relevant.
3. The smallest configuration and command/snippet that reproduces the issue.
4. Expected behaviour from this report versus actual behaviour.
5. Full error message and relevant test/build output.

Do not include credentials or private audio URLs in shared reports.

Phase 2 is authorised next: audio playback, lifecycle state, media-clock-driven cue synchronisation and cancellation. Its assessment file will document the implemented API, reproducible checks, expected errors, recorded results and remaining limitations using the same structure. The governing phase order and external testing boundary remain unchanged.
