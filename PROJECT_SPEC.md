# Chaley Walkthrough - Project Specification

## 1. Project overview

**Project name:** Chaley Walkthrough  
**Distribution:** Open-source npm package  
**Platform:** Web only  
**Scope:** Standalone library; no integration with any other named product.

Build a lightweight, framework-independent JavaScript library that synchronises recorded narration with visual highlights and optional interactions on a live web interface. Developers provide an audio recording and a JSON timeline. Users can watch, listen, pause, resume, seek and stop a guided walkthrough without being required to interact with each target.

The library must not depend on a commercial service. No monetisation, hosted editor or account system is planned. Developers may record their own narration or generate it using external AI tools.

## 2. MVP scope

- Multiple independently configured walkthroughs per application, each with its own audio source, timeline and optional trigger. Only one walkthrough plays at a time.
- Target elements using unique HTML IDs; resolve targets at runtime.
- Audio-clock-driven highlighting, automatic scrolling and animated movement between targets.
- Ripple and spotlight effects; configurable subtle backdrop (default 10% opacity).
- Optional, explicitly enabled click and long-press simulation.
- Customisable player styling and optional captions supplied by developers.
- Play, pause, resume, seek, replay, stop and destroy.
- Vanilla JavaScript compatibility; validate React compatibility using the same package.
- No runtime dependencies unless justified and approved.

Out of scope: automatic multi-tour playlists, React Native, visual timeline editor, automatic AI narration or timestamp generation, cross-page navigation, analytics, hosted services and monetisation. A dedicated React wrapper is optional after the vanilla integration is proven.

## 3. Public API and independent instances

Use a public `Walkthrough` class. Each instance owns exactly one audio source, one timeline, its optional trigger, theme, playback state and lifecycle. Developers may create any number of instances on a page or initialise different instances on different pages. No public manager, registry or array of walkthrough configurations is required. The proposed npm name `chaley-walkthrough` must be checked before publication.

```js
import { Walkthrough } from "chaley-walkthrough";
import "chaley-walkthrough/style.css";

const walletTour = new Walkthrough({
  trigger: "#start-wallet-tour",
  audio: "/audio/wallet.mp3",
  timeline: [
    { time: 0, target: "#wallet-balance" },
    { time: 5, target: "#top-up-button" },
    { time: 12, target: "#transactions" },
  ],
});

const settingsTour = new Walkthrough({
  trigger: "#start-settings-tour",
  audio: "/audio/settings.mp3",
  timeline: [
    { time: 0, target: "#profile" },
    { time: 8, target: "#preferences" },
  ],
});
```

Each constructor call initialises its own timeline and binds its optional trigger. No audio starts during construction. Omit the trigger to launch programmatically from a user gesture.

### Instance methods

```js
await walletTour.start();
walletTour.pause();
await walletTour.resume();
walletTour.seek(12);
walletTour.stop();
await walletTour.restart();
walletTour.destroy();
```

Start and restart begin at zero; resume preserves position. Starting an already playing instance is a no-op; starting a paused instance resumes it. Stop resets to idle; destroy is terminal and idempotent. Handle rejected media playback promises. Expose events or subscriptions for state changes, cue changes, completion and recoverable errors, and a read-only state snapshot containing status, currentTime, duration and activeCue. Proposed states: idle, loading, playing, paused, ended, error, destroyed.

### Triggers and internal coordination

Use unique HTML IDs with a leading `#` in both trigger and target configuration; resolve via `document.getElementById()` after removing the prefix. Bind trigger clicks after the relevant DOM exists; warn on missing triggers and document how to initialise dynamically mounted elements. Avoid conflicting trigger assignments and remove listeners on destruction. Instances do not require a globally unique walkthrough ID.

An internal document-scoped playback coordinator, invisible to consumers, ensures only one walkthrough is active (including paused sessions) at a time. Starting another stops the previous instance, cancels its pending actions and removes its visuals before starting the new instance. Destroying an inactive instance must not affect the active one. Guard against concurrent start requests and stale media promises. No automatic sequencing or playlists are required. On page unmount or route change, the consumer must destroy relevant instances; cross-page continuation is out of scope.

## 4. Timeline configuration

