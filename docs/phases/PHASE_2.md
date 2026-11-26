# Phase 2 assessment: audio playback and cue synchronisation

**Baseline:** `0.1.0-phase.2`  
**Scope:** Phase 2 of [PROJECT_SPEC.md](../../PROJECT_SPEC.md).  
**Previous baseline:** [Phase 1](PHASE_1.md).  
**Status:** Audio core implemented; verification recorded below. Visual walkthrough features remain pending.

## 1. Implemented capabilities

| Capability | Behaviour | Implementation |
| --- | --- | --- |
| Lazy audio | No media creation/fetch during construction. Start creates a detached audio element. | `src/core/AudioController.ts` |
| Playback controls | Start, pause, resume, seek, restart, stop and destroy. Calls play synchronously from the initiating gesture. | `src/core/Walkthrough.ts` |
| Media-clock synchronisation | Reads audio currentTime through animation frames and media events; selects the latest cue at or before the clock. | `Walkthrough.ts`, `Timeline.ts` |
| Observable state | Frozen snapshots and typed subscriptions for state, cue, completion and errors. | `Walkthrough.ts`, `types.ts` |
| Recovery | Loading state during waiting; media/visibility events recover the current cue without emitting skipped cues. | `Walkthrough.ts` |
| Seeking | Immediate snapshot update, deferred pre-metadata seek, clamping to finite known duration. | `AudioController.ts`, `Walkthrough.ts` |
| Cancellation | Interrupted play requests reject; stale media promises/events/frames cannot revive the old session. | `Walkthrough.ts` |
| Cleanup | Stop/completion/error/destroy release media and visibility listeners. Destroy also clears subscriptions. | `AudioController.ts`, `Walkthrough.ts` |
| Errors | Rejected play, load/decode errors, seek errors and warnings for cues beyond duration. | `Walkthrough.ts` |

No runtime dependencies were added. Playwright is a development dependency for automated library tests. Assessment files are now included in npm archives.

## 2. Public API and state contract

| Operation | Expected behaviour |
| --- | --- |
| Construct | Idle, time zero, duration null, cue null; no audio/UI work. |
| Start from idle/ended/error | Begins at zero. Returns the playback-attempt promise. |
| Start while paused | Resumes preserved position. |
| Repeated pending starts | Same promise, no duplicate play call. |
| Start while playing/buffering after playback began | Does not restart. |
| Pause | Captures position and stops advancement. Pending play is cancelled with AbortError. |
| Resume | Resumes paused; otherwise no-op or shares pending play. |
| Seek | Finite non-negative seconds; immediate time/cue update; preserves status. Clamps to known duration. |
| Restart | Cancels the previous run and begins at zero. |
| Stop | Idle, time zero, cue null; known duration retained. |
| Natural end | Ended, final media position, cue null; one completion event. |
| Destroy | Terminal and idempotent; resets time/cue and releases owned resources/subscriptions. |

