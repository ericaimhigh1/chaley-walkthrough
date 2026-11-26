import { claimPlayback, releasePlayback, claimTrigger } from './PlaybackCoordinator';
import { Player } from '../ui/Player';
import { AudioController } from './AudioController';
import type { AudioEvent } from './AudioController';
import { findActiveCue } from './Timeline';
import type { CueChangeReason, NormalizedWalkthroughConfig, WalkthroughConfig, WalkthroughEventMap, WalkthroughIssue, WalkthroughState } from './types';
import { validateConfig } from './validation';
import { ActionExecutor } from '../dom/ActionExecutor';
import type { TimelineCue } from './types';
import { ScrollController } from '../dom/ScrollController';
import { HighlightRenderer } from '../dom/HighlightRenderer';
import type { TargetProblem } from '../dom/TargetResolver';

interface PendingPlay {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
}

export class Walkthrough {
  private unbindTrigger: (() => void) | null = null;
  private readonly player: Player;
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
  private readonly actions: ActionExecutor;
  private eligibleAction: TimelineCue | null = null;
  private readonly attemptedActions = new Set<TimelineCue>();
  private readonly scroller: ScrollController;
  private scrolling = false;
  private readonly renderer: HighlightRenderer;
  private readonly warnedTargets = new Set<string>();

  constructor(config: WalkthroughConfig) {
    if (typeof document === 'undefined') throw new Error('Instantiate Walkthrough only in a browser. Module imports are SSR-safe.');
    this.config = validateConfig(config);
    this.document = document;
    this.player = new Player(document, this.config, this);
    this.actions = new ActionExecutor(document);
    this.scroller = new ScrollController(document);
    this.renderer = new HighlightRenderer(document, issue => this.reportTargetIssue(issue));
    this.bindTrigger();
  }

  private bindTrigger(): void {
    const reference = this.config.trigger;
    if (!reference) return;
    const target = this.document.getElementById(reference.slice(1));
    const warn = (code: 'TRIGGER_NOT_FOUND' | 'TRIGGER_CONFLICT', message: string) => queueMicrotask(() => {
      if (this.state.status !== 'destroyed') this.emit('error', Object.freeze({ code, message, recoverable: true }));
    });
    if (!target) { warn('TRIGGER_NOT_FOUND', `Trigger ${reference} was not found. Initialise after mounting its element.`); return; }
    const release = claimTrigger(this.document, reference, this);
    if (!release) { warn('TRIGGER_CONFLICT', `Trigger ${reference} is already assigned to another walkthrough.`); return; }
    const click = (event: Event) => {
      event.preventDefault();
      void this.start().catch(() => {}); // Media failures are reported through the error event.
    };
    target.addEventListener('click', click);
    this.unbindTrigger = () => { target.removeEventListener('click', click); release(); };
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
    this.actions.cancel();
    this.eligibleAction = null;
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
    this.unbindTrigger?.(); this.unbindTrigger = null;
    this.reset('destroyed', 'destroy');
    this.listeners.clear();
  }

  private begin(resuming: boolean): Promise<void> {
    if (!resuming) this.attemptedActions.clear();
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    const pending: PendingPlay = { promise, resolve, reject };
    this.pending = pending;
    this.wantsPlayback = true;
    this.buffering = false;
    const time = resuming ? this.state.currentTime : 0;
    try {
      if (!claimPlayback(this.document, this) || this.pending !== pending) {
        if (this.pending === pending) { this.wantsPlayback = false; this.cancelPlay(); }
        return promise;
      }
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
    if (event === 'seeking' || event === 'seeked') {
      if (audio.currentTime !== this.state.currentTime) { this.actions.cancel(); this.eligibleAction = null; }
      this.reconcile('seek');
    }
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
    this.actions.cancel();
    this.eligibleAction = null;
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
    releasePlayback(this.document, this);
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
  private prepareVisuals(animate: boolean): void {
    this.scroller.cancel();
    this.scrolling = false;
    const cue = this.state.activeCue;
    if (cue?.target && ['loading', 'playing', 'paused'].includes(this.state.status) && (cue.scroll ?? this.config.defaults.scroll)) {
      this.scrolling = this.scroller.start(cue.target, visible => {
        this.scrolling = false;
        if (this.state.activeCue !== cue) return;
        if (visible) { this.renderVisuals(); this.queueAction(); }
        else this.emit('error', Object.freeze({ code: 'SCROLL_INCOMPLETE', message: 'Target did not become fully visible within the scroll wait.', recoverable: true, cue }));
      });
    }
    this.renderVisuals(animate);
  }

  private renderVisuals(animate = false): void {
    const { status, activeCue } = this.state;
    if (this.scrolling) { this.renderer.clear(); return; }
    if (status === 'destroyed') { this.renderer.destroy(); return; }
    if (!['loading', 'playing', 'paused'].includes(status) || !activeCue?.target ||
        (activeCue.effect ?? this.config.defaults.effect) === 'none') {
      this.renderer.clear();
      return;
    }
    const issue = this.renderer.show(activeCue.target, this.config.theme, {
      effect: activeCue.effect ?? this.config.defaults.effect,
      transition: activeCue.transition ?? this.config.defaults.transition,
      transitionDuration: activeCue.transitionDuration ?? this.config.defaults.transitionDuration,
      animate,
      paused: status !== 'playing',
    });
    if (issue) this.reportTargetIssue(issue);
  }

  private queueAction(): void {
    const cue = this.eligibleAction;
    if (!cue?.target || !cue.action || this.scrolling || this.state.status !== 'playing' || this.document.hidden || this.attemptedActions.has(cue)) return;
    this.eligibleAction = null;
    this.attemptedActions.add(cue);
    this.actions.run(cue.target, cue.action, () => (cue.effect ?? this.config.defaults.effect) === 'none' || this.renderer.settled,
      2000 + (cue.transitionDuration ?? this.config.defaults.transitionDuration), message => {
        if (this.state.activeCue === cue) this.emit('error', Object.freeze({ code: 'ACTION_SKIPPED', message, recoverable: true, cue }));
      });
  }

  private reportTargetIssue(issue: TargetProblem): void {
    const { activeCue, status } = this.state;
    if (activeCue?.target && ['loading', 'playing', 'paused'].includes(status)) {
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
      if (refreshVisual) this.prepareVisuals(false);
      return;
    }
    this.snapshot = next;
    if (previous.activeCue !== next.activeCue) {
      this.actions.cancel();
      if (this.snapshot !== next) return;
      this.eligibleAction = this.config.allowActions && (reason === 'start' || (reason === 'playback' && next.status === 'playing' && !this.document.hidden)) ? next.activeCue : null;
    }
    if (next.status !== 'playing') this.actions.cancel();
    if (this.snapshot !== next) return;
    if (next.status === 'loading' && reason === 'recovery' && !this.pending) this.eligibleAction = null;
    if (next.status === 'paused' || !['loading', 'playing'].includes(next.status)) this.eligibleAction = null;
    if (refreshVisual || previous.activeCue !== next.activeCue || previous.status !== next.status) {
      if (refreshVisual || previous.activeCue !== next.activeCue) this.prepareVisuals(previous.activeCue !== next.activeCue && reason === 'playback');
      else this.renderVisuals();
    }
    if (this.snapshot !== next) return;
    this.queueAction();
    this.player.render(next);
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
