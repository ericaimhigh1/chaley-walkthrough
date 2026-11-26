# Phase 4 assessment: animated movement, ripple and geometry tracking

**Baseline:** `0.1.0-phase.4`  
**Scope:** Phase 4 of [PROJECT_SPEC.md](../../PROJECT_SPEC.md).  
**Previous baseline:** [Phase 3](PHASE_3.md).  
**Status:** Motion and tracking implemented. Automatic scrolling remains Phase 5.

## 1. Implemented capabilities

| Capability | Behaviour | Files |
| --- | --- | --- |
| Animated movement | Natural cue changes interpolate position, dimensions and radius using the configured transition/duration. | `src/dom/HighlightRenderer.ts`, `src/core/Walkthrough.ts` |
| Ripple | Two expanding, fading decorative rings around the persistent highlight; no pointer interception. | `src/styles/walkthrough.css` |
| Geometry tracking | Target box checked once per visible frame, including paused/buffering playback. ResizeObserver, captured scroll and window resize share the frame queue. | `HighlightRenderer.ts` |
| Runtime replacement | Removed/hidden targets clear promptly; restored/replaced IDs are found without seeking. | Renderer and existing resolver |
| Reduced motion | Initial and live preference changes suppress ripple and force instant positioning. | Renderer and stylesheet |
| Cancellation | Seek, cue changes, stop, target loss, hidden documents and destruction cannot leave stale movement callbacks controlling a newer cue. | Renderer and lifecycle integration |
| Cleanup | Frames, ResizeObserver targets, media-query listeners and scroll/resize/visibility listeners are released when decoration is cleared. | Renderer |

No public methods or runtime dependencies were added. Existing effect, transition and transitionDuration options now drive motion. No external application or dashboard was created. Phase 1–3 reports remain historical records; [USAGE.md](../USAGE.md) describes current behaviour.

## 2. Motion contract

| Situation | Expected behaviour |
| --- | --- |
| First visible target | Appears at its target immediately, with no movement from an arbitrary origin. |
| Natural cue change with move | Moves from the current rendered outline to the next box; default duration 400ms, ease-in-out. |
| Cue-level transition/duration | Overrides the instance default. Instant or duration zero positions immediately. |
| Rapid natural cue changes | Cancels the previous movement and starts from its current visible position; one movement animation at a time. |
| Seek or recovery | Immediately reconciles geometry; no animation across skipped targets. |
| Pause | Snaps movement to its destination and pauses ripple. Tracking remains active so host scrolling/resizing stays aligned. |
| Resume | Ripple resumes; the cue remains at its current target. |
| Target moves during transition | Cancels movement and follows the new target box immediately. Scroll events do not continually restart transitions. |
| Ripple effect | Two fading rings with 1600ms cycles staggered by 800ms. The outline/backdrop remain. |
| Spotlight effect | Outline/backdrop only, with movement if configured. |
| None or null target | Clears decoration, animations and tracking. |
| Reduced motion | No ripple; instant positioning. A live switch to reduce cancels movement immediately. |
| Stop/end/fatal audio error | Hides reusable nodes and releases visual work. |
| Destroy | Also removes owned nodes; idempotent and terminal. |

Movement uses the browser's Web Animations API; decorative rings use namespaced CSS keyframes. The outline node is reused. No timers schedule the timeline independently of audio.

## 3. Tracking and error behaviour

The renderer samples the current target during each visible animation frame. ResizeObserver and scroll/resize events queue through that same pending frame. It resolves the ID each time so removal, replacement, layout shifts and CSS transforms are detected without a DOM-wide mutation observer. Geometry styles are only rewritten when needed.

Tracking continues while paused or buffering. A missing/hidden target hides the root but retains tracking for its active cue, allowing automatic recovery. Hidden documents suspend frames and pause ripple; visibility recovery snaps to current geometry.

Warnings remain `TARGET_NOT_FOUND`, `TARGET_NOT_RENDERABLE` and `RENDER_UNAVAILABLE`, deduplicated by issue-code/ID per instance. Warning callbacks can now occur during geometry tracking, not just lifecycle calls. They remain recoverable and do not advance the cue or interrupt audio. A warning handler may stop/destroy; no later tracking callback may recreate the overlay.

Tracking is intentionally limited to one target per active instance. It incurs a layout/visibility read each visible frame, even while paused; complex host pages still need performance assessment. It does not scroll the host or detect all clipping/occlusion cases.

## 4. Automated assessment

```sh
npm ci
npm run typecheck
npm test
npm run test:browser
npm pack
```

Run in the library repository. Use npm.cmd when PowerShell blocks npm.ps1. Browser tests require installed Google Chrome and run headlessly. npm pack includes type/unit/build checks, but browser tests run separately.

