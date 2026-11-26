# Usage and local development

## Implementation status

Phases 1-8 are implemented: audio, animated highlighting, scrolling, developer-authored actions, floating player, trigger binding and exclusive playback. Construction binds a configured trigger but creates no media, overlay or player DOM. Start creates those lazily. Each document has one active session, including paused sessions.

See [Phase 1](phases/PHASE_1.md), [Phase 2](phases/PHASE_2.md), [Phase 3](phases/PHASE_3.md) and [Phase 4](phases/PHASE_4.md), [Phase 5](phases/PHASE_5.md) and [Phase 6](phases/PHASE_6.md), [Phase 7](phases/PHASE_7.md) and [Phase 8](phases/PHASE_8.md), [Phase 9](phases/PHASE_9.md) and [Phase 10](phases/PHASE_10.md) for capabilities, assessment steps, errors and results. Historical phase reports describe their own baseline; this guide describes current behaviour. The owner reports a separate vanilla project works. Separate React integration and the full browser/device matrix remain pending; see Phase 10. Phase assessment files are included in the npm archive.

## Installation and candidate testing

This repository currently supplies an unpublished release candidate, `0.1.0-rc.1`. From the library directory run `npm ci`, then `npm run check`. The check produces `chaley-walkthrough-0.1.0-rc.1.tgz` and tests its contents. In your existing consumer project:

```sh
npm install /absolute/path/to/chaley-walkthrough-0.1.0-rc.1.tgz
```

Import `Walkthrough` and the separate `chaley-walkthrough/style.css` export. After a public release exists, registry installation will be `npm install chaley-walkthrough`; this guide does not claim it is already published. The archive is also the source for direct script-tag assets below. Development requires Node 22.12+ or newer supported Node and npm; CI is configured for Node 24.

## Local development

In this library repository:

```sh
npm install
npm run build
npm link
npm run dev
```

`dev` rebuilds library JavaScript, CSS and declarations in watch mode; it does not serve an application. Stop it with Ctrl+C. In PowerShell environments that block `npm.ps1`, use `npm.cmd` or `cmd /c npm`.

The owner creates consumer projects separately. In a separate consumer project, run `npm link chaley-walkthrough`. Validate vanilla JavaScript first, then React against the same package. No consumer application is included here. Restart the consumer's dev server or clear its dependency cache if linked changes do not appear. Vanilla has an owner-reported pass; React assessment remains pending.

Run `npm run check` for typecheck, unit tests, build and packaged browser tests. Run `npm run typecheck`, `npm test`, and `npm run build` individually when needed. `npm pack` runs these checks and creates the publishable archive. The provisional package name must be checked before release.

Run `npm run test:browser` separately for Playwright tests against installed Google Chrome in headless mode. The command builds first, then uses minimal routed fixtures and generated PCM audio without an application server. Install Chrome if unavailable. Set CHALEY_BROWSER to edge, chromium, firefox or webkit to select another test configuration. Chrome/Edge use installed browsers; the others need `npx playwright install chromium firefox webkit`. `npm run test:package` runs those same fixtures against an extracted archive and checks exports/declarations. See Phase 9 for executed results; configuration alone is not a pass.

## Current ESM entry

```js
import { Walkthrough } from "chaley-walkthrough";
import "chaley-walkthrough/style.css";

// Initialise after the trigger and initial targets have mounted.
const tour = new Walkthrough({
  audio: "/audio/tour.mp3",
  timeline: [
    { time: 0, target: null, caption: "Welcome." },
    { time: 3.5, target: "#wallet" },
  ],
});
```

Module imports are safe without `window` or `document`. Construct instances only in the browser. Each instance owns a frozen copy of its configuration. The original object is not frozen or modified. There is no public manager or configuration array.

## Direct script tags

Serve the generated files from `dist` with your site's assets:

```html
<link rel="stylesheet" href="/vendor/chaley-walkthrough/style.css" />
<script src="/vendor/chaley-walkthrough/chaley-walkthrough.iife.js"></script>
<script>
  const tour = new ChaleyWalkthrough.Walkthrough({
    audio: "/audio/tour.mp3",
    timeline: [],
  });
</script>
```