```json
{
  "audio": "/audio/dashboard-tour.mp3",
  "theme": {
    "overlayOpacity": 0.1,
    "highlightColor": "#073b80",
    "padding": 6,
    "borderRadius": 8
  },
  "allowActions": false,
  "defaults": {
    "scroll": true,
    "effect": "ripple",
    "transition": "move",
    "transitionDuration": 400
  },
  "timeline": [
    { "time": 0, "target": null, "caption": "Welcome to your dashboard." },
    {
      "time": 3,
      "target": "#wallet-button",
      "caption": "Here is your wallet."
    },
    {
      "time": 8,
      "target": "#profile-button",
      "effect": "spotlight",
      "action": { "type": "click" }
    },
    {
      "time": 10,
      "target": "#profile-settings",
      "caption": "Here are your profile settings."
    },
    {
      "time": 16,
      "target": "#options-button",
      "action": { "type": "longpress", "holdDuration": 800 }
    },
    { "time": 22, "target": null }
  ]
}
```

The example intentionally disables actions globally; enable `allowActions` explicitly to demonstrate the dropdown and long press. The application must supply matching elements and event handlers.

### Configuration rules

| Field              | Meaning                                                    |
| ------------------ | ---------------------------------------------------------- |
| audio              | Browser-playable audio URL                                 |
| time               | Cue start in seconds, fractional values supported          |
| target             | HTML ID reference with leading `#`; null clears highlight  |
| caption            | Optional text displayed as text, never interpreted as HTML |
| scroll             | Override automatic scrolling                               |
| effect             | ripple, spotlight or none                                  |
| transition         | move or instant                                            |
| transitionDuration | Milliseconds                                               |
| action             | Optional click or longpress descriptor                     |
| holdDuration       | Milliseconds for simulated long press                      |

Require finite non-negative timestamps in strictly increasing order; reject duplicate timestamps. Validate known enum values, ranges and required fields. Warn for cues beyond known audio duration. Each cue remains active until the next cue or completion. Missing target is a recoverable warning, not a fatal playback error. Strip the leading `#` and resolve IDs using `document.getElementById()`; document that IDs must be unique. JSON contains data only, not executable code.

## 5. Playback and synchronisation

Use HTMLAudioElement as the authoritative clock. Never schedule the entire timeline using independent setTimeout calls. During playback, use requestAnimationFrame to read audio.currentTime, supplemented by media events for seeking, pause, end, buffering and background-tab recovery. Only change the active cue when necessary. Select the latest cue whose time is less than or equal to currentTime (binary search is suitable).

- Play begins after a user gesture; handle rejected play promises and audio loading errors.
- Pause freezes narration and cue advancement; resume continues from the same position.
- Seek immediately reconciles visual state, but must not execute skipped actions or replay actions automatically.
- Natural playback executes each eligible action at most once per run; a deliberate replay starts a fresh run.
- After buffering or background suspension, reconcile to the current cue; do not execute a backlog of missed actions.
- Stop and completion clear visual effects and cancel pending work. Destroy also removes listeners, DOM nodes and owned media resources.
- Use a generation token or equivalent cancellation mechanism so stale scroll, animation and action callbacks cannot affect a newer cue.

## 6. Visual engine

Maintain one persistent floating highlighter rather than creating a new one per cue. Read target geometry using getBoundingClientRect(). Render a fixed-position overlay in a dedicated root appended to the document body by default. For an active native modal dialog, mount the highlighter and player in a shared dialog-descendant manual popover host so they remain interactive and escape clipping and transforms. Restore body mounting when the dialog closes or is removed; track changes even while paused or showing captions only. Native dialog support is an owner-approved extension. Animate position, dimensions and border radius from the previous target to the next using CSS transitions or Web Animations API.

- Backdrop: configurable dimming with a transparent cutout around the target; default opacity 0.1. A large box shadow or SVG mask is a possible implementation.
- Spotlight: clear outline around the target with configurable padding and radius.
- Ripple: expanding, fading rings around the target; decorative layer must not intercept pointer events.
- Keep application controls usable; only player controls receive pointer events from the library UI.
- Recalculate geometry on scrolling, resizing and target size changes. Use ResizeObserver and coalesced animation-frame updates; avoid restarting transitions on every scroll event.
- Respect prefers-reduced-motion: disable ripple motion and use instant positioning/scrolling.
- Handle targets removed or replaced by React renders. Clear stale highlights and resolve again when appropriate.
- Avoid global CSS selectors and use namespaced classes/custom properties. Support native modal dialogs in browsers with the Popover API and :modal. Document remaining stacking-context limitations, including iframes and shadow DOM (not supported in MVP).

## 7. Automatic scrolling

