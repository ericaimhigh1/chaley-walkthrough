# Usage and local development

## Implementation status

Phase 3 adds static highlights, a transparent-cutout backdrop and runtime ID resolution to the audio core. Construction creates no media or overlay DOM. Start creates audio lazily; the first drawable cue creates the highlight. Animation, geometry tracking, scrolling, actions, player UI, trigger binding and document-wide coordination remain for later phases. Use one playing instance at a time until Phase 8 introduces exclusive playback.

See [Phase 1](phases/PHASE_1.md), [Phase 2](phases/PHASE_2.md) and [Phase 3](phases/PHASE_3.md) for capabilities, assessment steps, errors and results. The owner reported successful Phase 1 export testing. Full external vanilla/React integration remains pending. Phase assessment files are included in the npm archive.

## Local development

In this library repository:

```sh
npm install
npm run build
npm link
npm run dev
```

`dev` rebuilds library JavaScript, CSS and declarations in watch mode; it does not serve an application. Stop it with Ctrl+C. In PowerShell environments that block `npm.ps1`, use `npm.cmd` or `cmd /c npm`.

The owner creates consumer projects separately. In a separate consumer project, run `npm link chaley-walkthrough`. Validate vanilla JavaScript first, then React against the same package. No consumer application is included here. Restart the consumer's dev server or clear its dependency cache if linked changes do not appear. External testing is pending.

Run `npm run typecheck`, `npm test`, and `npm run build` for library checks. `npm pack` runs these checks and creates the publishable archive. The provisional package name must be checked before release.

Run `npm run test:browser` separately for Playwright tests against installed Google Chrome in headless mode. The command builds first, then uses minimal routed fixtures and generated PCM audio without an application server. Install Chrome if unavailable. Other browsers, real narration and external consumer projects require separate assessment.

## Current ESM entry

```js
import { Walkthrough } from "chaley-walkthrough";
import "chaley-walkthrough/style.css";

// Initialise after mount. Trigger binding is not implemented yet.
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
| `audio`                       | Required non-empty URL string. Media failures are reported during playback.                  |
| `timeline`                    | Required array; empty is allowed for audio-only playback.                                   |
| `trigger`                     | Optional literal HTML ID prefixed with `#`; binding arrives in Phase 8.                     |
| `allowActions`                | Boolean; defaults to `false`. Execution arrives in Phase 6.                                 |
| `defaults.scroll`             | Boolean; defaults to `true`.                                                                |
| `defaults.effect`             | `ripple`, `spotlight`, `none`; defaults to `ripple`.                                        |
| `defaults.transition`         | `move`, `instant`; defaults to `move`.                                                      |
| `defaults.transitionDuration` | Finite non-negative number; defaults to `400`.                                              |
| `theme.overlayOpacity`        | Number between 0 and 1 inclusive; defaults to `0.1`.                                        |
| `theme.highlightColor`        | Non-empty CSS color string; defaults to `#6366f1`. Phase 1 does not parse CSS color syntax. |
| `theme.padding`               | Finite non-negative number; defaults to `6` pixels.                                         |
| `theme.borderRadius`          | Finite non-negative number; defaults to `8` pixels.                                         |

Each cue requires a finite, non-negative `time` and a `target` that is either `null` or a `#`-prefixed ID. Times must be strictly increasing; duplicates are rejected rather than sorted. IDs must be unique in the host document and contain no ASCII whitespace. References are literal IDs, not CSS selectors, so punctuation does not require CSS escaping.

Cues may override `scroll`, `effect`, `transition` and `transitionDuration` using the same validation rules as defaults. Optional `caption` must be a string and will be rendered as text, never HTML. `target: null` clears both highlight and backdrop. Scroll and transition options are validated but not implemented yet.

Optional `action` is either `{ type: 'click' }` or `{ type: 'longpress', holdDuration: 800 }`. Long-press duration must be finite and positive. Actions require a non-null target and are validated even when `allowActions` is false. `holdDuration` is invalid on click actions.

The timeline selects the latest cue at or before the audio clock, returning no cue before the first timestamp or for an empty timeline. Completion clears the cue. Cues beyond finite known duration emit recoverable warnings once per cue per instance.

