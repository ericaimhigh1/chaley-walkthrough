# Phase 3 assessment: static highlight, backdrop and targets

**Baseline:** `0.1.0-phase.3`  
**Scope:** Phase 3 of [PROJECT_SPEC.md](../../PROJECT_SPEC.md).  
**Previous baseline:** [Phase 2](PHASE_2.md).  
**Status:** Static rendering implemented. Motion and continuous geometry tracking remain Phase 4.

## 1. Implemented capabilities

| Capability                  | Behaviour                                                                                                                               | Files                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Runtime ID lookup           | Uses getElementById with the leading # removed; no selector parsing or cached target element.                                           | `src/dom/TargetResolver.ts`                          |
| Basic target checks         | Missing/disconnected, no layout box, zero dimensions, invalid coordinates and hidden/collapsed visibility produce recoverable warnings. | `TargetResolver.ts`                                  |
| Persistent static highlight | One reusable outline, positioned from getBoundingClientRect plus configured padding.                                                    | `src/dom/HighlightRenderer.ts`                       |
| Backdrop and cutout         | Default 10% dimming outside a transparent rounded cutout; configurable outline color, radius, padding and opacity.                      | `HighlightRenderer.ts`, `src/styles/walkthrough.css` |
| Lifecycle integration       | Cue changes, start/resume, explicit seeks and status changes reconcile visuals; stop/end/error clear and destroy removes nodes.         | `src/core/Walkthrough.ts`                            |
| Input pass-through          | Overlay receives no pointer events, creates no focusable controls and does not modify or focus targets.                                 | Stylesheet and renderer                              |
| Warning events              | Missing/non-renderable targets clear stale visuals without stopping narration.                                                          | `Walkthrough.ts`, `src/core/types.ts`                |

No public methods, runtime dependencies, application dashboards or external test projects were added. Existing audio methods and event subscriptions remain the interface. DOM modules are internal package implementation details.

## 2. Rendering contract

- Construction creates neither an overlay nor audio. The first drawable active cue creates a root appended to the document body and a single highlight child.
- The root is fixed, clipped to the viewport, aria-hidden and pointer-transparent. The outline has a transparent background; its outer shadow dims the rest of the viewport.
- Default geometry expands the target box by 6px on each side; radius defaults to 8px and outline color to #0039a3. Opacity defaults to 0.1.
- Spotlight renders a static outline/backdrop. Ripple uses that same static appearance until Phase 4 adds rings. No transition or animation is active.
- Effect-none and null targets hide both outline and backdrop. A cue effect overrides the instance default.
- Zero overlay opacity removes dimming while retaining the outline. Zero padding and radius are valid.
- Pause keeps the highlight. Stop, end and fatal audio errors hide the root. Hidden nodes are retained for reuse until destroy; this is intentional, not a leak.
- Destroy removes owned nodes. Destroying an instance that never rendered does not create or remove another instance's DOM.
- Seeking while idle/ended/error still updates state but does not display a highlight. Seeking while loading/playing/paused refreshes geometry, including a same-time seek.
- The renderer resolves the ID again each time it draws. Replacement nodes can be found on subsequent reconciliation without reconstructing the tour.