The browser bundle exposes `ChaleyWalkthrough.Walkthrough` with the same API as ESM. Call `tour.start()` from a user gesture and handle its promise. CSS is separate; CommonJS is not provided. Script-tag playback has passed the automated Chrome fixture.

## Configuration reference

All timestamps are seconds; transition and hold durations are milliseconds. Unknown fields and invalid values throw `TypeError` with a field path. Configuration is data, not executable callbacks.

| Field                         | Requirement/default                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `audio`                       | Required non-empty URL string. Media failures are reported during playback.                 |
| `timeline`                    | Required array; empty is allowed for audio-only playback.                                   |
| `trigger`                     | Optional literal HTML ID prefixed with `#`; binds at construction.                          |
| `allowActions`                | Optional developer override. Authored actions run unless explicitly `false`.                |
| `player.position`             | One of `bottom-right` (default), `bottom-left`, `top-right`, `top-left`.                    |
| `player.captions`             | Boolean; initially shows captions by default.                                               |
| `defaults.scroll`             | Boolean; defaults to `true`.                                                                |
| `defaults.effect`             | `ripple`, `spotlight`, `none`; defaults to `ripple`.                                        |
| `defaults.transition`         | `move`, `instant`; defaults to `move`.                                                      |
| `defaults.transitionDuration` | Finite non-negative number; defaults to `400`.                                              |
| `theme.overlayOpacity`        | Number between 0 and 1 inclusive; defaults to `0.1`.                                        |
| `theme.highlightColor`        | Non-empty CSS color string; defaults to `#0039a3`. Phase 1 does not parse CSS color syntax. |
| `theme.padding`               | Finite non-negative number; defaults to `6` pixels.                                         |
| `theme.borderRadius`          | Finite non-negative number; defaults to `8` pixels.                                         |

Each cue requires a finite, non-negative `time` and a `target` that is either `null` or a `#`-prefixed ID. Times must be strictly increasing; duplicates are rejected rather than sorted. IDs must be unique in the host document and contain no ASCII whitespace. References are literal IDs, not CSS selectors, so punctuation does not require CSS escaping.

Cues may override `scroll`, `effect`, `transition` and `transitionDuration` using the same validation rules as defaults. Optional `caption` must be a string and is rendered as text, never HTML. `target: null` clears both highlight and backdrop. Automatic scrolling respects cue overrides.

Optional `action` is either `{ type: 'click' }` or `{ type: 'longpress', holdDuration: 800 }`. Long-press duration must be finite and positive. Actions require a non-null target and are validated even when `allowActions` is false. `holdDuration` is invalid on click actions.

If construction reports `config.timeline[10].action`, check the eleventh cue (indices start at zero). Use `action: { type: 'click' }`, not `action: 'click'`. For a cue without an action, omit the property rather than supplying `null`, `false` or an empty string. This validates the descriptor format; it does not judge whether the developer's chosen interaction is appropriate.

The timeline selects the latest cue at or before the audio clock, returning no cue before the first timestamp or for an empty timeline. Completion clears the cue. Cues beyond finite known duration emit recoverable warnings once per cue per instance.

## Playback API and events

The package exports `WalkthroughConfig`, `TimelineCue`, `CueOptions`, `CueAction`, `WalkthroughTheme`, `PlayerOptions`, `WalkthroughState`, `WalkthroughStatus`, `IdReference`, `Effect`, `Transition`, `CueChangeReason`, `CueChangeEvent`, `WalkthroughIssue` and `WalkthroughEventMap` as TypeScript types.

