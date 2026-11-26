import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
const require = createRequire(import.meta.url);
const root = process.cwd();
mkdirSync(".package-check", { recursive: true });
const temporary = mkdtempSync(resolve(".package-check/run-"));
// npm supplies its own CLI path when launched through npm run; avoid shell quoting.
assert(process.env.npm_execpath, "Run with npm run test:package");
const output = execFileSync(
  process.execPath,
  [
    process.env.npm_execpath,
    "pack",
    "--ignore-scripts",
    "--json",
    "--cache",
    ".npm-cache",
  ],
  { encoding: "utf8" },
);
const [packed] = JSON.parse(output);
const files = packed.files.map((file) => file.path);
for (const required of [
  "dist/chaley-walkthrough.js",
  "dist/chaley-walkthrough.iife.js",
  "dist/style.css",
  "dist/index.d.ts",
  "LICENSE",
  "README.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "docs/USAGE.md",
  "docs/phases/PHASE_9.md",
  "docs/phases/PHASE_10.md",
])
  assert(files.includes(required), `Missing package file: ${required}`);
assert(
  files.every(
    (file) =>
      !file.includes("..") && !file.startsWith("/") && !file.includes("\\"),
  ),
  "Unsafe archive paths",
);
assert(
  files.every((file) =>
    /^(dist\/|docs\/|package.json$|README.md$|LICENSE$|CONTRIBUTING.md$|CHANGELOG.md$|PROJECT_SPEC.md$)/.test(
      file,
    ),
  ),
  "Unexpected source, test, cache or credential file in archive",
);
execFileSync("tar", ["-xzf", resolve(packed.filename), "-C", temporary], {
  stdio: "inherit",
});
const extracted = join(temporary, "package");
const manifest = JSON.parse(
  readFileSync(join(extracted, "package.json"), "utf8"),
);
assert.equal(
  Object.keys(manifest.dependencies ?? {}).length,
  0,
  "No runtime dependencies",
);
for (const path of [
  manifest.main,
  manifest.types,
  manifest.exports["./style.css"],
])
  assert(existsSync(join(extracted, path)));
const esm = await import(pathToFileURL(join(extracted, manifest.main)).href);
assert.deepEqual(Object.keys(esm), ["Walkthrough"]);
assert.throws(
  () => new esm.Walkthrough({ audio: "/test.wav", timeline: [] }),
  /only in a browser/,
);
const context = {};
runInNewContext(
  readFileSync(join(extracted, "dist/chaley-walkthrough.iife.js"), "utf8"),
  context,
);
assert.equal(typeof context.ChaleyWalkthrough.Walkthrough, "function");
// Minimal compile-only library fixture, not a consumer application.
const fixture = join(extracted, "type-smoke.ts");
writeFileSync(
  fixture,
  `import { Walkthrough, type WalkthroughConfig, type PlayerOptions } from 'chaley-walkthrough';
const player: PlayerOptions = { position: 'top-left', captions: true };
const config: WalkthroughConfig = { audio: '/tour.wav', player, timeline: [{ time: 0, target: '#menu', action: { type: 'click' } }] };
const tour = new Walkthrough(config);
tour.on('cuechange', event => { const time: number = event.state.currentTime; void time; });
void tour.start(); tour.pause(); void tour.resume(); tour.seek(2); void tour.restart(); tour.stop(); tour.destroy();
`,
);
const compiler = join(
  dirname(require.resolve("typescript/package.json")),
  "bin/tsc",
);
execFileSync(
  process.execPath,
  [
    compiler,
    "--ignoreConfig",
    "--noEmit",
    "--strict",
    "--target",
    "ES2022",
    "--module",
    "ESNext",
    "--moduleResolution",
    "Bundler",
    fixture,
  ],
  { stdio: "inherit" },
);
console.log(
  `Verified ${packed.filename}: archive allowlist, exports, SSR, IIFE and TypeScript declarations.`,
);
execFileSync(
  process.execPath,
  [require.resolve("@playwright/test/cli"), "test"],
  {
    stdio: "inherit",
    cwd: root,
    env: { ...process.env, CHALEY_DIST_DIR: join(extracted, "dist") },
  },
);
console.log(
  `Packaged browser suite passed (${process.env.CHALEY_BROWSER ?? "chrome"}). Fixture retained at ${temporary}.`,
);