When a cue becomes active, resolve its target and check visibility against the viewport and relevant clipping scroll ancestors. If needed, call scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }). Avoid unnecessary scrolling for visible targets. Respect scroll margins and reduced-motion settings.

For the MVP, audio continues during scrolling. Track target geometry while scrolling; settle the spotlight once the target is visible. For distant targets, prefer scrolling before moving the spotlight rather than animating it across unrelated content. Bound waiting time; cancel pending work if the cue changes, playback stops or the user seeks. Do not trigger an action on an invisible or detached target. Document that narration authors should leave sufficient time for scrolling and animations. Pausing audio until scrolling finishes is a future option.

## 8. Optional timeline-driven actions

Adding an action descriptor is developer opt-in. Actions run unless the developer explicitly sets allowActions to false. Visitors are not asked to approve actions. Execute only after resolving the current target, scrolling if necessary and applying the highlight. If the cue changes before the action can run, cancel it. Pause must cancel pending actions; resume must not duplicate completed actions.

### Click

Use HTMLElement.click() for eligible targets. This can invoke real application handlers and default browser behaviour. Synthetic clicks are not trusted user gestures.

### Long press

There is no universal native DOM longpress event. Define a documented synthetic pointer-event sequence (pointerdown, hold, pointerup) or a namespaced custom long-press event that the host application explicitly handles. Do not claim compatibility with every long-press implementation. Cancel the hold on stop, seek, target removal or cue change. Ensure cancellation releases any simulated press state. Test React handlers separately.

### Safety requirements

- Recommend actions only for non-destructive UI changes: dropdowns, modals, accordions, tabs, sidebars and similar controls.
- Warn against links and navigation buttons, including SPA route changes, because navigation can interrupt the tour and invalidate target IDs.
- Never recommend automated form submission, payments, deletion or other state-changing business operations.
- Per the owner's revised action policy, do not block actions based on element type or inferred business safety. Developers choose appropriate targets. Native disabled controls and browser restrictions retain their normal behavior.
- Do not attempt to bypass browser restrictions on trusted events, popups or privileged APIs.
- Actions are never fired simply because the user seeks across a timestamp. Document that seeking cannot reconstruct UI state created by earlier actions.

## 9. Player UI

Provide a small floating player with play/pause, progress slider, elapsed/total time, replay or stop/close, and optional caption toggle. Keep it visually separate from the highlight and avoid covering the current target where practical. Use accessible buttons, keyboard-operable controls, clear focus states and accessible labels. Do not trap focus or automatically move keyboard focus to each target. Escape may stop the tour while it is active; document keyboard behaviour. Captions are developer-provided, not generated automatically. Do not claim accessibility compliance until tested.

Allow developers to customise colours, opacity, radius, spacing and player position through CSS custom properties and configuration. A headless mode or custom player API can follow once the built-in player is stable.

## 10. Architecture and proposed tooling

Use TypeScript for the library source and compile to JavaScript with type declarations. Use Vite library mode. Publish ESM and optionally CommonJS if needed; also produce an IIFE/UMD browser build for direct script-tag use. The browser build exposes a documented global such as `ChaleyWalkthrough`. Export CSS separately. Do not access document/window at module import time, to remain safe for SSR imports. Instantiate only in the browser.

```text
chaley-walkthrough/
  src/
    index.ts
    core/
      Walkthrough.ts
      PlaybackCoordinator.ts
      Timeline.ts
      AudioController.ts
      types.ts
      validation.ts
    dom/
      TargetResolver.ts
      ScrollController.ts
      LayerHost.ts
      HighlightRenderer.ts
      ActionExecutor.ts
    ui/
      Player.ts
    styles/
      walkthrough.css
  tests/
  docs/
    USAGE.md
  README.md
  CONTRIBUTING.md
  LICENSE
  package.json
  tsconfig.json
  vite.config.ts
  PROJECT_SPEC.md
```

Keep timeline logic independent of the DOM where practical. The controller coordinates audio, timeline, rendering, scrolling and actions. UI observes controller state. No React dependency in the core package. Prevent conflicting active overlays: allow only one active walkthrough per document. A new explicit start stops the previous walkthrough and clears its pending work before starting the next.

## 11. Local development and external testing boundary

The main repository contains only the standalone library, package configuration, documentation and automated library tests. Do not scaffold, include or maintain a test dashboard, example application, vanilla test project or React test project inside this repository. The owner will create those separately in other VS Code windows. Minimal automated test fixtures are permitted solely for library tests; they must not become a standalone dashboard.