| Member                     | Behaviour                                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start(): Promise<void>`   | Starts idle/ended/error at zero; resumes paused; no-op while playing. Repeated pending starts share a promise.                                           |
| `pause(): void`            | Pauses playing/loading at the current position. Cancels pending play with `AbortError`. Other live states are unchanged.                                 |
| `resume(): Promise<void>`  | Resumes paused playback; otherwise no-op or shares a pending play request.                                                                               |
| `seek(seconds): void`      | Immediately reconciles time/cue; finite non-negative seconds required. Clamps to known duration, queues media seek before metadata. Executes no actions. |
| `restart(): Promise<void>` | Cancels the old run and starts at zero.                                                                                                                  |
| `stop(): void`             | Releases audio, resets time to zero and cue to null, returns to `idle`.                                                                                  |
| `destroy(): void`          | Terminal, idempotent cleanup of media, frames and listeners; resets time/cue.                                                                            |
| `state`                    | Frozen snapshot: `status`, `currentTime`, `duration`, `activeCue`. Unknown duration is `null`; known duration is retained after stop/destroy.            |
| `on(event, listener)`      | Subscribes to future events and returns an idempotent unsubscribe function. Read `state` for initial state.                                              |

After destruction, asynchronous methods reject; other mutators and new subscriptions throw. Reading `state` and existing unsubscribe functions remain safe. Catch playback promises: interruptions reject with `AbortError`, while playback failures reject with the underlying cause. Stale promises cannot revive a cancelled session. Resume after cancellation of a pending play uses a fresh media element at the preserved position.

Seeking while idle/ended/error updates the snapshot without changing status or starting audio. A subsequent `start()` begins at zero. To start at another position, call start from a gesture then seek; when paused, seek then resume.

| Event         | Payload                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------ |
| `statechange` | Frozen state whenever any field changes, including clock updates.                          |
| `cuechange`   | `{ cue, previousCue, reason, state }`, only when cue identity changes, including clearing. |
| `complete`    | Final ended snapshot, emitted on media completion, not stop.                               |
| `error`       | `{ code, message, recoverable, cause?, cue? }`, including nonfatal warnings.               |

Cue reasons: `start`, `resume`, `playback`, `seek`, `recovery`, `stop`, `ended`, `error`, `destroy`. Seeking and recovery select only the current cue, without a backlog. Media events supplement animation-frame polling; no independent timeline timer is used. `loading` covers initial start and buffering. Hidden-tab recovery reconciles with the media clock. Subscriber exceptions are logged and isolated; keep listeners lightweight.

Audio error codes are `PLAYBACK_REJECTED`, `MEDIA_ERROR`, `SEEK_FAILED` and `CUE_BEYOND_DURATION`. Phase 3 adds recoverable visual warnings: `TARGET_NOT_FOUND`, `TARGET_NOT_RENDERABLE` and `RENDER_UNAVAILABLE`. Phases 5-6 add `SCROLL_INCOMPLETE` and `ACTION_SKIPPED`, both recoverable. Phase 8 adds recoverable `TRIGGER_NOT_FOUND` and `TRIGGER_CONFLICT` warnings. Direct seek failure emits a recoverable error and throws; deferred seek failure terminates the attempt. `recoverable: false` means the attempt failed, not that the instance is destroyed: start can retry. Browser autoplay restrictions still apply; see [MDN's play promise reference](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play).

```js
const unsubscribe = tour.on("cuechange", ({ cue, reason }) => {
  console.log(cue, reason);
});
tour.on("error", (issue) => console.warn(issue.code, issue.message));
document.getElementById("start-tour").addEventListener("click", () => {
  void tour.start().catch((error) => {
    if (error.name !== "AbortError") console.error(error);
  });
});
// On application cleanup: unsubscribe(); tour.destroy();
```

<a id="static-highlighting-phase-3"></a>

## Highlighting, motion and tracking (Phase 4)

Import `chaley-walkthrough/style.css` (or link the generated stylesheet for script-tag usage). CSS is required for positioning, dimming and pointer pass-through. Targets are literal document IDs resolved using `getElementById()` after removing the first `#`; punctuation needs no CSS escaping. IDs must be unique. Initialise after the host DOM exists.

One fixed, decorative root is appended to the document body on the first drawable cue (or the active modal host described below). It contains a persistent outline with a transparent interior and a large outer shadow for the backdrop. The default dimming opacity is 0.1; padding is 6px, radius 8px and outline color #0039a3. The decorative renderer does not modify or focus the host target; separately configured actions may click it. The root is hidden from assistive technology and both layers pass pointer events through to application controls.