| Test group | Assessment |
| --- | --- |
| Existing unit suite | Configuration, timeline lookup, audio lifecycle and target-resolution regressions. |
| Existing real-media fixture | Real audio-clock progression, seeking, completion, errors and packaged ESM/IIFE. |
| Existing layout fixture | Geometry, themes, input pass-through, node reuse and lifecycle cleanup. |
| New motion fixture | Midpoint position/size, keyframes and duration, rapid changes, instant/zero overrides, ripple, pause/resume and live reduced motion. |
| Tracking fixture checks | Document and nested scrolling, target size/transform changes, viewport resize, automatic removal/hidden/replacement recovery. |
| Resource instrumentation | One observer target, coalesced event work, no remaining frames/listeners/observations after stop/destroy; no geometry reads after stop. |
| Visibility simulation | Frames suspended while hidden and current geometry restored when visible. This is a synthetic visibility event, not a claim of OS background testing. |

The new fixture uses a deterministic media clock with real DOM layout, CSS animations and browser Web Animations. The separate audio fixture retains actual media playback. Screenshots capture a movement midpoint and ripple appearance; animation assertions verify more than a static screenshot alone.

## 5. Owner assessment in an existing consumer

Import the package stylesheet. Use safe existing elements and an original/licensed recording. For movement assessment, keep targets on screen; automatic scrolling is not implemented yet.

```js
const tour = new Walkthrough({
  audio: '/audio/your-recording.mp3',
  defaults: { effect: 'ripple', transition: 'move', transitionDuration: 600 },
  timeline: [
    { time: 0, target: '#first-target' },
    { time: 3, target: '#second-target' },
    { time: 6, target: '#third-target', effect: 'spotlight', transitionDuration: 900 },
    { time: 9, target: '#first-target', transition: 'instant' },
    { time: 12, target: null },
  ],
});
tour.on('error', issue => console.warn(issue.code, issue.message));
// In an existing button's click handler: await tour.start(), handling rejection.
```

1. Let playback naturally cross cue boundaries. Expect smooth movement and size changes; seeking intentionally snaps and is not a movement-animation test.
2. Verify ripple rings expand/fade without obscuring the target. At the spotlight cue, rings disappear while the outline/backdrop remain.
3. Confirm the instant cue jumps to its target, and the null cue clears all decoration.
4. Pause mid-transition. Expect the outline to settle at the selected target and ripple to pause. Resume and verify ripple continues.
5. While paused, manually scroll the page and a nested scroll container. The outline should follow the target without repeated easing or lagging transition restarts.
6. Resize the target, change the viewport width and apply a CSS transform or sibling layout shift. Expect matching highlight geometry.
7. Remove the target or hide it. Expect prompt clearing and one warning. Restore/replace an element with the same ID; it should reappear without seeking.
8. Turn on the operating system/browser reduced-motion preference. Movement should become instant and ripple disappear, including when changed during playback.
9. Seek rapidly during movement, stop, restart and destroy. Expect no old transition to move a newer highlight or recreate destroyed nodes.
10. Switch tabs and return. Expect current geometry on return. Browser/OS media suspension can affect audio independently.

Check clicks and keyboard focus still work on host controls. Continue testing one playing instance at a time until Phase 8 adds coordination. Handle asynchronous start/resume/restart rejections as documented in USAGE.md.

## 6. Verification record

| Check | Result |
| --- | --- |
| Unit tests | Passed: 109 tests across 5 files. |
| Browser tests | Passed: 23 Chrome tests, including coalescing and simulated visibility recovery. |
| Type checking / build | Passed: final typecheck and production build. |
| Visual inspection | Movement-midpoint and ripple screenshots inspected. |
| Package / SSR import | Passed: npm pack including prepack checks; built ESM imports without browser globals. Archive includes all four phase reports. |
| Real narration / long-duration drift | Pending; real-media fixture uses a generated tone. |
| External vanilla / React / StrictMode | Pending owner testing; DOM replacement tests are not React integration evidence. |
| Firefox / Safari / Edge / mobile | Not tested. |

## 7. Limits and troubleshooting

- Automatic scrolling and clipping-aware visibility are Phase 5. Targets can be highlighted off-screen or outside a clipped ancestor; no scrolling is triggered yet.
- If movement appears instant, check reduced motion, transition instant/zero, seek/recovery, paused status, first appearance, or target geometry changing during movement. These intentionally settle immediately.
- Ripple is decorative and fixed at two staggered 1600ms cycles; no new ripple timing configuration is exposed.
- Dynamic target changes reconcile on the next available visible animation frame, not synchronously with the host's DOM mutation.
- Transformed body/root stacking contexts, native dialogs/top-layer content, iframes and shadow DOM remain unsupported MVP cases.
- The renderer uses ResizeObserver, matchMedia and Web Animations available in the tested Chrome environment; the remaining browser matrix is unverified.
- Accessibility compliance, complex-page performance and actual OS background behaviour are not established by the automated fixture results.
- Actions, captions/player UI, trigger binding and exclusive playback are still scheduled later.

For defects, record the version/build, browser/OS, reduced-motion setting, effect/transition config, exact cue and lifecycle sequence, relevant layout/scroll containers, expected/observed geometry, and warning codes. Avoid sharing private audio URLs or credentials.

## 8. Next phase

Phase 5 adds automatic scrolling, visibility checks and cancellation of stale scrolling work. It will receive its own capabilities and assessment document.
