import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'ChaleyWalkthrough',
      formats: ['es', 'iife'],
      fileName: (format) => `chaley-walkthrough${format === 'iife' ? '.iife' : ''}.js`,
      cssFileName: 'style',
    },
  },
  plugins: [{
    name: 'emit-types-after-build',
    buildStart() {
      // Type-only imports are erased from the runtime graph; watch them explicitly.
      for (const file of readdirSync('src', { recursive: true })) {
        if (typeof file === 'string' && file.endsWith('.ts')) this.addWatchFile(resolve('src', file));
      }
    },
    // writeBundle runs for watch rebuilds; closeBundle runs only when the watcher closes.
    writeBundle() {
      const compiler = resolve(dirname(require.resolve('typescript/package.json')), 'bin/tsc');
      execFileSync(process.execPath, [compiler, '-p', 'tsconfig.build.json'], {
        stdio: 'inherit',
      });
      // CSS is a separate package export, not a dependency of the public type entry.
      const entry = 'dist/index.d.ts';
      writeFileSync(entry, readFileSync(entry, 'utf8').replace(/^import ['"]\.\/styles\/walkthrough\.css['"];\r?\n/m, ''));
    },
  }],
});
