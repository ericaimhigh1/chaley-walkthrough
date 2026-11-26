# Phase 8 assessment: independent instances, triggers and exclusive playback

**Baseline:** 0.1.0-phase.8. Includes [Phase 7 player and revised action policy](PHASE_7.md). Governing specification: [PROJECT_SPEC.md](../../PROJECT_SPEC.md).

## Capabilities and contracts

| Capability | Behavior |
| --- | --- |
| Independent configuration | Each Walkthrough owns its audio, frozen timeline, theme, player settings and optional trigger. No public manager or instance identifier is required. |
| Trigger binding | Literal ID lookup at construction; click prevents default navigation/submission and starts or resumes that instance. Construction starts no audio and creates no player DOM. |
| Exclusive session | Starting another instance synchronously stops the previous session, including paused/loading sessions, before starting new audio. Old highlights/player are hidden and pending actions/scroll work are cancelled. |
| Pending starts | Superseded start promises reject with AbortError. Late media resolution cannot revive stopped playback. Reentrant requests from lifecycle callbacks obey latest-request ownership. |
| Lifecycle | Stop keeps the trigger for reuse. Destroy removes its trigger listener/reservation, player, visuals, media resources and subscriptions. Destroying an inactive instance does not affect the active session. |
| Completion/error | Replay/retry controls remain visible until stopped, destroyed or another instance takes over. |

The coordinator is internal and uses document-scoped weak storage. Different documents do not share playback ownership. Load one package copy/build per page so all instances share that coordinator. This adds no playlist or automatic sequencing.

## Errors and dynamic DOM

- TRIGGER_NOT_FOUND: construct after the trigger has mounted. Programmatic start still works.
- TRIGGER_CONFLICT: another live instance owns that trigger ID; the first binding remains. The conflicting instance can still start programmatically.
- These warnings are recoverable and queued to the next microtask, allowing error subscriptions immediately after construction.
- A missing/replaced trigger is not watched by a mutation observer. Destroy and recreate the instance after its trigger mounts or is replaced. Destroy releases the binding for remounts, including React StrictMode cleanup; external React behavior still requires testing.
- Trigger-started media rejections are caught and reported through the existing error event. Programmatic callers should catch their own start/resume promises.

## Assessment steps

1. Construct two tours with distinct trigger buttons. Expect both idle and no audio/player until a trigger is activated.
2. Start A, pause it, then start B. Expect A reset to idle/time zero, B playing, and exactly one visible player/highlight.
3. Switch during a long press or smooth scroll. Expect the original press to receive pointercancel and no later action/scroll completion to affect B.
4. Switch while A's play promise is pending, then resolve A's old promise. Expect AbortError for A and no revived audio/visuals.
5. Destroy A while B is playing. B must remain unchanged.
6. Assign the same trigger to two instances. Expect TRIGGER_CONFLICT and only the original binding to respond. Missing IDs should warn without preventing programmatic use.
7. Repeatedly construct, start and destroy an instance, then click its former trigger. Expect no response, overlays or player nodes. Recreate on the same ID and confirm the reservation was released.
8. Request a third start from a stopped session's lifecycle callback. Expect the latest request to win without leaving multiple sessions active.
9. Force a rejected media play from a trigger. Expect a reported error and Retry controls, without an unhandled rejection.

## Executed verification

- TypeScript typecheck passed.
- 116 unit tests passed across seven files, including document isolation, trigger reservations, reentrant ownership, pending media cancellation and the revised action default.
- All 58 installed Chrome browser tests passed: real media, ESM/IIFE, highlighting, movement, scrolling, actions, six player tests and five instance/trigger tests.
- Phase 7 checkpoint passed all 29 player/action browser tests after fixing an initial smooth-scroll cancellation race. The player was also visually inspected at a 390px viewport width.
- npm pack passed prepack typecheck, all 116 unit tests and both builds. Archive: chaley-walkthrough-0.1.0-phase.8.tgz, including both phase assessments, usage, CSS and declarations.
- Built ESM imported successfully in Node without DOM globals; Walkthrough remains the only runtime export.

Obsolete unit assertions for automatic action safety blocking were replaced with developer opt-in assertions. The changed test count is intentional. Browser action coverage now verifies configured links and submit/default controls invoke fixture handlers without type-based errors; fixture handlers prevent actual navigation/submission.

## Files and limits

New: src/core/PlaybackCoordinator.ts, tests/unit/coordinator.test.ts, tests/browser/instances.spec.ts. Walkthrough integrates trigger ownership and playback claims. Phase 7 added Player.ts, styling, player options and browser tests. Usage, README, types, package metadata and the specification action policy were updated.

No runtime dependencies or external consumer applications were added. Tests use library fixtures and an original generated audio tone, not a production narration recording. Firefox, Safari, Edge, real mobile browsers, assistive-technology combinations and external vanilla/React projects remain untested. Narrow Chrome viewport coverage does not establish mobile browser compatibility. Native disabled controls and untrusted-event restrictions still apply to configured actions.

Next: Phase 9 package/documentation/release preparation. Phase 10 remains the owner's separate vanilla and React integration assessment.
