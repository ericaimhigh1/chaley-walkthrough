vi.mock('../../src/ui/Player', () => ({ Player: class { render() {} destroy() {} } }));
vi.mock('../../src/dom/ScrollController', () => ({ ScrollController: class { start() { return false; } cancel() {} } }));
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Walkthrough } from '../../src/core/Walkthrough';

// Keep audio-clock tests independent of layout; real rendering is covered in browser tests.
vi.mock('../../src/dom/HighlightRenderer', () => ({
  HighlightRenderer: class { show() { return null; } clear() {} destroy() {} },
}));

class TrackedTarget extends EventTarget {
  count = 0;
  override addEventListener(...args: Parameters<EventTarget['addEventListener']>) { super.addEventListener(...args); this.count++; }
  override removeEventListener(...args: Parameters<EventTarget['removeEventListener']>) { super.removeEventListener(...args); this.count--; }
  fire(type: string) { this.dispatchEvent(new Event(type)); }
}

class FakeAudio extends TrackedTarget {
  src = '';
  preload = '';
  duration = NaN;
  readyState = 0;
  paused = true;
  ended = false;
  error: { message: string } | null = null;
  position = 0;
  seekError = false;
  get currentTime() { return this.position; }
  set currentTime(value: number) { if (this.seekError) throw new Error('seek failed'); this.position = value; }
  resolvePlay!: () => void;
  rejectPlay!: (error: unknown) => void;
  play = vi.fn(() => {
    this.paused = false;
    return new Promise<void>((resolve, reject) => { this.resolvePlay = resolve; this.rejectPlay = reject; });
  });
  pause = vi.fn(() => { this.paused = true; });
  load = vi.fn();
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
  metadata(duration = 20) { this.duration = duration; this.readyState = 1; this.fire('loadedmetadata'); }
}

let doc: TrackedTarget & { hidden: boolean; defaultView: object; createElement: ReturnType<typeof vi.fn> };
let frames: Map<number, FrameRequestCallback>;
let media: FakeAudio[];
let instances: Walkthrough[];
const config = { audio: '/tour.mp3', timeline: [
  { time: 0, target: '#one' as const }, { time: 2.5, target: '#two' as const },
  { time: 5, target: null }, { time: 8, target: '#four' as const },
] };
function tour() { const instance = new Walkthrough(config); instances.push(instance); return instance; }
function frame() { const batch = [...frames.values()]; frames.clear(); batch.forEach(callback => callback(0)); }
async function play(instance: Walkthrough) {
  const promise = instance.start();
  const audio = media.at(-1)!;
  audio.metadata();
  audio.fire('playing');
  audio.resolvePlay();
  await promise;
  return audio;
}

