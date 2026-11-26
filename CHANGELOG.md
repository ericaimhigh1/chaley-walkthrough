# Changelog

## 0.1.0-rc.1 - 2026-11-26 (unpublished)

### Native dialog support

- Automatically host player and highlights inside active modal dialogs using a manual top-layer popover.
- Track dialog opening, closing and removal during playback and pause; retain native application controls and Escape behavior.
- Add dialog lifecycle, transformed clipping, modal switching and action integration checks.

### Release preparation

- Complete usage, installation, audio authoring and troubleshooting guidance.
- Add contribution guidance, issue templates and build/unit/packaged-browser CI.
- Verify the actual npm archive: distribution allowlist, SSR-safe ESM, browser global, declarations, stylesheet and browser behaviors.
- Add selectable Chrome, Edge, Chromium, Firefox and WebKit test configurations.
- Add Phase 9 assessment and Phase 10 vanilla/React handoff with explicit pending results.

### Included implementation

- Audio-clock-driven playback, seeking, restart and lifecycle events.
- Persistent animated highlights, ripple, backdrop, geometry tracking and cancellable automatic scrolling.
- Developer-authored click and synthetic long-press actions with cancellation and per-run deduplication.
- Keyboard-operable player, captions and CSS theming.
- Independent instances, trigger binding and exclusive document playback.

### Compatibility changes from Phase 6

Adding an action descriptor now opts in. Explicit allowActions=false still disables actions. Element-type restrictions were removed at the owner's request. Native browser disabled-control and trusted-event rules still apply. Actions remain objects; malformed values now report the expected click/longpress descriptor and the exact cue path.

Earlier implementation checkpoints are documented in docs/phases/PHASE_1.md through PHASE_8.md. No public stable release is claimed.
