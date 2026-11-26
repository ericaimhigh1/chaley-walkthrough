import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
/** Package checks point every browser fixture at the extracted npm artifact. */
export function packageAsset(filename: string): Buffer {
  return readFileSync(resolve(process.env.CHALEY_DIST_DIR ?? 'dist', filename));
}