The stylesheet is required in both ESM and script-tag integrations. The CSS custom properties and precedence are described in [USAGE.md](../USAGE.md#static-highlighting-phase-3).

## 3. Expected errors and warnings

All three new issue codes use the existing error subscription, with `recoverable: true` and the active cue. Each issue-code/target-ID pair warns at most once per instance; warnings do not force error state or reject playback.

| Condition                                             | Expected outcome                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Missing/disconnected ID                               | TARGET_NOT_FOUND; hide previous decoration; narration continues.                               |
| No positive layout box or hidden/collapsed visibility | TARGET_NOT_RENDERABLE; hide previous decoration; narration continues.                          |
| Document body unavailable                             | RENDER_UNAVAILABLE; cannot append overlay; audio may continue. Initialise after DOM readiness. |
| Target null                                           | Clear decoration without warning.                                                              |
| Effect none                                           | Clear decoration without resolving/warning about the target.                                   |
| ID contains punctuation                               | Literal ID resolution; no CSS escaping required.                                               |
| ID duplicated in host                                 | Host configuration error; no uniqueness scan. Supply unique IDs.                               |
| Target restored/replaced                              | Next render can recover; an already-reported warning is not repeated.                          |

Existing configuration and audio error contracts remain unchanged. A warning subscriber may synchronously stop or destroy the tour; rendering must not resurrect a stale overlay afterward.

## 4. Repeatable automated assessment

Run in the library repository:

```sh
npm ci
npm run typecheck
npm test
npm run test:browser
npm pack
```

Use npm.cmd when PowerShell blocks npm.ps1. Browser tests use installed Chrome headlessly. npm pack performs type/unit/build checks but does not run browser tests automatically.

| Test area                | Coverage                                                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit resolver tests      | Literal IDs, runtime replacement, disconnected/missing targets, visibility, absent/zero/invalid geometry.                                                            |
| Audio unit regressions   | Existing lifecycle and clock checks, with rendering mocked at the module boundary.                                                                                   |
| Layout browser fixture   | Real DOM/CSS geometry, default/custom theme, transparent interior, single-node reuse, null/none clearing, warning deduplication, target removal/replacement on seek. |
| Input checks             | Real pointer clicks reach both highlighted and dimmed controls; focus is retained and no library focus target is added.                                              |
| Lifecycle browser checks | Stop/start reuse, repeated destroy cleanup, warning-callback destruction and error/end clearing.                                                                     |
| Real-media regression    | Existing generated-tone tests still use actual browser audio and now assert visible highlighting and completion/error clearing.                                      |
| Visual inspection        | Screenshot of the static spotlight/cutout in the minimal fixture.                                                                                                    |

The layout fixture mocks media to keep geometry checks deterministic; it does not establish audio timing. The separate audio fixture tests real media. Neither fixture is a standalone application or external consumer project.

## 5. Owner assessment

In your existing consumer, import the CSS and use visible elements with unique IDs. Keep the page layout still for this phase's assessment. Use an original or licensed audio file long enough for the timestamps.

```js
import { Walkthrough } from "chaley-walkthrough";
import "chaley-walkthrough/style.css";

const tour = new Walkthrough({
  audio: "/audio/your-recording.mp3",
  defaults: { effect: "spotlight" },
  theme: { overlayOpacity: 0.1, padding: 6, borderRadius: 8 },
  timeline: [
    { time: 0, target: "#first-target" },
    { time: 3, target: "#second-target" },
    { time: 6, target: null },
    { time: 9, target: "#missing-target" },
    { time: 12, target: "#first-target", effect: "none" },
  ],
});
tour.on("error", (issue) => console.warn(issue.code, issue.message));
// In an existing click handler, await tour.start() and handle rejection.
```

1. Start from a user gesture. Expect a clear target surrounded by a rounded outline, with subtle dimming elsewhere.
2. Verify the first/second target highlights match their rectangles plus padding. Movement is instant, not animated.
3. Click a safe highlighted control and another safe control outside the cutout. Both should work; the overlay must not intercept them.
4. Pause. The highlight should remain. Seek to another cue while paused and verify immediate repositioning.
5. Seek to 6 seconds. All decoration should disappear without a target warning.
6. Seek to 9 seconds. Expect one recoverable TARGET_NOT_FOUND warning and no stale highlight. Seek there repeatedly; the warning should not flood the console.
7. Seek to 12 seconds. Effect-none should clear both outline and backdrop.
8. Add the previously missing element, then seek to 9 again. The renderer should find it. Replace an existing target with a new element using the same ID and seek again to verify re-resolution.
9. Hide a target with display:none, then seek to its cue. Expect TARGET_NOT_RENDERABLE and no stale decoration.
10. Try zero/custom opacity, padding, radius and highlight color in a fresh instance. Expect corresponding geometry and colors.
11. Stop, restart, let audio end, and destroy. Stop/end should hide; destroy should remove all owned overlay nodes. On retry, one instance must not accumulate multiple roots.

Automatic trigger binding is not implemented; continue using host click handlers. Test only one playing tour at a time until Phase 8 adds exclusive coordination.

## 6. Verification record

| Check                                 | Recorded result                                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Unit suite                            | Passed: 109 tests in 5 files.                                                                                                           |
| Browser suite                         | Passed: 11 Chrome tests, including final real-media completion/error clearing assertions.                                               |
| Static screenshot                     | Inspected: clear cutout, aligned padding/outline and dimmed surrounding page.                                                           |
| Type checking / package               | Passed: typecheck, production build and npm pack with prepack checks. ESM/IIFE, CSS, declarations and all three phase reports included. |
| Real narration / long-duration timing | Pending. Audio fixture uses a generated tone.                                                                                           |
| External vanilla / React              | Pending owner testing.                                                                                                                  |
| Firefox / Safari / Edge / mobile      | Not tested in this phase.                                                                                                               |

The first layout run exposed an unintended native audio request in the mocked fixture, causing media-error cleanup during geometry assertions. The fixture now prevents that request; separate real-media coverage remains intact. Missing local development dependencies were restored before verification. Initial failed checks are not counted as passes.

## 7. Known limits and troubleshooting

- Continuous geometry tracking is not implemented. Scrolling, resizing, layout movement or target removal during an unchanged cue can leave stale decoration until a cue/status change, seek or resume. Phase 4 adds tracking; this is a static-rendering checkpoint.
- There is no automatic scrolling or clipping-aware visibility assessment yet. An off-screen target can leave the cutout outside the viewport with only backdrop visible. Phase 5 addresses scrolling.
- The basic resolver checks layout/visibility, not ancestor opacity, occlusion or every clipping situation.
- Native dialog top-layer content, iframes, shadow DOM and transformed body/root stacking contexts are unsupported MVP cases. High z-index does not override top-layer rules.
- A missing CSS import prevents correct positioning and pass-through. Import the package stylesheet once and rebuild/restart linked consumers if output is stale.
- Ripple motion, animated transitions, actions, player/caption UI, keyboard player controls and trigger binding are pending. There is no motion in Phase 3, including reduced-motion mode.
- Pointer/focus tests are not an accessibility certification.
- Exclusive playback remains Phase 8. Each instance owns its own root; do not launch multiple tours simultaneously during this phase.

For defects, include the build/version, browser/OS, config, target ID and relevant layout/CSS, exact seek/start sequence, event codes and expected/observed geometry. Avoid private audio URLs or credentials.

## 8. Next phase

Phase 4 adds animated movement, ripple and geometry tracking. It will receive its own capability and assessment document. Scrolling and actions remain later phases.

Later update: the native-dialog limitations recorded at this checkpoint are superseded by [Native dialog support](DIALOG_SUPPORT.md). Other limitations remain as stated.