Provide the following local linking workflow in the usage documentation. In the library repository:

```bash
npm install
npm run build
npm link
npm run dev
```

The dev script must rebuild library output in watch mode. In a separately created consumer project, the owner can run `npm link chaley-walkthrough` (using the actual package name). Validate vanilla JavaScript first, then React using the same package. Document direct script-tag usage as well. React consumers should initialise after mount and destroy on cleanup; document StrictMode and linked-package caching considerations. Use `npm pack` to verify the publishable package. Do not create or modify external consumer projects as part of this repository's implementation. External integration results must be reported as pending until actually tested.

## 12. Implementation phases

1. Scaffold package, exports, build scripts and types; implement configuration validation and pure timeline lookup.
2. Implement audio playback and cue synchronisation. Test play, pause, resume, seek, end and errors.
3. Implement static highlight, backdrop and target resolution.
4. Add animated movement, ripple and geometry tracking.
5. Add automatic scrolling and cancellation of stale work.
6. Add opt-in click and long-press actions, safety checks and action deduplication.
7. Add accessible floating player and theming.
8. Implement independent instance initialisation, trigger binding and exclusive playback; test lifecycle and cleanup.
9. Complete package usage documentation and automated library tests; prepare npm linking and browser distribution.
10. Hand off to the owner for separate vanilla testing, followed by React testing. Address reported library defects and prepare the open-source release.

## 13. Acceptance criteria and tests

Use unit tests for timeline lookup, validation, action eligibility and state transitions. Use browser integration tests (Playwright is proposed) for real media, layout and scrolling. Mock audio clocks for deterministic unit tests; test actual audio separately.

- Four or more targets activate in order against a real narration file, without cumulative timing drift.
- Pausing and resuming preserve playback position; seeking changes highlight without executing actions.
- A persistent spotlight moves and resizes smoothly between targets.
- Off-screen and nested-scroll targets become visible; rapid cue changes cancel stale operations.
- Click opens a dropdown in a minimal automated test fixture; a later cue highlights its content. Long press works with a documented compatible handler.
- Developer-authored actions run unless explicitly disabled and do not duplicate on resume or seek.
- Missing/removed targets, invalid configuration and audio errors are handled predictably.
- Reduced motion, keyboard controls and captions work as documented.
- Native modal dialogs keep the player usable and highlights aligned, including transformed/clipped dialogs, modal switching, close/removal, caption-only cues and cleanup. Escape stops an active tour without closing the host dialog.
- Repeated mount/destroy cycles leave no overlays, listeners or active audio behind.
- Vanilla imports and direct browser script work with packaged builds; React compatibility is verified in the separate consumer testing phase.
- Multiple independently initialised walkthroughs can be launched by distinct triggers; switching stops the previous tour, and destroy removes trigger listeners.
- Verify current Chrome, Firefox, Safari and Edge, including representative mobile web layouts. Report untested browsers explicitly.

## 14. Open-source release

Licence: MIT. The project name is Chaley Walkthrough; verify npm/GitHub availability before release. Create and maintain `docs/USAGE.md` as a mandatory deliverable, with README linking to it. Include installation, npm linking, ESM and direct script-tag usage, vanilla and React integration snippets, independent walkthrough instances and triggers, audio authoring and timestamps, full configuration/API reference, styling, playback, cleanup, safe action guidance, troubleshooting and browser limitations. Documentation must match the implemented API; update it during each phase. Code snippets are permitted; do not create example applications or dashboards in the repository. Add CONTRIBUTING, issue templates, changelog and CI for builds/tests. Use original or appropriately licensed demo audio and assets. No telemetry by default. Audio is fetched from the developer-configured URL; document that remote audio hosts may receive requests.

## 15. Instructions for Codex

Read this entire specification before implementation. Preserve the agreed independent Walkthrough instance API; review implementation details before coding. Do not introduce a public manager or require a configuration array of walkthroughs. The technical tooling and MIT licence are approved. Work one phase at a time. Before each phase, describe the planned changes and ask for approval if scope or architecture changes. After each phase, report files changed, tests run, results, limitations and the next step. Do not claim browser tests passed unless executed. Do not add React Native, monetisation, automatic playlists, external application integrations or unrelated features. Keep the owner in control of priorities and review gates. Start with scaffolding and timeline tests, not the entire project at once.