The full method signatures and event payloads are in [USAGE.md](../USAGE.md#playback-api-and-events). New exported types are `CueChangeReason`, `CueChangeEvent`, `WalkthroughIssue` and `WalkthroughEventMap`.

After destruction, start/resume/restart reject; pause/seek/stop/on throw. Reading state, repeated destroy and existing unsubscribe functions remain valid. State and cue payloads are frozen. Input configuration remains isolated from caller mutations.

Seeking while idle/ended/error does not start playback. A later start resets to zero. A paused seek is retained for resume. Pre-metadata seeks may initially show the requested value and then clamp after duration arrives.

### Events

`on(name, listener)` returns an unsubscribe function and does not emit an initial notification; read `tour.state` directly.

| Event | Payload/delivery |
| --- | --- |
| `statechange` | Frozen snapshot whenever a field changes, including clock updates. |
| `cuechange` | `{ cue, previousCue, reason, state }` only when cue identity changes. Null clears the cue. |
| `complete` | Final ended snapshot; not fired by stop/destroy. |
| `error` | `{ code, message, recoverable, cause?, cue? }`, including nonfatal warnings. |

Cue reasons distinguish start/resume, playback, seek, recovery and clearing. Subscribers may stop or destroy the instance; stale cue notifications are suppressed. Listener exceptions are logged and isolated. No actions execute in this phase, regardless of `allowActions`.

## 3. Repeatable automated assessment

Run from the library repository:

```sh
npm ci
npm run typecheck
npm test
npm run test:browser
npm pack
```

Use `npm.cmd` if PowerShell blocks npm.ps1. Browser tests build first and use installed Google Chrome in headless mode. They do not start an application server or create an external consumer project. npm pack runs type checks, unit tests and the build; browser tests must be run separately.

The browser fixture routes minimal HTML controls, packaged builds and an original generated six-second PCM tone. It supports HTTP byte ranges. This tests real media APIs, but the tone is not narration. No visual target assertions are made because rendering starts in Phase 3.

| Area | Expected result |
| --- | --- |
| Unit suite | Phase 1 regressions plus lifecycle, seeking, buffering, cancellation, errors, subscriptions and cleanup. |
| Real ESM audio | Four cues at 0/1/2/3 seconds; each observed selection within 0.5 seconds of its cue time. |
| Pause/resume/seek | Frozen paused time, resume at selected position, backward and forward seek. |
| Completion/replay | Cue clears once at end; replay begins near zero. |
| Missing media | Error status and MEDIA_ERROR notification. |
| IIFE | Script-tag global plays real audio from a clicked button. |
| Package | ESM/IIFE, CSS, declarations and phase assessments in archive. |

This short fixture does not establish long-recording drift, perceived narration alignment or every browser/codec's timing accuracy.

## 4. Owner assessment in an existing consumer

Use an original or licensed browser-playable recording. Bind controls in the existing consumer; no trigger binding or floating player exists yet.

```js
const tour = new Walkthrough({
  audio: '/audio/your-recording.mp3',
  timeline: [
    { time: 0, target: null, caption: 'Welcome' },
    { time: 2, target: '#first-target' },
    { time: 4, target: '#second-target' },
    { time: 6, target: '#third-target' },
  ],
});
tour.on('statechange', state => console.log('State', state));
tour.on('cuechange', event => console.log('Cue', event));
tour.on('complete', state => console.log('Complete', state));
tour.on('error', issue => console.warn(issue.code, issue.message));

// Bind to an existing button click handler.
async function startTour() {
  try { await tour.start(); }
  catch (error) {
    if (error.name !== 'AbortError') console.error(error);
  }
}
```

1. Click start. Expect audible narration, loading then playing, and clock updates. Nothing is highlighted yet.
2. Pause after several seconds. Position must remain fixed. Resume from a click and verify continuation from that position.
3. Pause, seek to 4, then resume. Expect immediate cue reconciliation and audio from that position.
4. Seek across multiple timestamps. Expect only the selected cue; no simulated actions.
5. Switch tabs and return. Expect reconciliation with the media clock without replaying missed cues. Browser/OS policies may suspend background audio.
6. Let audio finish. Expect ended, cue null and one completion event. Restart at zero.
7. Stop during playback. Expect silence, idle, zero time, no cue. Start again to verify reuse.
8. Destroy during playback/loading. Expect released audio and terminal state. Repeated destroy is harmless.

Catch every asynchronous playback call. Interrupting a pending call produces AbortError without a fatal error event. Test one playing instance at a time until Phase 8 implements exclusivity.

## 5. Expected errors and warnings

| Condition | Expected result |
| --- | --- |
| Invalid configuration | Phase 1 TypeError with field path. |
| Negative/non-finite seek | RangeError; previous state preserved. |
| Rejected play | Promise rejects, error status, PLAYBACK_REJECTED event. Retry start from a gesture. |
| Missing/unsupported audio | MEDIA_ERROR, cue cleared, pending start rejects if still pending. |
| Direct seek failure | Recoverable SEEK_FAILED event and thrown exception; snapshot unchanged. |
| Deferred seek failure | SEEK_FAILED; current playback attempt fails. |
| Cue beyond finite duration | One CUE_BEYOND_DURATION warning per cue per instance. Playback continues. Exactly-at-duration cues are not warned. |
| Interrupt pending play | AbortError rejection; stale work ignored. |
| Method after destroy | Exception/rejection according to Section 2. |
| Subscriber throws | Logged subscriber exception; playback continues. |

Recoverable false means the attempt failed, not that the instance is destroyed; start can retry. Non-finite duration is represented as null. No duration warnings occur until finite duration is available.

## 6. Verification record

| Check | Recorded result |
| --- | --- |
| Type checking | Passed: npm run typecheck. |
| Unit suite | Passed: 99 tests across 4 files. |
| Build | Passed: ESM, IIFE, CSS and declarations generated. |
| Chrome real-media tests | Passed: 3 tests. Chrome 157.0.8103.40, Windows, headless. |
| Archive | Passed: npm pack, including prepack checks; ESM/IIFE, CSS, declarations, usage and both phase reports included. |
| Real narration and long-duration timing | Pending; automated media is a generated tone. |
| External vanilla/React | Pending owner testing. No external application created or modified. |
| Firefox, Safari, Edge, mobile | Untested in this phase. |

The first browser seek test failed because the routed fixture did not serve byte ranges. Adding range responses fixed it. Playwright also needed an approved rerun outside sandbox process restrictions. Blocked/failed runs are not counted as passed. Phase 1 owner export success is recorded separately and is not Phase 2 acceptance evidence.

## 7. Known limits and troubleshooting

- Highlights, scrolling, actions, captions UI and player controls remain pending. Assess cue/state events now.
- Trigger is validated but not bound. Use explicit host click handlers.
- Cross-instance exclusivity remains Phase 8; per-instance cancellation does not establish it.
- Browser autoplay/codec policies apply. Start from a gesture and handle rejection.
- For incorrect seeking, check audio response content type and byte-range support. No proxy or hosted media service is provided.
- Consumers must destroy instances on unmount/navigation; cross-page continuation is out of scope.
- SSR imports are supported; instantiate only in a browser. React lifecycle guidance is in USAGE.md, but external React/StrictMode testing is pending.
- Background recovery, rejection and cleanup races have deterministic unit coverage; not every browser/OS suspension or network condition was reproduced in Chrome.

For defects, record package/build format, browser/version, OS, minimal config, lifecycle call order, expected versus observed state, and complete errors. Check whether media seeking works outside the library. Do not share credentials or private media URLs.

## 8. Next phase

Phase 3 adds static highlighting, backdrop and runtime target resolution, with its own assessment document. Animation, scrolling, actions, player UI and exclusive playback remain in their scheduled phases.