| Setting                                           | Current rendering                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| `effect: 'spotlight'`                             | Outline and backdrop without ripple rings.                                |
| `effect: 'ripple'` (default)                      | Outline/backdrop plus two expanding, fading rings.                        |
| `effect: 'none'`                                  | Clears outline and backdrop for that cue. Overrides the instance default. |
| `target: null`                                    | Clears all visual decoration.                                             |
| `theme.overlayOpacity: 0`                         | Transparent backdrop; outline remains.                                    |
| `theme.highlightColor`, `padding`, `borderRadius` | Set outline color, outside padding and cutout/outline radius.             |
| `transition: 'move'` (default)                    | Animate natural cue changes between visible highlight positions.          |
| `transition: 'instant'`                           | Position immediately.                                                     |
| `transitionDuration`                              | Movement milliseconds, default 400; zero makes positioning instant.       |

Natural playback cue changes animate position, width, height and radius from the current rendered box to the destination using the configured duration. A new cue interrupts earlier movement and starts from the current rendered position. First appearance, seeking (including same-time seeks), recovery and changes while paused position immediately. Pause retains the highlight, settles any in-progress movement at the target and pauses ripple; resume restarts ripple. Stop, completion and fatal audio errors hide it and release tracking; destroy removes the owned nodes. Seeking while idle/ended/error does not create visible decoration. Stop/start reuse the same nodes until destruction.

A missing/detached target or one with no positive layout box or hidden/collapsed CSS visibility clears stale decoration and emits a recoverable warning; audio continues and the active timeline cue remains selected. Warnings are deduplicated per issue code and target ID per instance. A body-less document emits `RENDER_UNAVAILABLE`. No warning is emitted for a null target or an effect-none cue.

IDs and geometry are checked once per animation frame while a non-null, non-none cue is active in a visible document, including while playback is paused or buffering. ResizeObserver watches the current target; captured scroll and window resize events share the same pending frame. This also detects transform-only changes, sibling layout shifts and target removal/replacement without a seek. Missing targets stay eligible for automatic recovery while their cue remains active. No DOM-wide mutation observer is installed.

Tracking writes geometry only when it changes. If the target moves during a transition, movement is cancelled and the highlight follows its current box immediately rather than repeatedly restarting the transition. This keeps user scrolling aligned. Hidden documents suspend geometry frames and pause ripple; visibility recovery refreshes geometry immediately. Stop, null/none cues, end, fatal errors and destroy disconnect observers/listeners and cancel queued frames and movement.

Phase 5 brings off-screen targets into view using viewport and ancestor clipping checks. With scrolling disabled, an off-screen cutout can still leave a backdrop over the viewport. Visibility checks do not detect overlapping elements or all transformed clipping geometry. Highlight tracking and player placement read the active target during playback; verify performance on complex host pages.

Theme configuration supplies inline custom properties on the overlay root: `--chaley-walkthrough-overlay-opacity`, `--chaley-walkthrough-highlight-color` and `--chaley-walkthrough-border-radius`. Prefer configuration for these values. The stylesheet also exposes `--chaley-walkthrough-z-index` (default 2147483000), which can be set on `.chaley-walkthrough-root`. No global element selectors are installed.

`prefers-reduced-motion: reduce` disables ripple and forces instant positioning. Preference changes are handled live: enabling it cancels current movement and settles the highlight at its target. Ripple has two 1600ms cycles staggered by 800ms; these decorative timings are fixed in this phase, not new configuration fields. The layers remain pointer-transparent and do not move keyboard focus.

Native modal dialogs opened with `showModal()` are supported in browsers with `:modal` and the Popover API. No configuration change is needed. The player and highlighter move into a shared manual popover inside the active modal, escaping its clipping and transforms while remaining part of its interactive subtree. They return to the body on close/removal, including while paused or showing a caption-only cue. Ordinary non-modal dialogs (`show()` or `open`) use the regular body overlay.

