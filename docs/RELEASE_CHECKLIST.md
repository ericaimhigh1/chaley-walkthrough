# Release readiness

Candidate: 0.1.0-rc.1. Local checks recorded 2026-11-26. Status: unpublished; external React assessment and release ownership details remain pending.

## Local checks

- [x] npm run typecheck
- [x] npm test
- [x] npm run test:package (Chrome)
- [x] npm run test:package with CHALEY_BROWSER=edge
- [x] Record archive filename, checksum sidecar, date and browser versions in Phase 9.
- [x] Confirm generated archive includes usage, all phase reports, CSS, declarations and MIT license, and excludes caches/source tests/secrets.

Results are recorded in [Phase 9](phases/PHASE_9.md); this checklist is reusable for each candidate.

## Integration and browser gates

- [x] Owner reports separate vanilla project works (2026-11-26; browser/version and detailed test matrix not supplied).
- [ ] Owner executes separate React test pass, including StrictMode, pointer handlers and unmount cleanup.
- [ ] Verify four or more targets against real narration, not just the generated test tone.
- [ ] Record actual Firefox, Safari, Edge and representative mobile-web results; do not treat an emulated viewport as a mobile-browser pass.
- [ ] Execute configured GitHub CI after the repository exists. Local tests are not a remote CI pass.
- [ ] Resolve reported defects and retest the same candidate in both consumer projects.

See [Phase 10](phases/PHASE_10.md) for the ordered owner checklist and report format.

## Owner release actions

1. Select the GitHub owner/repository and verify availability in that namespace. No repository destination was supplied.
2. Recheck npm package-name availability immediately before publishing; registry availability is not ownership or a reservation.
3. Add the real repository, homepage, bugs URL and maintainer details to package.json. Review the MIT copyright attribution.
4. Approve final version and release notes, then rebuild and verify the exact archive to publish.
5. Publish only after explicit owner authorization. No publication, repository creation or external app modification is part of this handoff.
6. Verify installation from the registry and direct browser distribution; tag the release and retain test evidence.
