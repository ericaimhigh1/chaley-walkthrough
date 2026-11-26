const mediaEvents = [
  "loadedmetadata",
  "durationchange",
  "timeupdate",
  "playing",
  "pause",
  "waiting",
  "stalled",
  "seeking",
  "seeked",
  "ended",
  "error",
] as const;

export type AudioEvent = (typeof mediaEvents)[number];

/** Owns one detached media element. No browser access until construction. */
export class AudioController {
  private readonly element: HTMLAudioElement;
  private pendingTime: number | null = null;
  private readonly listeners: Array<readonly [string, EventListener]> = [];

  constructor(
    document: Document,
    source: string,
    onEvent: (event: AudioEvent) => void,
  ) {
    this.element = document.createElement("audio");
    this.element.preload = "metadata";
    for (const name of mediaEvents) {
      const listener = () => onEvent(name);
      this.element.addEventListener(name, listener);
      this.listeners.push([name, listener]);
    }
    this.element.src = source;
  }

  get duration(): number | null {
    const duration = this.element.duration;
    return Number.isFinite(duration) && duration >= 0 ? duration : null;
  }
  get currentTime(): number {
    return this.pendingTime ?? Math.max(0, this.element.currentTime || 0);
  }
  get paused(): boolean {
    return this.element.paused;
  }
  get ended(): boolean {
    return this.element.ended;
  }
  get error(): MediaError | null {
    return this.element.error;
  }
  play(): Promise<void> {
    return this.element.play();
  }
  pause(): void {
    this.element.pause();
  }

  seek(time: number): number {
    const clamped =
      this.duration === null ? time : Math.min(time, this.duration);
    if (this.element.readyState === 0) this.pendingTime = clamped;
    else {
      this.element.currentTime = clamped;
      this.pendingTime = null;
    }
    return clamped;
  }

  flushSeek(): void {
    if (this.pendingTime !== null && this.element.readyState > 0)
      this.seek(this.pendingTime);
  }

  destroy(): void {
    for (const [name, listener] of this.listeners)
      this.element.removeEventListener(name, listener);
    this.listeners.length = 0;
    this.element.pause();
    this.element.removeAttribute("src");
    this.element.load();
    this.pendingTime = null;
  }
}