Chaley does not open or close your dialogs automatically: author a click action on an application button to invoke its handler, then target dialog content in later cues. Close the dialog through your own handler before targeting outside controls; outside content retains native modal inertness. Seeking does not reconstruct dialog state. Escape stops an active tour and leaves the dialog open; a subsequent Escape follows normal dialog behavior. A previously prevented Escape is respected. No focus trap or automatic target focus is added.

The host uses a manual popover because top-layer elements escape ancestor clipping and positioning ([Popover documentation](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/popover)). Older browsers without the Popover API fall back to dialog-descendant mounting, which cannot guarantee positioning through transformed/clipped dialogs. Arbitrary popovers opened above the tour, fullscreen, iframes, shadow DOM and transformed body/root stacking contexts remain outside supported coverage. A high z-index cannot solve every stacking context. See [dialog assessment](phases/DIALOG_SUPPORT.md). Reduced-motion and input tests are not a claim of accessibility compliance.

## Automatic scrolling (Phase 5)

Visible targets are left in place. Other targets use native `scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" })`, including nested scroll containers and CSS scroll margins. Reduced motion uses `instant`. Full target containment is required, with one pixel tolerance; oversized targets may never satisfy it.

Audio continues while scrolling. The old spotlight is hidden and the new one appears after three stable, visible frames. Waiting stops after two seconds with a recoverable `SCROLL_INCOMPLETE` warning if the target is still inaccessible. Cue change, seek, stop, end and destroy cancel the wait and freeze the native scroll chain at its current position. A seek may initiate a new scroll to its destination. Pause cancels actions but lets scrolling finish. Leave enough narration time for scrolling and transitions.

## Developer-controlled actions (revised in Phase 7)

```js
const tour = new Walkthrough({
  audio: "/audio/tour.mp3",
  // Adding action descriptors opts in; allowActions: false disables them.
  timeline: [
    { time: 0, target: null },
    { time: 2, target: "#open-menu", action: { type: "click" } },
    { time: 5, target: "#menu-content" },
    {
      time: 9,
      target: "#hold-options",
      action: { type: "longpress", holdDuration: 800 },
    },
  ],
});
```

The developer chooses the target and action. Click uses `HTMLElement.click()` after target resolution, visibility, scrolling and highlight movement completion. `effect: "none"` deliberately skips decoration but still requires visibility. Action readiness waits at most two seconds plus the configured transition duration after scrolling.

Adding an action descriptor enables it; no visitor approval is requested. Set `allowActions: false` only when you want to disable all actions for that instance. Each eligible cue has at most one attempt per run. A cancelled/unready attempt is not retried on resume or revisiting the cue; restart or a fresh start after stop/end resets attempts. Pause, buffering, hidden tabs, seek, cue change, stop and destroy cancel pending actions. Seeking to or across an action never executes it; later natural entry into an as-yet unattempted cue can execute it. Recovery selects the current cue without running missed actions. Seeking cannot reconstruct a dropdown or other UI state created by earlier actions.

Long press dispatches bubbling, cancelable, composed `pointerdown`, waits `holdDuration`, then dispatches `pointerup`. Events use `pointerId: 1`, `pointerType: "touch"`, `isPrimary: true`, `button: 0`, centre coordinates and `buttons: 1` on down / `0` on release. Cancellation dispatches `pointercancel` to the original element, including a detached element; host handlers must release press state on cancel. Removal, replacement or loss of visibility also cancels a held press. No mouse events, automatic click, context menu or trusted gesture are synthesized. There is no universal long-press DOM contract: host code must explicitly support this sequence. React handlers remain separately unverified.

There is no element-type safety filter: links, default buttons, labels and form controls are not rejected by the library. Developers decide whether an action is appropriate and whether navigation would interrupt their tour. Native behavior still applies: `HTMLElement.click()` does not activate a disabled native control, and synthetic events remain untrusted. `ACTION_SKIPPED` now indicates a missing/unready target, not a safety-policy rejection. Normal lifecycle cancellation emits no error. Browser restrictions on privileged APIs remain in force.

