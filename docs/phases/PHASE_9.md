# Phase 9 assessment: package, documentation and automated checks

Candidate: 0.1.0-rc.1 (unpublished). Scope: Phase 9 of PROJECT_SPEC.md.

## Delivered capabilities

- Complete usage guidance for archive installation, npm linking, ESM/IIFE/CSS, configuration, actions, lifecycle, player, audio authoring and troubleshooting.
- Package verification script builds and packs the library, checks an archive allowlist, extracts inside the repository's ignored .package-check directory, verifies SSR ESM and IIFE exports, compiles a minimal public-type fixture, and runs all browser fixtures against that extracted distribution.
- Browser selection supports installed Chrome/Edge and Playwright Chromium/Firefox/WebKit. Default local browser stays Chrome.
- GitHub CI definition installs dependencies/browser engines and runs typecheck, units and packaged browser checks. It retains reports; it does not publish.
- CONTRIBUTING.md, CHANGELOG.md, bug/feature issue templates and a release checklist.
- Phase 10 handoff, with owner-reported vanilla success and separate React testing still pending.

No runtime dependency, external application, hosted service or new product feature was added. Existing runtime behavior is unchanged in this phase. The recent malformed-action error improvement is included in the candidate.

## Assessment commands

Run npm run typecheck, npm test, then npm run test:package. For Edge in PowerShell, set $env:CHALEY_BROWSER='edge' before running test:package and remove the variable afterward. Review the printed archive verification and browser summary. The browser fixtures load JavaScript and CSS from the unpacked archive, not the working dist directory.

Expected failures: missing required archive file, unexpected package content, incorrect export/global, broken declarations, missing browser binary, or failed browser assertion. These fail the command; unsupported CHALEY_BROWSER values fail configuration. The script retains its extracted fixture for inspection. It is a library test artifact, not a consumer app.

## Executed results

Executed on 2026-11-26, Windows, Node 26.5.0:

| Check | Result |
| --- | --- |
| TypeScript typecheck | Passed |
| Unit tests | 123 passed across seven files |
| Archive allowlist, ESM/SSR import, IIFE global and strict public declarations | Passed |
| Packaged Chrome 158.0.8127.37 | 58 browser tests passed |
| Packaged Edge 158.0.4370.33 | 58 browser tests passed |
| Local documentation links | No missing file targets |
| GitHub CI | Defined, not executed remotely |
| Firefox / WebKit / Safari / real mobile | Not executed in this phase |

The initial verification script needed two TypeScript 7 invocation fixes (compiler path and isolated config handling). Both were corrected before the successful archive/type/browser runs. No runtime behavior was changed.

Final artifact: chaley-walkthrough-0.1.0-rc.1.tgz. After recording these results, the archive was refreshed with documentation-only changes; runtime distribution files are the tested build. Its final SHA-256 is supplied in the adjacent chaley-walkthrough-0.1.0-rc.1.tgz.sha256 file, outside the archive to avoid a self-referential checksum.

A read-only npm registry lookup for chaley-walkthrough returned E404 on 2026-11-26: no public package entry was returned. This is not a reservation or a guarantee that registration will be allowed. Recheck at publication. GitHub availability remains pending a chosen owner/repository namespace; no destination was supplied.

## Limits and next step

CI is configured but has not run on GitHub. Firefox/WebKit support in configuration is not a browser pass. Safari, real mobile devices, screen-reader combinations and separate React integration require owner assessment. npm linking instructions are supplied; this task does not mutate global npm links or external projects. Proceed with [Phase 10](PHASE_10.md), then the [release checklist](../RELEASE_CHECKLIST.md).
