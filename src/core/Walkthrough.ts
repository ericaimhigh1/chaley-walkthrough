import { AudioController } from './AudioController';
import type { AudioEvent } from './AudioController';
import { findActiveCue } from './Timeline';
import type { CueChangeReason, NormalizedWalkthroughConfig, WalkthroughConfig, WalkthroughEventMap, WalkthroughIssue, WalkthroughState } from './types';
import { validateConfig } from './validation';
import { HighlightRenderer } from '../dom/HighlightRenderer';

interface PendingPlay {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
}

export class Walkthrough {
  private readonly config: NormalizedWalkthroughConfig;
  private readonly document: Document;
  private audio: AudioController | null = null;
  private snapshot: WalkthroughState = Object.freeze({ status: 'idle', currentTime: 0, duration: null, activeCue: null });
  private readonly listeners = new Map<keyof WalkthroughEventMap, Set<(value: never) => void>>();
  private pending: PendingPlay | null = null;
  private wantsPlayback = false;
  private buffering = false;
  private frame: number | null = null;
  private generation = 0;
  private readonly warnedCues = new Set<number>();
  private watchingVisibility = false;
  private readonly renderer: HighlightRenderer;
  private readonly warnedTargets = new Set<string>();

  constructor(config: WalkthroughConfig) {
    if (typeof document === 'undefined') throw new Error('Instantiate Walkthrough only in a browser. Module imports are SSR-safe.');
    this.config = validateConfig(config);
    this.document = document;
    this.renderer = new HighlightRenderer(document);
  }

  get state(): WalkthroughState { return this.snapshot; }