## Floating player (Phase 7)

The player appears during loading/playback, stays visible while paused, and offers replay after completion or retry after a media error. Stop hides it; destroy removes it. It uses native buttons and a labelled range input with visible focus outlines. Tab navigates controls, Space/Enter activates buttons, and arrow keys seek when the slider has focus. Escape stops the current session unless an earlier handler prevented the event. No focus trap or automatic target focus is used. Unknown or zero duration disables seeking.

Captions come from the active cue and display literally in a polite live region. The caption button is available only if the timeline has captions. `player: { position: "bottom-left", captions: false }` selects a preferred corner and initially hides captions. Placement tries another corner when it overlaps the target; this is best effort during state/clock updates, not a guarantee for targets covering the viewport. Screen-reader combinations require further testing.

Set these CSS custom properties on `:root` or `.chaley-walkthrough-player`:

| Property prefix: `--chaley-walkthrough-player-` | Default                       |
| ----------------------------------------------- | ----------------------------- |
| `background`, `color`                           | `#ffffff`, `#172033`          |
| `accent`                                        | Instance theme.highlightColor |
| `border`, `hover`                               | `#cbd5e1`, `#f1f5f9`          |
| `opacity`, `radius`                             | `1`, `16px`                   |
| `spacing`, `offset`                             | `16px`, `16px`                |
| `z-index`                                       | `2147483001`                  |

Player controls receive pointer events; the decorative highlight does not. The player remains usable with reduced motion and has no entrance animation. Colors and opacity remain the developer's responsibility when customizing contrast.

## Triggers and independent instances (Phase 8)

```js
const firstTour = new Walkthrough({
  audio: "/audio/first.mp3",
  trigger: "#start-first",
  timeline: [],
});
const secondTour = new Walkthrough({
  audio: "/audio/second.mp3",
  trigger: "#start-second",
  timeline: [],
});
firstTour.on("error", (issue) => console.warn(issue.code, issue.message));
secondTour.on("error", (issue) => console.warn(issue.code, issue.message));
```

Each constructor binds its own trigger and never starts audio. Trigger clicks prevent their default browser navigation/submission and call start; rejected playback promises are handled and reported through error events. Use accessible host buttons for keyboard activation. Starting another instance stops the previous session, including a paused or loading one, and cancels its scroll, action and media work before new playback. The old instance remains reusable at time zero. Completed/error players are also cleared when another tour starts. Destroying an inactive instance never stops the active tour.

Trigger IDs must exist at construction. Missing IDs emit `TRIGGER_NOT_FOUND`; duplicate assignments emit `TRIGGER_CONFLICT`, and the first binding wins. Warnings are queued to the next microtask so subscriptions added immediately after construction receive them. Conflicted/missing-trigger instances still support programmatic start. No document-wide mount observer is installed: if a trigger is mounted or replaced later, destroy and recreate that instance after mount. Destruction releases its trigger reservation and listener; stopping keeps the binding for reuse.

Use one loaded package copy/build per page so instances share the internal document coordinator. No public manager, tour identifier or configuration array is required. Latest start request wins even when lifecycle callbacks request a new start; superseded pending starts reject with AbortError. Destroy tours on route change/unmount; cross-page continuation remains out of scope.

## React lifecycle snippet

Use the same package after mount and destroy on cleanup. This guidance does not establish external React compatibility; StrictMode and linked-package caching need owner testing. Import `useRef` and `useEffect` from React and `Walkthrough` from this package.

```jsx
const tourRef = useRef(null);
useEffect(() => {
  const tour = new Walkthrough({ audio: "/audio/tour.mp3", timeline: [] });
  tourRef.current = tour;
  return () => {
    tourRef.current = null;
    tour.destroy();
  };
}, []);

// Bind to an existing button.
const startTour = () => {
  void tourRef.current?.start().catch((error) => {
    if (error.name !== "AbortError") console.error(error);
  });
};
```

## Safety and limitations

