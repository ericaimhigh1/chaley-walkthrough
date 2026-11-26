# Phase 7 assessment: floating player

Scope: Phase 7 of [PROJECT_SPEC.md](../../PROJECT_SPEC.md), delivered with Phase 8. This release also applies the owner's revised developer-controlled action policy.

## Capabilities

- Native pause/resume, replay and stop buttons; loading playback can be paused/cancelled.
- Labelled range slider for seeking, elapsed/total time, and disabled seeking when duration is unknown or zero.
- Completion offers play again; media failure offers retry. Controller error events remain available.
- Optional caption toggle. Captions use textContent, not HTML, and a polite live region. Clock updates do not repeatedly announce captions.
- Keyboard-operable buttons and slider, visible focus outlines, Escape to stop; no focus trap or automatic focus movement.
- Configurable player.position (four corners) and player.captions (initial visibility). Namespaced CSS variables control colors, opacity, radius, spacing, offset and stacking.
- Player tries alternate corners when its rectangle overlaps the current target. It fits narrow viewports and allows internal scrolling for long content.
- Stop hides the player and removes its keyboard listener; destroy removes its DOM. Completion retains replay controls until stopped or another tour takes over.

## Action policy revision

Adding an action descriptor is now developer opt-in. Explicit allowActions=false disables execution. The library no longer rejects anchors, submit/default buttons, labels, disabled/inert/aria-disabled targets by policy. Native HTMLElement.click behavior still applies: a browser-disabled control may ignore a click. No visitor confirmation or action toggle exists.

Actions still require a current, attached, visible target and obey pause, seek, cancellation and per-run deduplication. Developers decide which UI actions fit the narration. Validation still rejects malformed action descriptors. Phase 6's original restriction documentation is a historical baseline, superseded here and in USAGE.md.

## Assessment

1. Start, pause, resume, replay and stop using the player. Verify narration and state stay aligned.
2. Focus the slider and use arrow keys; seek with a pointer. Confirm captions/highlight update without firing skipped actions.
3. Supply caption text containing HTML tags. Confirm it displays literally. Toggle captions with Space.
4. Press Escape and verify playback stops. Check focus is never moved to a highlighted target.
5. Test unknown duration, playback failure and completion. Expect disabled seeking, Retry and Play again respectively.
6. Set a corner and CSS theme variables. Test a narrow viewport and a target in that corner; expect alternate placement where possible.
7. Destroy twice and press Escape. Expect no player or retained keyboard behavior.
8. Add a click to a link or default button with a fixture handler that prevents navigation/submission. Expect the configured click without a type-based error.

## Verification and limits

Automated checks cover the above in minimal library fixtures. Final executed results are recorded in [Phase 8](PHASE_8.md). The player was visually inspected at 390px width. These checks are not an accessibility-compliance certification: screen-reader combinations, real mobile browsers and external React integration remain pending.

Corner avoidance is best effort; a target covering most of the viewport may leave no free corner. Native dialogs, iframes and shadow DOM remain outside MVP support. A consumer may preventDefault on Escape before it reaches the player's document listener to preserve its own dialog behavior.

Files: src/ui/Player.ts, src/styles/walkthrough.css, core types/validation/Walkthrough integration; tests/browser/player.spec.ts and updated action tests. No runtime dependency or external application was added.
