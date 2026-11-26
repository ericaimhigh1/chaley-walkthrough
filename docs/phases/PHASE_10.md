# Phase 10 assessment: owner integration handoff

Candidate: 0.1.0-rc.1, unpublished. **Handoff prepared; full integration acceptance remains open.** Phase 10 requires separate vanilla testing followed by React testing. No external consumer application has been created or modified by this task.

## Evidence so far

| Check | Status | Evidence |
| --- | --- | --- |
| Separate vanilla project | Owner-reported pass | On 2026-11-26: "Yes. In a vanilla project and it works fine". Browser/version, framework tooling and detailed checks unspecified. |
| Earlier export check | Owner-reported pass | Phase 1 exports were reported working. |
| Malformed action diagnostic | Library fix verified | Object descriptors required; error identifies cue path and shows click/longpress examples. Subsequent validation tests passed. |
| Separate React project | Pending | No execution result supplied. |
| Real recorded narration / four-target timing | Pending external evidence | Automated media tests use an original generated PCM tone. |
| Cross-browser/device acceptance | Partial automated evidence | Packaged tests passed in Chrome 158.0.8127.37 and Edge 158.0.4370.33 on Windows (58 each). Firefox, Safari and real mobile acceptance pending. |
| Published release | Not performed | Ownership metadata and owner release authorization are outstanding. |

## Install this candidate

Use the packed artifact to avoid link-cache ambiguity. In the owner's existing consumer project:

```sh
npm install /absolute/path/to/chaley-walkthrough-0.1.0-rc.1.tgz
```

Windows example: npm.cmd install "C:/Users/erica/Desktop/chaley-walkthrough/chaley-walkthrough-0.1.0-rc.1.tgz". Alternatively follow npm link in USAGE.md, restart the consumer server after rebuilds and confirm it resolves the same package copy. Import the separate stylesheet. Keep testing in your own projects.

## Ordered assessment

### A. Vanilla confirmation

The broad vanilla pass is recorded above. For release evidence, record browser/version and verify:

1. Four or more IDs activate in order with your actual narration. Use fractional timestamps if needed; compare late cues as well as early ones for drift.
2. Pause/resume, seek forward/backward, replay, stop and end behave correctly. Seeking never fires actions or reconstructs UI opened by earlier actions.
3. Scrolling reaches distant and nested targets; rapid seeks/stop do not leave stale highlights or actions.
4. A configured click opens a dropdown; the next cue finds its content. Long press uses down/hold/up, and pointercancel clears host state on interruption.
5. Player keyboard navigation, Escape, captions as text, reduced motion and custom contrast work in your page.
6. Two independent triggers switch tours, including a paused session. Destroying an inactive tour leaves the active one alone.
7. Missing/replaced targets, invalid action descriptors, blocked media playback and loading errors produce useful diagnostics.

### B. React after vanilla

Use the same installed artifact, without a React wrapper or separate library build:

1. Construct inside useEffect after targets/triggers mount and destroy in its cleanup. Import CSS once. Store the instance in a ref; do not construct during render.
2. Enable development StrictMode. Confirm setup/cleanup/setup leaves one trigger binding and one active player, with no duplicate action execution.
3. Mount/unmount the tour component repeatedly and change route while a press or scroll is pending. Confirm audio stops and owned DOM/listeners disappear.
4. Replace a target with the same ID during a render; verify geometry recovery. Recreate the tour if its trigger element is replaced.
5. Test React onClick and compatible pointer handlers. In particular, reset host press state during unmount: delegated handlers may not observe pointercancel on an already detached element.
6. Run the vanilla playback/player/action checklist again in React. Check production build as well as development, using one package copy.

### C. Browser and device matrix

Record Chrome, Firefox, Safari and Edge versions plus representative mobile web devices. Include playback permission, actual audio codec, smooth-scroll cancellation, reduced motion, pointer events, captions, keyboard controls and cleanup. WebKit automation alone does not establish Safari-device compatibility.

## Result report

For each pass or defect provide candidate version/archive hash, installation method, framework/version, browser/version, OS/device, scenario, expected/actual behavior and console/error-event output. Include the smallest relevant cue and host handler for action problems. Redact private audio URLs and user data.

## Acceptance and release

Phase 10 is complete only when the owner has supplied the missing integration results, reported library defects are resolved and retested, and the release checklist is satisfied. The current handoff does not assert React compatibility or authorize publication. Continue from this record when results arrive.


## Owner-reported native dialog issue

The owner authorized extending native modal support after reporting that the player/highlighter appeared below dialogs. Implemented and internally verified; see [Native dialog support assessment](DIALOG_SUPPORT.md) for capabilities, checks and remaining consumer/browser acceptance. Use the refreshed JS and CSS together when retesting.