beforeEach(() => {
  frames = new Map(); media = []; instances = [];
  let id = 0;
  doc = Object.assign(new TrackedTarget(), {
    hidden: false,
    defaultView: {
      requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; },
      cancelAnimationFrame: (handle: number) => { frames.delete(handle); },
    },
    createElement: vi.fn(() => { const audio = new FakeAudio(); media.push(audio); return audio; }),
  });
  vi.stubGlobal('document', doc);
});
afterEach(() => { instances.forEach(instance => instance.destroy()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('audio playback lifecycle', () => {
  it('constructs idle without media and returns frozen snapshots', () => {
    const instance = tour();
    expect(media).toHaveLength(0);
    expect(instance.state).toEqual({ status: 'idle', currentTime: 0, duration: null, activeCue: null });
    expect(Object.isFrozen(instance.state)).toBe(true);
  });
  it('shares pending starts, calls play immediately, and does not restart playing audio', async () => {
    const instance = tour();
    const first = instance.start();
    expect(instance.start()).toBe(first);
    expect(media[0]!.play).toHaveBeenCalledTimes(1);
    expect(instance.state.status).toBe('loading');
    media[0]!.metadata(); media[0]!.resolvePlay(); await first;
    media[0]!.currentTime = 3; frame();
    await instance.start();
    expect(instance.state.currentTime).toBe(3);
    expect(media[0]!.play).toHaveBeenCalledTimes(1);
  });
  it('reads the audio clock, changes cues only at boundaries and skips missed cues', async () => {
    const instance = tour(); const cues = vi.fn(); instance.on('cuechange', cues);
    const audio = await play(instance); cues.mockClear();
    audio.currentTime = 2; frame(); audio.currentTime = 2.4; frame();
    expect(cues).not.toHaveBeenCalled();
    audio.currentTime = 2.5; frame();
    expect(instance.state.activeCue?.target).toBe('#two');
    audio.currentTime = 9; frame();
    expect(cues).toHaveBeenCalledTimes(2);
    expect(instance.state.activeCue?.target).toBe('#four');
  });
  it('pauses at the media position, freezes time, and resumes via start', async () => {
    const instance = tour(); const audio = await play(instance);
    audio.currentTime = 3; instance.pause();
    expect(instance.state.status).toBe('paused'); expect(instance.state.currentTime).toBe(3);
    expect(frames.size).toBe(0);
    audio.currentTime = 4; audio.fire('timeupdate'); frame();
    expect(instance.state.currentTime).toBe(3);
    const resumed = instance.start(); audio.resolvePlay(); await resumed;
    expect(audio.currentTime).toBe(3); expect(instance.state.status).toBe('playing');
  });
  it('resume is a no-op outside paused state', async () => {
    const instance = tour(); await instance.resume(); expect(media).toHaveLength(0);
    const audio = await play(instance); await instance.resume(); expect(audio.play).toHaveBeenCalledTimes(1);
  });
  it('seeks immediately while paused and clamps to known duration', async () => {
    const instance = tour(); const audio = await play(instance); instance.pause();
    const cues = vi.fn(); instance.on('cuechange', cues);
    instance.seek(8); expect(instance.state.activeCue?.target).toBe('#four');
    expect(audio.currentTime).toBe(8); expect(instance.state.status).toBe('paused');
    expect(cues.mock.calls[0]![0].reason).toBe('seek');
    instance.seek(100); expect(instance.state.currentTime).toBe(20);
    instance.seek(0); expect(instance.state.activeCue?.target).toBe('#one');
  });
  it('queues a pre-metadata seek and reconciles it when duration is known', async () => {
    const instance = tour(); const pending = instance.start(); const audio = media[0]!;
    instance.seek(50); expect(instance.state.currentTime).toBe(50);
    audio.metadata(10); expect(audio.currentTime).toBe(10); expect(instance.state.currentTime).toBe(10);
    audio.resolvePlay(); await pending;
  });
  it.each([-1, NaN, Infinity])('rejects invalid seek %s', time => {
    expect(() => tour().seek(time)).toThrow(RangeError);
  });
  it('start from idle resets an earlier seek to zero', async () => {
    const instance = tour(); instance.seek(8); const audio = await play(instance);
    expect(audio.currentTime).toBe(0); expect(instance.state.currentTime).toBe(0);
  });
  it('stop clears the cue, resets time, releases media and permits another start', async () => {
    const instance = tour(); const audio = await play(instance); instance.seek(8); instance.stop();
    expect(instance.state).toMatchObject({ status: 'idle', currentTime: 0, activeCue: null });
    expect(audio.paused).toBe(true); expect(audio.src).toBe(''); expect(audio.count).toBe(0);
    expect(doc.count).toBe(0); expect(frames.size).toBe(0);
    const next = await play(instance); expect(next).not.toBe(audio);
  });
  it('restart resets a paused run', async () => {
    const instance = tour(); await play(instance); instance.seek(8); instance.pause();
    const pending = instance.restart(); const audio = media.at(-1)!; audio.metadata(); audio.resolvePlay(); await pending;
    expect(instance.state.currentTime).toBe(0); expect(instance.state.status).toBe('playing');
  });
  it('completion emits once, clears the cue, and permits replay', async () => {
    const instance = tour(); const complete = vi.fn(); instance.on('complete', complete);
    const audio = await play(instance); audio.currentTime = 20; audio.ended = true; audio.paused = true;
    audio.fire('pause'); audio.fire('ended'); audio.fire('ended');
    expect(instance.state).toMatchObject({ status: 'ended', currentTime: 20, activeCue: null });
    expect(complete).toHaveBeenCalledTimes(1); expect(frames.size).toBe(0);
    await play(instance); expect(instance.state.currentTime).toBe(0);
  });
  it.each(['stop', 'pause', 'destroy'] as const)('cancels pending playback on %s and ignores stale resolution', async method => {
    const instance = tour(); const pending = instance.start(); const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const audio = media[0]!; instance[method](); await rejection;
    const state = instance.state; audio.resolvePlay(); audio.fire('playing'); await Promise.resolve();
    expect(instance.state).toBe(state); expect(audio.src).toBe(''); expect(audio.count).toBe(0);
  });
  it('late rejection cannot break a newer playback request', async () => {
    const instance = tour(); const old = instance.start(); const cancelled = expect(old).rejects.toMatchObject({ name: 'AbortError' });
    const oldAudio = media[0]!; instance.stop(); await cancelled;
    await play(instance); oldAudio.rejectPlay(new Error('old failure')); await Promise.resolve();
    expect(instance.state.status).toBe('playing');
  });
  it('pause while loading retains the requested position for resume on a fresh element', async () => {
    const instance = tour(); const old = instance.start(); const cancelled = expect(old).rejects.toMatchObject({ name: 'AbortError' });
    instance.seek(6); instance.pause(); await cancelled;
    const resumed = instance.resume(); const audio = media.at(-1)!; audio.metadata(); audio.resolvePlay(); await resumed;
    expect(audio.currentTime).toBe(6); expect(media).toHaveLength(2);
  });
  it('handles rejected play promises and allows retry', async () => {
    const instance = tour(); const errors = vi.fn(); instance.on('error', errors);
    const pending = instance.start(); const cause = new DOMException('gesture required', 'NotAllowedError');
    media[0]!.rejectPlay(cause); await expect(pending).rejects.toBe(cause);
    expect(instance.state.status).toBe('error'); expect(errors.mock.calls[0]![0].code).toBe('PLAYBACK_REJECTED');
    await play(instance); expect(instance.state.status).toBe('playing');
  });
  it('handles media failure during loading and ignores its later play rejection', async () => {
    const instance = tour(); const errors = vi.fn(); instance.on('error', errors);
    const pending = instance.start(); const audio = media[0]!; audio.error = { message: 'decode failed' };
    const rejected = expect(pending).rejects.toEqual(audio.error); audio.fire('error'); await rejected;
    audio.rejectPlay(new Error('aborted')); await Promise.resolve();
    expect(errors).toHaveBeenCalledTimes(1); expect(instance.state.status).toBe('error');
  });
  it('reports a seek failure without changing the previous snapshot', async () => {
    const instance = tour(); const audio = await play(instance); const errors = vi.fn(); instance.on('error', errors);
    const state = instance.state; audio.seekError = true;
    expect(() => instance.seek(3)).toThrow('seek failed'); expect(instance.state).toBe(state);
    expect(errors.mock.calls[0]![0]).toMatchObject({ code: 'SEEK_FAILED', recoverable: true });
  });
  it('warns once per cue beyond finite duration without interrupting playback', async () => {
    const instance = tour(); const errors = vi.fn(); instance.on('error', errors);
    const pending = instance.start(); const audio = media[0]!;
    audio.metadata(Infinity); expect(instance.state.duration).toBeNull(); expect(errors).not.toHaveBeenCalled();
    audio.metadata(5); audio.fire('durationchange'); audio.resolvePlay(); await pending;
    expect(errors).toHaveBeenCalledTimes(1); expect(errors.mock.calls[0]![0]).toMatchObject({ code: 'CUE_BEYOND_DURATION', recoverable: true });
    expect(instance.state.status).toBe('playing');
  });
  it('handles waiting and playing recovery without emitting missed cues', async () => {
    const instance = tour(); const audio = await play(instance); const cues = vi.fn(); instance.on('cuechange', cues);
    audio.fire('waiting'); expect(instance.state.status).toBe('loading'); expect(frames.size).toBe(0);
    audio.currentTime = 9; audio.fire('playing');
    expect(instance.state.status).toBe('playing'); expect(cues).toHaveBeenCalledTimes(1);
    expect(cues.mock.calls[0]![0].reason).toBe('recovery'); expect(instance.state.activeCue?.target).toBe('#four');
    audio.fire('stalled'); expect(instance.state.status).toBe('playing');
  });
  it('recovers after a hidden tab and cancels stale animation frames', async () => {
    const instance = tour(); const audio = await play(instance); const stale = [...frames.values()][0]!;
    doc.hidden = true; doc.fire('visibilitychange'); expect(frames.size).toBe(0);
    audio.currentTime = 9; doc.hidden = false; doc.fire('visibilitychange');
    expect(instance.state.activeCue?.target).toBe('#four'); expect(frames.size).toBe(1);
    instance.stop(); const stopped = instance.state; stale(0); expect(instance.state).toBe(stopped); expect(frames.size).toBe(0);
  });
  it('does not overwrite buffering when the original play promise resolves late', async () => {
    const instance = tour(); const pending = instance.start(); const audio = media[0]!;
    audio.metadata(); audio.fire('playing'); audio.fire('waiting'); audio.resolvePlay(); await pending;
    expect(instance.state.status).toBe('loading'); expect(frames.size).toBe(0);
    audio.fire('playing'); expect(instance.state.status).toBe('playing'); expect(frames.size).toBe(1);
  });
  it('supports an empty timeline without cues', async () => {
    const instance = new Walkthrough({ audio: '/tour.mp3', timeline: [] }); instances.push(instance);
    const cues = vi.fn(); instance.on('cuechange', cues); const audio = await play(instance);
    audio.currentTime = 7; frame(); expect(instance.state.currentTime).toBe(7); expect(cues).not.toHaveBeenCalled();
  });
  it('fails predictably if the deferred metadata seek throws', async () => {
    const instance = tour(); const pending = instance.start(); const rejected = expect(pending).rejects.toThrow('seek failed');
    const errors = vi.fn(); instance.on('error', errors);
    instance.seek(5); const audio = media[0]!; audio.seekError = true; audio.metadata(); await rejected;
    expect(instance.state.status).toBe('error'); expect(errors.mock.calls[0]![0].code).toBe('SEEK_FAILED');
  });
  it('responds to native pause and seeking events', async () => {
    const instance = tour(); const audio = await play(instance); audio.currentTime = 8;
    audio.fire('seeking'); expect(instance.state.activeCue?.target).toBe('#four');
    audio.paused = true; audio.fire('pause'); expect(instance.state.status).toBe('paused');
  });
  it('is terminal and idempotent after destruction', async () => {
    const instance = tour(); const audio = await play(instance); instance.destroy(); instance.destroy();
    expect(instance.state.status).toBe('destroyed'); expect(audio.count).toBe(0); expect(doc.count).toBe(0);
    await expect(instance.start()).rejects.toThrow('destroyed'); await expect(instance.resume()).rejects.toThrow('destroyed');
    await expect(instance.restart()).rejects.toThrow('destroyed');
    for (const method of [() => instance.pause(), () => instance.seek(0), () => instance.stop(), () => instance.on('complete', () => {})]) expect(method).toThrow('destroyed');
  });
  it('supports unsubscribe, frozen cue payloads and isolated listener exceptions', async () => {
    const instance = tour(); const removed = vi.fn(); const off = instance.on('statechange', removed); off(); off();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    instance.on('statechange', () => { throw new Error('consumer bug'); });
    const cues = vi.fn(); instance.on('cuechange', cues); await play(instance);
    expect(removed).not.toHaveBeenCalled(); expect(Object.isFrozen(cues.mock.calls[0]![0])).toBe(true);
    expect(instance.state.status).toBe('playing');
  });
  it('allows a loading subscriber to destroy before play is called', async () => {
    const instance = tour(); instance.on('statechange', state => { if (state.status === 'loading') instance.destroy(); });
    await expect(instance.start()).rejects.toMatchObject({ name: 'AbortError' });
    expect(media[0]!.play).not.toHaveBeenCalled(); expect(instance.state.status).toBe('destroyed');
  });
  it('suppresses stale cue events when a subscriber stops on a clock update', async () => {
    const instance = tour(); const audio = await play(instance); const cues = vi.fn(); instance.on('cuechange', cues);
    instance.on('statechange', state => { if (state.currentTime === 3) instance.stop(); });
    audio.currentTime = 3; frame(); expect(instance.state.status).toBe('idle');
    expect(cues.mock.calls.every(([event]) => event.cue === null)).toBe(true); expect(frames.size).toBe(0);
  });
  it('does not leak media listeners or frames over repeated lifecycles', async () => {
    for (let i = 0; i < 10; i++) { const instance = tour(); await play(instance); instance.destroy(); }
    expect(media.every(audio => audio.count === 0 && audio.src === '' && audio.paused)).toBe(true);
    expect(doc.count).toBe(0); expect(frames.size).toBe(0);
  });
});

it('switching instances aborts pending play and ignores its late resolution', async () => {
  const first = tour(), second = tour();
  const pending = first.start();
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  const oldAudio = media[0]!;
  await play(second); await rejected;
  oldAudio.resolvePlay(); await Promise.resolve();
  expect(first.state.status).toBe('idle'); expect(second.state.status).toBe('playing');
  expect(oldAudio.paused).toBe(true); expect(oldAudio.count).toBe(0);
  first.destroy(); expect(second.state.status).toBe('playing');
});
it('switching stops paused sessions and a reentrant start supersedes the outer request', async () => {
  const first = tour(), second = tour(), third = tour();
  await play(first); first.pause();
  let thirdPlay: Promise<void> | undefined;
  first.on('statechange', state => { if (state.status === 'idle') thirdPlay = third.start(); });
  await expect(second.start()).rejects.toMatchObject({ name: 'AbortError' });
  media.at(-1)!.resolvePlay(); await thirdPlay;
  expect(first.state.status).toBe('idle'); expect(second.state.status).toBe('idle'); expect(third.state.status).toBe('playing');
});