## Playback API and events

The package exports `WalkthroughConfig`, `TimelineCue`, `CueOptions`, `CueAction`, `WalkthroughTheme`, `WalkthroughState`, `WalkthroughStatus`, `IdReference`, `Effect`, `Transition`, `CueChangeReason`, `CueChangeEvent`, `WalkthroughIssue` and `WalkthroughEventMap` as TypeScript types.

| Member | Behaviour |
| --- | --- |
| `start(): Promise<void>` | Starts idle/ended/error at zero; resumes paused; no-op while playing. Repeated pending starts share a promise. |
| `pause(): void` | Pauses playing/loading at the current position. Cancels pending play with `AbortError`. Other live states are unchanged. |
| `resume(): Promise<void>` | Resumes paused playback; otherwise no-op or shares a pending play request. |
| `seek(seconds): void` | Immediately reconciles time/cue; finite non-negative seconds required. Clamps to known duration, queues media seek before metadata. Executes no actions. |
| `restart(): Promise<void>` | Cancels the old run and starts at zero. |
| `stop(): void` | Releases audio, resets time to zero and cue to null, returns to `idle`. |
| `destroy(): void` | Terminal, idempotent cleanup of media, frames and listeners; resets time/cue. |
| `state` | Frozen snapshot: `status`, `currentTime`, `duration`, `activeCue`. Unknown duration is `null`; known duration is retained after stop/destroy. |
| `on(event, listener)` | Subscribes to future events and returns an idempotent unsubscribe function. Read `state` for initial state. |

After destruction, asynchronous methods reject; other mutators and new subscriptions throw. Reading `state` and existing unsubscribe functions remain safe. Catch playback promises: interruptions reject with `AbortError`, while playback failures reject with the underlying cause. Stale promises cannot revive a cancelled session. Resume after cancellation of a pending play uses a fresh media element at the preserved position.

Seeking while idle/ended/error updates the snapshot without changing status or starting audio. A subsequent `start()` begins at zero. To start at another position, call start from a gesture then seek; when paused, seek then resume.

| Event | Payload |
| --- | --- |
| `statechange` | Frozen state whenever any field changes, including clock updates. |
| `cuechange` | `{ cue, previousCue, reason, state }`, only when cue identity changes, including clearing. |
| `complete` | Final ended snapshot, emitted on media completion, not stop. |
| `error` | `{ code, message, recoverable, cause?, cue? }`, including nonfatal warnings. |

Cue reasons: `start`, `resume`, `playback`, `seek`, `recovery`, `stop`, `ended`, `error`, `destroy`. Seeking and recovery select only the current cue, without a backlog. Media events supplement animation-frame polling; no independent timeline timer is used. `loading` covers initial start and buffering. Hidden-tab recovery reconciles with the media clock. Subscriber exceptions are logged and isolated; keep listeners lightweight.