  /** Subscribe to future changes. Read state directly for the initial snapshot. */
  on<K extends keyof WalkthroughEventMap>(event: K, listener: (value: WalkthroughEventMap[K]) => void): () => void {
    this.assertAlive();
    if (!['statechange', 'cuechange', 'complete', 'error'].includes(event)) throw new TypeError('Unknown walkthrough event');
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, set = new Set());
    const callback = listener as (value: never) => void;
    set.add(callback);
    return () => { set.delete(callback); };
  }

  start(): Promise<void> {
    if (this.state.status === 'destroyed') return Promise.reject(new Error('Walkthrough has been destroyed'));
    if (this.pending) return this.pending.promise;
    if (this.wantsPlayback) return Promise.resolve();
    return this.begin(this.state.status === 'paused');
  }
  resume(): Promise<void> {
    if (this.state.status === 'destroyed') return Promise.reject(new Error('Walkthrough has been destroyed'));
    if (this.pending) return this.pending.promise;
    if (this.state.status !== 'paused') return Promise.resolve();
    return this.begin(true);
  }
  restart(): Promise<void> {
    if (this.state.status === 'destroyed') return Promise.reject(new Error('Walkthrough has been destroyed'));
    this.reset('idle', 'stop');
    return this.start();
  }
  pause(): void {
    this.assertAlive();
    if (!this.wantsPlayback) return;
    const time = this.audio?.currentTime ?? this.state.currentTime;
    this.wantsPlayback = false;
    this.cancelFrame();
    if (this.pending) {
      this.cancelPlay();
      // Never reuse a media element with an unresolved play promise.
      this.releaseAudio();
    } else this.audio?.pause();
    this.update({ status: 'paused', currentTime: time, activeCue: findActiveCue(this.config.timeline, time) }, 'playback');
  }
  seek(time: number): void {
    this.assertAlive();
    if (!Number.isFinite(time) || time < 0) throw new RangeError('time must be finite and non-negative');
    let position = this.state.duration === null ? time : Math.min(time, this.state.duration);
    try { position = this.audio?.seek(position) ?? position; }
    catch (cause) {
      this.emit('error', Object.freeze({ code: 'SEEK_FAILED', message: 'The media could not seek to this position.', recoverable: true, cause }));
      throw cause;
    }
    this.cancelFrame();
    this.update({ currentTime: position, activeCue: findActiveCue(this.config.timeline, position) }, 'seek', true);
    this.scheduleFrame();
  }
  stop(): void { this.assertAlive(); this.reset('idle', 'stop'); }
  destroy(): void {
    if (this.state.status === 'destroyed') return;
    this.reset('destroyed', 'destroy');
    this.listeners.clear();
  }

  private begin(resuming: boolean): Promise<void> {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    const pending: PendingPlay = { promise, resolve, reject };
    this.pending = pending;
    this.wantsPlayback = true;
    this.buffering = false;
    const time = resuming ? this.state.currentTime : 0;
    try {
      if (!this.audio) {
        const audio = new AudioController(this.document, this.config.audio, event => {
          if (this.audio === audio) this.handleMedia(event);
        });
        this.audio = audio;
      }
      const audio = this.audio;
      audio.seek(time);
      if (!this.watchingVisibility) {
        this.document.addEventListener('visibilitychange', this.handleVisibility);
        this.watchingVisibility = true;
      }
      this.update({ status: 'loading', currentTime: time, activeCue: findActiveCue(this.config.timeline, time) }, resuming ? 'resume' : 'start', true);
      if (this.pending !== pending) return promise;
      // Preserve user activation: do not await metadata before calling play.
      audio.play().then(() => {
        if (this.pending !== pending || this.audio !== audio) return;
        this.pending = null;
        if (!audio.ended) {
          if (audio.paused) this.wantsPlayback = false;
          this.update({ status: audio.paused ? 'paused' : this.buffering ? 'loading' : 'playing' }, resuming ? 'resume' : 'start');
          this.scheduleFrame();
        }
        resolve();
      }, cause => {
        if (this.pending !== pending || this.audio !== audio) return;
        this.fail('PLAYBACK_REJECTED', 'Audio playback was rejected. Start or resume from a user gesture.', cause);
      });
    } catch (cause) {
      if (this.pending === pending) this.fail('PLAYBACK_REJECTED', 'Audio playback could not start.', cause);
    }
    return promise;
  }

  private handleMedia(event: AudioEvent): void {
    const audio = this.audio;
    if (!audio) return;
    if (event === 'error') {
      this.fail('MEDIA_ERROR', audio.error?.message || 'The audio could not be loaded or decoded.', audio.error);
      return;
    }
    if (event === 'loadedmetadata' || event === 'durationchange') {
      try { audio.flushSeek(); }
      catch (cause) { this.fail('SEEK_FAILED', 'The initial media seek failed.', cause); return; }
      this.reconcile('seek');
      const duration = audio.duration;
      if (duration !== null) {
        for (const [index, cue] of this.config.timeline.entries()) {
          if (this.audio !== audio) return;
          if (cue.time > duration && !this.warnedCues.has(index)) {
            this.warnedCues.add(index);
            this.emit('error', Object.freeze({ code: 'CUE_BEYOND_DURATION', message: `Cue at ${cue.time}s exceeds audio duration ${duration}s.`, recoverable: true, cue }));
          }
        }
      }
      return;
    }
    if (event === 'ended' && audio.ended && this.wantsPlayback) {
      const time = audio.currentTime;
      const duration = audio.duration;
      this.wantsPlayback = false;
      this.cancelFrame();
      const pending = this.pending;
      this.pending = null;
      pending?.resolve();
      this.releaseAudio();
      this.update({ status: 'ended', currentTime: time, duration, activeCue: null }, 'ended');
      if (this.state.status === 'ended') this.emit('complete', this.state);
      return;
    }
    if (event === 'pause' && audio.paused && !audio.ended && this.wantsPlayback) {
      this.pause();
      return;
    }
    if ((event === 'waiting' || event === 'stalled') && this.wantsPlayback) {
      // stalled alone does not imply that buffered playback stopped.
      if (event === 'waiting') {
        this.buffering = true;
        this.cancelFrame();
        this.update({ status: 'loading' }, 'recovery');
      }
      this.reconcile('recovery');
      return;
    }
    if (event === 'playing' && this.wantsPlayback && !audio.paused) {
      this.buffering = false;
      this.update({ status: 'playing' }, 'recovery');
      this.reconcile('recovery');
      this.scheduleFrame();
      return;
    }
    if (event === 'seeking' || event === 'seeked') this.reconcile('seek');
    else if (event === 'timeupdate' && this.wantsPlayback) this.reconcile(this.document.hidden ? 'recovery' : 'playback');
  }
  private reconcile(reason: CueChangeReason): void {
    const audio = this.audio;
    if (!audio) return;
    const time = audio.currentTime;
    this.update({ currentTime: time, duration: audio.duration, activeCue: findActiveCue(this.config.timeline, time) }, reason);
  }
  private readonly handleVisibility = (): void => {
    this.cancelFrame();
    if (this.wantsPlayback) this.reconcile('recovery');
    this.scheduleFrame();
  };
  private scheduleFrame(): void {
    if (this.frame !== null || !this.wantsPlayback || this.state.status !== 'playing' || this.document.hidden) return;
    const generation = this.generation;
    this.frame = this.document.defaultView!.requestAnimationFrame(() => {
      if (generation !== this.generation) return;
      this.frame = null;
      this.reconcile('playback');
      this.scheduleFrame();
    });
  }
  private cancelFrame(): void {
    this.generation++;
    if (this.frame !== null) this.document.defaultView!.cancelAnimationFrame(this.frame);
    this.frame = null;
  }
  private cancelPlay(): void {
    const pending = this.pending;
    this.pending = null;
    pending?.reject(new DOMException('Playback request was cancelled.', 'AbortError'));
  }
  private releaseAudio(): void {
    const audio = this.audio;
    this.audio = null;
    audio?.destroy();
    if (this.watchingVisibility) this.document.removeEventListener('visibilitychange', this.handleVisibility);
    this.watchingVisibility = false;
  }
  private reset(status: 'idle' | 'destroyed', reason: CueChangeReason): void {
    this.wantsPlayback = false;
    this.cancelFrame();
    this.cancelPlay();
    this.releaseAudio();
    this.update({ status, currentTime: 0, activeCue: null }, reason);
  }
  private fail(code: WalkthroughIssue['code'], message: string, cause: unknown): void {
    const pending = this.pending;
    this.pending = null;
    this.wantsPlayback = false;
    this.cancelFrame();
    this.releaseAudio();
    pending?.reject(cause ?? new Error(message));
    this.update({ status: 'error', activeCue: null }, 'error');
    if (this.state.status === 'error') this.emit('error', Object.freeze({ code, message, recoverable: false, cause }));
  }
  private renderVisuals(): void {
    const { status, activeCue } = this.state;
    if (status === 'destroyed') { this.renderer.destroy(); return; }
    if (!['loading', 'playing', 'paused'].includes(status) || !activeCue?.target ||
        (activeCue.effect ?? this.config.defaults.effect) === 'none') {
      this.renderer.clear();
      return;
    }
    const issue = this.renderer.show(activeCue.target, this.config.theme);
    if (issue) {
      const key = `${issue.code}:${activeCue.target}`;
      if (!this.warnedTargets.has(key)) {
        this.warnedTargets.add(key);
        this.emit('error', Object.freeze({ ...issue, recoverable: true, cue: activeCue }));
      }
    }
  }

  private update(patch: Partial<WalkthroughState>, reason: CueChangeReason, refreshVisual = false): void {
    const previous = this.snapshot;
    const next = Object.freeze({ ...previous, ...patch });
    if (Object.keys(next).every(key => next[key as keyof WalkthroughState] === previous[key as keyof WalkthroughState])) {
      if (refreshVisual) this.renderVisuals();
      return;
    }
    this.snapshot = next;
    if (refreshVisual || previous.activeCue !== next.activeCue || previous.status !== next.status) this.renderVisuals();
    if (this.snapshot !== next) return;
    this.emit('statechange', next);
    if (this.snapshot !== next) return;
    if (previous.activeCue !== next.activeCue) {
      this.emit('cuechange', Object.freeze({ cue: next.activeCue, previousCue: previous.activeCue, reason, state: next }));
    }
  }
  private emit<K extends keyof WalkthroughEventMap>(event: K, value: WalkthroughEventMap[K]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      if (event === 'statechange' && value !== this.snapshot) break;
      if (event === 'cuechange' && (value as WalkthroughEventMap['cuechange']).state !== this.snapshot) break;
      if (!this.listeners.get(event)?.has(listener)) continue;
      try { listener(value as never); }
      catch (error) { console.error('Chaley Walkthrough subscriber failed:', error); }
    }
  }
  private assertAlive(): void {
    if (this.state.status === 'destroyed') throw new Error('Walkthrough has been destroyed');
  }
}
