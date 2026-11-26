# Phase 6 assessment: opt-in actions

**Baseline:** `0.1.0-phase.6`, including Phase 5. Scope follows [PROJECT_SPEC.md](../../PROJECT_SPEC.md). Previous: [Phase 5 scrolling](PHASE_5.md).

> Historical baseline: the owner revised the action policy in Phase 7. See [Phase 7](PHASE_7.md) and [current usage](../USAGE.md): adding an action now opts in, and element-type restrictions have been removed.

## Implemented capabilities

| Capability | Contract |
| --- | --- |
| Explicit opt-in | `allowActions` defaults to false. Validation still checks action descriptors when disabled. |
| Click | Calls `HTMLElement.click()` only after resolving a visible target, scrolling and settling its highlight. |
| Long press | Synthetic pointerdown, configured hold, pointerup; cancellation sends pointercancel to release host press state. |
| Safety | Blocks anchors, areas, labels, submit/reset controls, disabled controls and inert/aria-disabled ancestors. Use explicit type=button. |
| Deduplication | At most one attempt per cue per run; cancelled or blocked attempts do not retry. Fresh start/restart resets the run. |
| Seeking and recovery | No action simply from seeking; no missed-action backlog after buffering or hidden-tab recovery. |
| Cleanup | Pause, seek, cue change, buffering, hidden tab, stop, completion and destroy cancel pending action work. Target removal/replacement, invisibility or disabling cancels a held press. |

New implementation: `src/dom/ActionExecutor.ts`; integration in `Walkthrough.ts`, readiness in `HighlightRenderer.ts`, recoverable warning types in `types.ts`. Tests: `tests/unit/actions.test.ts`, `tests/browser/scroll-actions.spec.ts`, real-media regression in `tests/browser/audio.spec.ts`. README, usage, package version and lockfile updated. No runtime dependencies or external applications added.

## Detailed action contract

Only natural playback and an initial start can make a cue eligible. Actions execute while playing in a visible document. They wait for scroll completion and settled decoration; effect=none explicitly skips decoration. Readiness is bounded at two seconds plus configured transition duration after scrolling. A missing, blocked or unready target emits `ACTION_SKIPPED`; lifecycle cancellation is silent. `SCROLL_INCOMPLETE` is the separate Phase 5 warning. Both are recoverable and narration continues.

Pause cancels rather than suspends an action. A cancelled hold is not resumed or retried. Seeking cannot reconstruct UI created by earlier actions. A future natural entry into an unattempted cue can run its action; completed attempts never repeat until a fresh run.

The pointer sequence bubbles, is cancelable/composed, uses pointerId=1, pointerType=touch, isPrimary=true, button=0 and target-centre coordinates. Down uses buttons=1; up/cancel uses buttons=0. Events are untrusted. No click, mouse sequence or native context menu is synthesized after the hold. Host handlers must accept pointercancel, including cancellation dispatched directly on a detached target. React delegation on detached nodes needs separate testing.

Use only non-destructive UI demonstrations such as menus, tabs, accordions and modals. Never automate payments, deletion, submission or navigation. Safety checks cannot detect arbitrary side effects or SPA routing inside application handlers and do not bypass trusted-event restrictions.

## Manual assessment and expected results

1. Configure a click action with default settings. Expect no host click. Set allowActions=true and restart: expect one click.
2. Make that click open a dropdown and place its content in the next cue. Expect the later highlight to resolve the newly visible content.
3. Use a distant target. Expect scrolling and aligned decoration before the click; audio continues. With scroll=false and an invisible target, expect no click and an ACTION_SKIPPED warning.
4. Pause/resume after a completed action, then seek away and back. Expect no duplicate. Restart: expect one new execution.
5. Seek directly to an unexecuted action cue. Expect visual reconciliation only. Check recovery after buffering and tab suspension likewise.
6. Attach a compatible pointer handler and configure a 400ms hold. Expect down followed by up after the hold. Track elapsed time in host handlers if needed.
7. During the hold, separately pause, seek, stop, destroy, remove the target or advance to the next cue. Expect cancel without a later up. Ensure the host clears its pressed state.
8. Test an anchor, default button, submit/reset input, disabled control and inert ancestor. Expect ACTION_SKIPPED, no action and continuing narration. A safe explicit type=button should work.
9. Destroy repeatedly, including from a pointerdown handler. Expect no late action, press release or resurrected decoration.

## Automated verification

- TypeScript typecheck, ESM/IIFE builds and unit tests: passed (122 tests across six unit files).
- Full installed Chrome suite: passed (47 tests), including real generated PCM media startup, scroll cancellation, nested clipping, margins, action ordering, deduplication, safety and cancellation.
- Final action-readiness guard: all 27 scrolling/action and real-media browser regression tests passed on rerun.
- `npm pack --cache .npm-cache`: passed prepack typecheck, all 122 unit tests and builds. Archive: `chaley-walkthrough-0.1.0-phase.6.tgz`, including both new phase assessments, usage guide, CSS and declarations.
- Built ESM imported in Node without DOM globals; only `Walkthrough` is exported at runtime.

Tests use minimal library fixtures; no consumer project was created. Actual narration recordings, external vanilla integration, React handlers, Firefox, Safari, Edge and mobile remain unverified. These are not accessibility compliance results. Pointer-event compatibility is limited to the documented handler contract; viewport checks do not guarantee freedom from occlusion.

## Next phase

Phase 7: accessible floating player and theming. Trigger binding and exclusive instance playback remain Phase 8. Neither is included here.
