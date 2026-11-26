export type IdReference = `#${string}`;
export type Effect = 'ripple' | 'spotlight' | 'none';
export type Transition = 'move' | 'instant';
export type WalkthroughStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error' | 'destroyed';

export type CueAction =
  | { readonly type: 'click' }
  | { readonly type: 'longpress'; readonly holdDuration: number };

export interface CueOptions {
  readonly scroll?: boolean;
  readonly effect?: Effect;
  readonly transition?: Transition;
  readonly transitionDuration?: number;
}

export interface TimelineCue extends CueOptions {
  readonly time: number;
  readonly target: IdReference | null;
  readonly caption?: string;
  readonly action?: CueAction;
}

export interface WalkthroughTheme {
  readonly overlayOpacity?: number;
  readonly highlightColor?: string;
  readonly padding?: number;
  readonly borderRadius?: number;
}

export interface WalkthroughConfig {
  readonly audio: string;
  readonly timeline: readonly TimelineCue[];
  readonly trigger?: IdReference;
  readonly allowActions?: boolean;
  readonly theme?: WalkthroughTheme;
  readonly defaults?: CueOptions;
}

export interface NormalizedWalkthroughConfig {
  readonly audio: string;
  readonly timeline: readonly TimelineCue[];
  readonly trigger?: IdReference;
  readonly allowActions: boolean;
  readonly theme: Readonly<Required<WalkthroughTheme>>;
  readonly defaults: Readonly<Required<CueOptions>>;
}

export interface WalkthroughState {
  readonly status: WalkthroughStatus;
  readonly currentTime: number;
  /** null until a finite media duration is known. */
  readonly duration: number | null;
  readonly activeCue: TimelineCue | null;
}