Use opt-in actions only for non-destructive UI changes. Do not automate submission, payments or deletion; avoid navigation controls. Synthetic events cannot provide trusted user gestures. Seeking will not reconstruct UI state from earlier actions. Long-press handler compatibility requires explicit testing.

Native modal dialog support is documented above; iframes and shadow DOM remain unsupported. Chrome test results are recorded in the phase reports; The current tested-browser matrix is in Phase 9; Safari and real mobile acceptance remain pending. There is no telemetry. Playback fetches the configured audio URL; remote hosts may receive requests. Serve audio with correct content type and byte-range support for seeking. Use original or licensed narration and leave time for scrolling and animations when authoring timestamps.

## Audio authoring and timestamps

Use original or appropriately licensed narration. Produce a browser-playable file, listen to the final exported recording, and record cue start times in seconds from that exact file. Re-exporting or trimming audio can invalidate timestamps. Start with a target-null introduction, add at least four distinct targets for a synchronization check, and optionally finish with a target-null closing cue. Cues remain active until the next timestamp; this library does not generate timestamps or captions.

Allow enough narration time for scroll settlement (up to two seconds), highlight movement (400ms by default), and any configured hold. Leave time after a menu-opening click before its content cue; the host application owns rendering delays. Audio continues while scrolling, so short cues may cancel actions before they can run. Large/inaccessible targets may never become fully visible. Check actual browser playback rather than assuming a file extension guarantees codec support.

Serve audio from the consumer's public asset URL, not a local filesystem path. Use the correct media content type and byte-range support for reliable seeking. Confirm the response is audio rather than an SPA HTML fallback, and check site CSP/media-src, mixed-content and authentication restrictions if loading fails. Remote audio hosts receive the configured requests; the library sends no telemetry or analytics. Generated test tones do not replace real-narration assessment.

## Troubleshooting

| Symptom                                      | Check or correction                                                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Constructor throws config.timeline[N].action | N is zero-based. Use an object: `{ type: "click" }` or `{ type: "longpress", holdDuration: 800 }`; omit action for no interaction. Strings/null/functions are invalid.                     |
| Unknown config field or enum                 | Check the configuration table. Validation intentionally rejects misspelled fields rather than silently ignoring them.                                                                      |
| Trigger has no effect                        | Initialise after mount, use a unique literal ID, subscribe immediately to error events and inspect TRIGGER_NOT_FOUND/TRIGGER_CONFLICT. Recreate after trigger replacement.                 |
| Audio rejected or fails to load              | Start from a user gesture; catch start/resume promises. Inspect PLAYBACK_REJECTED/MEDIA_ERROR and the Network response for the configured URL.                                             |
| No highlight or unstyled player              | Import the separate stylesheet. Confirm positive visible target geometry and no unsupported iframe/shadow-root lookup.                                                                     |
| ACTION_SKIPPED or SCROLL_INCOMPLETE          | Check current target visibility/attachment, clipping, target size and cue spacing. These are readiness checks, not element-type safety filtering.                                          |
| Action never runs after seeking              | Expected: seeks do not execute actions. Replay naturally to reproduce earlier UI actions. Also check explicit allowActions=false.                                                          |
| Long press remains stuck in host UI          | Handle pointercancel and component unmount cleanup. Synthetic events do not create a universal native longpress.                                                                           |
| Two players or conflicting sessions          | Use one package copy/build; do not mix separately loaded ESM and IIFE copies. Destroy instances on unmount.                                                                                |
| npm link changes do not appear               | Keep npm run dev running in the library; restart the consumer dev server and clear its dependency cache. Test the archive to remove symlink ambiguity.                                     |
| Node import succeeds but constructor fails   | Expected SSR behavior: import on the server is safe; construct only after browser mount.                                                                                                   |
| A dialog or header covers the highlight      | Use the rebuilt JS and CSS together. Native modal support requires `:modal` and the Popover API; check custom CSS and other top-layer popovers. Iframes and shadow DOM remain unsupported. |

For reproducible defects, include package version, browser/OS, installation method, smallest cue/host handler and error-event output. The owner testing order and report template are in [Phase 10](phases/PHASE_10.md); publication gates are in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).
