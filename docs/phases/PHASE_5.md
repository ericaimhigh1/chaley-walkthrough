# Phase 5 assessment: automatic scrolling

Scope: Phase 5 of [PROJECT_SPEC.md](../../PROJECT_SPEC.md), following [Phase 4](PHASE_4.md). Delivered with the combined Phase 5?6 package.

## Capabilities and contract

- `ScrollController.ts` checks full target containment against the viewport and clipping ancestors, with one pixel tolerance. Hidden, transparent and detached targets are not action-visible.
- Visible targets do not scroll. Cue `scroll` overrides the default (`true`), including cues with effect `none`.
- Uses native `scrollIntoView` with smooth behaviour, centre block alignment and nearest inline alignment. Native scroll margins apply. Reduced motion uses instant scrolling.
- Audio continues. Old decoration is hidden while scrolling; geometry is checked each frame and decoration appears after three stable frames with a visible target.
- Wait is bounded at two seconds. `SCROLL_INCOMPLETE` is recoverable; inaccessible/oversized targets do not block narration.
- Cue changes, seeks, stop, completion and destroy cancel the wait and freeze the native scrolling chain at its current position. No stale completion can activate a different cue.

## Assessment steps

1. Start with a target well below the viewport. Expect uninterrupted audio, scrolling and then an aligned highlight.
2. Place the target inside an overflow-auto container. Expect both viewport and container clipping to be considered.
3. Test a fully visible target and `scroll: false`. Neither should cause automatic scrolling.
4. Enable reduced motion. Expect instant scrolling; test CSS scroll margins on the target.
5. Seek or stop during scrolling. Expect no late spotlight or continued library-owned scroll.
6. Put a target behind overflow-clip or make it larger than its container. Expect a bounded recoverable warning, continuing narration and no action on that target.

## Verification

Phase 5 checkpoint: typecheck and ESM/IIFE builds passed; 109 unit tests passed. Chrome browser suite: 28 tests passed, including five new scrolling tests and all 23 previous tests. Automated fixtures remain inside library tests; no external application was created.

## Limits

Full containment is conservative: oversized targets cannot become fully visible. Overlapping elements, transformed clipping geometry, sticky headers, native top-layer UI, shadow DOM and iframes are not comprehensively assessed. Native scroll cancellation and alignment require testing on additional browsers. Firefox, Safari, Edge, mobile and external vanilla/React integration remain pending. Narration must leave time for scrolling and transitions. Pause does not pause narration-dependent scrolling; pending actions are separately cancelled in Phase 6.

Next: [Phase 6 actions](PHASE_6.md).


Later update: the native-dialog limitations recorded at this checkpoint are superseded by [Native dialog support](DIALOG_SUPPORT.md). Other limitations remain as stated.