Audio error codes are `PLAYBACK_REJECTED`, `MEDIA_ERROR`, `SEEK_FAILED` and `CUE_BEYOND_DURATION`. Phase 3 adds recoverable visual warnings: `TARGET_NOT_FOUND`, `TARGET_NOT_RENDERABLE` and `RENDER_UNAVAILABLE`. Direct seek failure emits a recoverable error and throws; deferred seek failure terminates the attempt. `recoverable: false` means the attempt failed, not that the instance is destroyed: start can retry. Browser autoplay restrictions still apply; see [MDN's play promise reference](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play).

```js
const unsubscribe = tour.on("cuechange", ({ cue, reason }) => {
  console.log(cue, reason);
});
tour.on("error", issue => console.warn(issue.code, issue.message));
document.getElementById("start-tour").addEventListener("click", () => {
  void tour.start().catch(error => {
    if (error.name !== "AbortError") console.error(error);
  });
});
// On application cleanup: unsubscribe(); tour.destroy();
```

## Static highlighting (Phase 3)

Import `chaley-walkthrough/style.css` (or link the generated stylesheet for script-tag usage). CSS is required for positioning, dimming and pointer pass-through. Targets are literal document IDs resolved using `getElementById()` after removing the first `#`; punctuation needs no CSS escaping. IDs must be unique. Initialise after the host DOM exists.

One fixed, decorative root is appended to the document body on the first drawable cue. It contains a persistent outline with a transparent interior and a large outer shadow for the backdrop. The default dimming opacity is 0.1; padding is 6px, radius 8px and outline color #6366f1. The host target is not modified, clicked or focused. The root is hidden from assistive technology and both layers pass pointer events through to application controls.

| Setting | Current rendering |
| --- | --- |
| `effect: 'spotlight'` | Static outline plus backdrop. |
| `effect: 'ripple'` (default) | The same static outline plus backdrop for Phase 3. Expanding ripple rings arrive in Phase 4. |
| `effect: 'none'` | Clears outline and backdrop for that cue. Overrides the instance default. |
| `target: null` | Clears all visual decoration. |
| `theme.overlayOpacity: 0` | Transparent backdrop; outline remains. |
| `theme.highlightColor`, `padding`, `borderRadius` | Set outline color, outside padding and cutout/outline radius. |

Geometry is sampled on cue changes, explicit seek (even to the same time), start/resume and playback-status changes. Pause retains the highlight. Stop, completion and fatal audio errors hide it; destroy removes the owned nodes. Seeking while idle/ended/error does not create visible decoration. Stop/start reuse the same nodes until destruction.

A missing/detached target or one with no positive layout box or hidden/collapsed CSS visibility clears stale decoration and emits a recoverable warning; audio continues and the active timeline cue remains selected. Warnings are deduplicated per issue code and target ID per instance. A body-less document emits `RENDER_UNAVAILABLE`. No warning is emitted for a null target or an effect-none cue.

IDs are re-resolved at each render, so a later seek, cue activation or resume can find a newly mounted/replaced target. **Continuous observation is not implemented yet:** scrolling, resizing, layout changes and target removal during an unchanged cue may leave stale geometry until reconciliation. Phase 4 adds tracking. Phase 5 adds scrolling and clipping-aware visibility checks. Off-screen targets are not brought into view; a backdrop may cover the viewport when the cutout is outside it. Ancestor opacity, occlusion and nested clipping are not assessed by the basic resolver.

Theme configuration supplies inline custom properties on the overlay root: `--chaley-walkthrough-overlay-opacity`, `--chaley-walkthrough-highlight-color` and `--chaley-walkthrough-border-radius`. Prefer configuration for these values. The stylesheet also exposes `--chaley-walkthrough-z-index` (default 2147483000), which can be set on `.chaley-walkthrough-root`. No global element selectors are installed.

Native dialogs/top-layer content, iframes, shadow DOM and transformed body/root stacking contexts are outside MVP support. A high z-index cannot solve every stacking context. There is no motion in Phase 3, including when reduced motion is requested; this is not a claim of accessibility compliance.

## React lifecycle snippet

Use the same package after mount and destroy on cleanup. This guidance does not establish external React compatibility; StrictMode and linked-package caching need owner testing. Import `useRef` and `useEffect` from React and `Walkthrough` from this package.

```jsx
const tourRef = useRef(null);
useEffect(() => {
  const tour = new Walkthrough({ audio: "/audio/tour.mp3", timeline: [] });
  tourRef.current = tour;
  return () => { tourRef.current = null; tour.destroy(); };
}, []);

// Bind to an existing button.
const startTour = () => {
  void tourRef.current?.start().catch(error => {
    if (error.name !== "AbortError") console.error(error);
  });
};
```

## Safety and limitations

Use future opt-in actions only for non-destructive UI changes. Do not automate submission, payments or deletion; avoid navigation controls. Synthetic events cannot provide trusted user gestures. Seeking will not reconstruct UI state from earlier actions. Long-press handler compatibility requires explicit testing.

Animated rendering, geometry tracking, scrolling, keyboard player controls, captions and player theming are pending. Native dialog stacking, iframes and shadow DOM are outside MVP support. Chrome test results are recorded in the phase reports; Firefox, Safari, Edge and mobile remain untested. There is no telemetry. Playback fetches the configured audio URL; remote hosts may receive requests. Serve audio with correct content type and byte-range support for seeking. Use original or licensed narration and leave time for future scrolling and animations.
