# Usage and local development

## Implementation status

Phase 1 implements package scaffolding, public configuration/state types, configuration validation and internal pure timeline lookup. The exported `Walkthrough` constructor currently validates and stores configuration only. It does not fetch audio, bind triggers, create UI or play a walkthrough. Playback/lifecycle methods and event subscriptions will be introduced in subsequent phases; they are not exposed as no-op methods.

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

## Current ESM entry

```js
import { Walkthrough } from 'chaley-walkthrough';
import 'chaley-walkthrough/style.css';

// Phase 1: validates configuration only. No playback or trigger binding yet.
const tour = new Walkthrough({
  audio: '/audio/tour.mp3',
  timeline: [
    { time: 0, target: null, caption: 'Welcome.' },
    { time: 3.5, target: '#wallet' },
  ],
});
```

Module imports are safe without `window` or `document`. Construct instances only in the browser. Each instance owns a frozen copy of its configuration. The original object is not frozen or modified. There is no public manager or configuration array.

## Direct script tags

Serve the generated files from `dist` with your site's assets:

```html
<link rel="stylesheet" href="/vendor/chaley-walkthrough/style.css">
<script src="/vendor/chaley-walkthrough/chaley-walkthrough.iife.js"></script>
<script>
  const tour = new ChaleyWalkthrough.Walkthrough({
    audio: '/audio/tour.mp3',
    timeline: []
  });
</script>
```

This is the same configuration-only scaffold. The browser bundle exposes `ChaleyWalkthrough.Walkthrough`. CSS is exported separately; CommonJS is not provided. Real-browser script-tag execution remains pending.

## Configuration reference

All timestamps are seconds; transition and hold durations are milliseconds. Unknown fields and invalid values throw `TypeError` with a field path. Configuration is data, not executable callbacks.

| Field | Requirement/default |
| --- | --- |
| `audio` | Required non-empty URL string. Media loading/playability is checked in a later phase. |
| `timeline` | Required array; empty is allowed for audio-only playback in later phases. |
| `trigger` | Optional literal HTML ID prefixed with `#`; binding arrives in Phase 8. |
| `allowActions` | Boolean; defaults to `false`. Execution arrives in Phase 6. |
| `defaults.scroll` | Boolean; defaults to `true`. |
| `defaults.effect` | `ripple`, `spotlight`, `none`; defaults to `ripple`. |
| `defaults.transition` | `move`, `instant`; defaults to `move`. |
| `defaults.transitionDuration` | Finite non-negative number; defaults to `400`. |
| `theme.overlayOpacity` | Number between 0 and 1 inclusive; defaults to `0.1`. |
| `theme.highlightColor` | Non-empty CSS color string; defaults to `#6366f1`. Phase 1 does not parse CSS color syntax. |
| `theme.padding` | Finite non-negative number; defaults to `6` pixels. |
| `theme.borderRadius` | Finite non-negative number; defaults to `8` pixels. |

Each cue requires a finite, non-negative `time` and a `target` that is either `null` or a `#`-prefixed ID. Times must be strictly increasing; duplicates are rejected rather than sorted. IDs must be unique in the host document and contain no ASCII whitespace. References are literal IDs, not CSS selectors, so punctuation does not require CSS escaping.

Cues may override `scroll`, `effect`, `transition` and `transitionDuration` using the same validation rules as defaults. Optional `caption` must be a string and will be rendered as text, never HTML. `target: null` clears the highlight once rendering is implemented.

Optional `action` is either `{ type: 'click' }` or `{ type: 'longpress', holdDuration: 800 }`. Long-press duration must be finite and positive. Actions require a non-null target and are validated even when `allowActions` is false. `holdDuration` is invalid on click actions.

The internal timeline lookup selects the latest cue whose time is at or before the clock, returning no cue before the first timestamp or for an empty timeline. Completion clearing and warnings about cues beyond known media duration belong to the audio phase.

## Public types and future playback

The package exports `WalkthroughConfig`, `TimelineCue`, `CueOptions`, `CueAction`, `WalkthroughTheme`, `WalkthroughState`, `WalkthroughStatus`, `IdReference`, `Effect` and `Transition` as TypeScript types. State is defined with read-only `status`, `currentTime`, `duration` and `activeCue`; unknown duration is `null`. Runtime state subscriptions are not implemented yet.

The specification reserves `start`, `pause`, `resume`, `seek`, `stop`, `restart` and `destroy` for subsequent phases. React integration examples will be added once lifecycle methods exist: initialise after mount, destroy on cleanup, and verify StrictMode's repeated setup/cleanup using the separate consumer project. No React runtime dependency or wrapper is included.

## Safety and limitations

Use future opt-in actions only for non-destructive UI changes. Do not automate submission, payments or deletion; avoid navigation controls. Synthetic events cannot provide trusted user gestures. Seeking will not reconstruct UI state from earlier actions. Long-press handler compatibility requires explicit testing.

Rendering, scrolling, keyboard controls, captions and player theming are pending. Native dialog stacking, iframes and shadow DOM are outside MVP support. Current Chrome, Firefox, Safari, Edge and mobile layouts have not been tested. There is no telemetry. Later playback will fetch the configured audio URL; remote audio hosts may receive those requests. Use original or appropriately licensed narration and allow time for scrolling and animations when authoring timestamps.
