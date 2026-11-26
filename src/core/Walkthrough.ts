import type { NormalizedWalkthroughConfig, WalkthroughConfig } from './types';
import { validateConfig } from './validation';

/** Phase 1 configuration scaffold. Playback and lifecycle methods arrive in later phases. */
export class Walkthrough {
  private readonly config: NormalizedWalkthroughConfig;

  constructor(config: WalkthroughConfig) {
    if (typeof document === 'undefined') throw new Error('Instantiate Walkthrough only in a browser. Module imports are SSR-safe.');
    this.config = validateConfig(config);
  }
}
