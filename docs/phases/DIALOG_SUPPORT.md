# Native dialog support assessment

Owner-approved extension to the Phase 10 library work. No public API change, runtime dependency or external test application.

## Capabilities

- Player and highlighter share a manual popover host inside the active native modal dialog. The host renders in the top layer, avoiding dialog transforms and overflow clipping while retaining native modal interactivity.
- Dialog opening, closing, reopening, removal and switching are tracked while playing or paused, including caption-only timelines. Closing the last modal returns the visuals to the body.
- Ordinary non-modal dialogs continue using the body overlay.
- Highlight geometry follows dialog scrolling. Application buttons remain clickable through the decoration; player controls remain keyboard operable.
- A developer click action may invoke an application handler that opens a dialog. Later cues can target its contents. Actions retain the existing developer-controlled policy.
- Escape stops an active tour without closing the dialog. A previously prevented Escape is respected. Once the tour stops, native dialog Escape behavior resumes.
- Stop/destroy release the shared host, observer and focus listener when no visible layer needs them. Destroy removes the owned player and highlighter. Application dialogs are never closed by cleanup.

## Changed files

- `src/dom/LayerHost.ts`: document-scoped internal host and modal lifecycle observation.
- `src/dom/HighlightRenderer.ts`, `src/ui/Player.ts`: acquire/release the visual host.
- `src/styles/walkthrough.css`: transparent viewport-sized host and non-intercepting backdrop.
- `tests/browser/player.spec.ts`: real native-dialog tests in minimal library fixtures.
- `PROJECT_SPEC.md`, `docs/USAGE.md`, `CHANGELOG.md`: approved scope and usage updates. Earlier phase reports link here to supersede their dialog exclusions.

## Assessment checklist

1. Open a modal before starting: target alignment and player pointer/keyboard controls work without stealing target focus.
2. Use a transformed, overflow-clipped dialog: the highlighter stays aligned and player escapes clipping.
3. Open/close/remove a modal on a paused caption-only cue: the player migrates correctly.
4. Open sibling modals in reverse document order: the player follows the active modal and returns to the earlier one on close.
5. Execute an authored click that opens a modal, then advance to its content cue: decoration appears and actions remain deduplicated.
6. Scroll dialog content, close and reopen: alignment and playback controls recover.
7. Press Escape: tour stops, dialog stays open; another Escape closes it normally. Prevented Escape leaves the tour running.
8. Destroy inside a modal: all owned layers disappear and the application dialog stays open.

## Verification

Executed on 2026-11-26:

- `npm run typecheck`: passed.
- `npm run check`: 123 unit tests passed; archive allowlist, exports, SSR-safe ESM, IIFE and TypeScript declaration checks passed; all 62 browser tests then present passed against the extracted package in Chrome.
- After adding scrolling/reopening and non-modal coverage, `npm run test:browser -- tests/browser/player.spec.ts`: all 12 player tests passed in Chrome and all 12 passed in Edge. Six of these are the new dialog scenarios.
- Distribution rebuilt and the unpublished archive refreshed with the updated assessment. No runtime source changed after these checks.

Firefox, Safari/WebKit, mobile, assistive technology and external consumer acceptance of this change remain pending. The owner's earlier vanilla success predates this dialog extension; separate React acceptance remains pending.

## Limitations

Full modal support requires native `:modal` and the Popover API. Browsers without popovers fall back to dialog-descendant mounting; transformed/clipped dialog geometry is not guaranteed there. Arbitrary popovers above the tour, fullscreen, shadow DOM, iframe targets and transformed body/root contexts remain outside coverage.

Authors must sequence dialog opening/closing themselves. Outside targets retain native modal inertness; seeking does not reconstruct the application's dialog state. Custom application CSS targeting all dialog descendants can still affect the library UI. Accessibility compliance and Safari/Firefox/mobile acceptance are not inferred from Chromium browser tests.
