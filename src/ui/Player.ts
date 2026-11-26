import { mountLayer, unmountLayer } from "../dom/LayerHost";
import type {
  NormalizedWalkthroughConfig,
  WalkthroughState,
} from "../core/types";

interface Controls {
  start(): Promise<void>;
  pause(): void;
  resume(): Promise<void>;
  restart(): Promise<void>;
  stop(): void;
  seek(time: number): void;
}
export function formatTime(time: number): string {
  const seconds = Math.max(0, Math.floor(time));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Native keyboard-operable controls. No focus trap or automatic focus movement. */
export class Player {
  private root: HTMLElement | null = null;
  private play!: HTMLButtonElement;
  private captions!: HTMLButtonElement;
  private progress!: HTMLInputElement;
  private time!: HTMLElement;
  private caption!: HTMLElement;
  private status!: HTMLElement;
  private snapshot: WalkthroughState | null = null;
  private showCaptions: boolean;
  private listening = false;
  constructor(
    private readonly document: Document,
    private readonly config: NormalizedWalkthroughConfig,
    private readonly controls: Controls,
  ) {
    this.showCaptions = config.player.captions;
  }
  private button(
    label: string,
    action: () => void | Promise<void>,
  ): HTMLButtonElement {
    const button = this.document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.onclick = () => {
      try {
        void Promise.resolve(action()).catch(() => { });
      } catch {
        /* Controller errors are exposed through its error event. */
      }
    };
    return button;
  }

  private create(): void {
    this.root = this.document.createElement("section");
    this.root.className = "chaley-walkthrough-player";
    this.root.setAttribute("aria-label", "Walkthrough player");
    this.root.style.setProperty(
      "--chaley-walkthrough-player-accent-default",
      this.config.theme.highlightColor,
    );
    this.status = this.document.createElement("span");
    this.status.className = "chaley-walkthrough-player-status";
    this.status.setAttribute("role", "status");
    this.time = this.document.createElement("span");
    this.time.setAttribute("aria-live", "off");
    const heading = this.document.createElement("div");
    heading.className = "chaley-walkthrough-player-row";
    heading.append(this.status, this.time);
    this.progress = this.document.createElement("input");
    this.progress.type = "range";
    this.progress.min = "0";
    this.progress.step = "0.1";
    this.progress.setAttribute("aria-label", "Walkthrough progress");
    this.progress.oninput = () => {
      try {
        this.controls.seek(Number(this.progress.value));
      } catch {
        /* SEEK_FAILED is reported by the controller. */
      }
    };
    this.play = this.button("Pause", () => {
      if (
        this.snapshot?.status === "playing" ||
        this.snapshot?.status === "loading"
      )
        this.controls.pause();
      else if (this.snapshot?.status === "paused")
        return this.controls.resume();
      else return this.controls.start();
    });
    this.captions = this.button("Captions", () => {
      this.showCaptions = !this.showCaptions;
      if (this.snapshot) this.render(this.snapshot);
    });
    const controls = this.document.createElement("div");
    controls.className = "chaley-walkthrough-player-controls";
    controls.append(
      this.play,
      this.button("Replay", () => this.controls.restart()),
      this.captions,
      this.button("Stop", () => this.controls.stop()),
    );
    this.caption = this.document.createElement("p");
    this.caption.className = "chaley-walkthrough-player-caption";
    this.caption.setAttribute("aria-live", "polite");
    this.caption.setAttribute("aria-atomic", "true");
    this.root.append(heading, this.progress, controls, this.caption);

  }
  render(state: WalkthroughState): void {
    this.snapshot = state;
    if (state.status === "destroyed") {
      this.destroy();
      return;
    }
    if (state.status === "idle") {
      if (this.root) this.root.hidden = true;
      this.unlisten();
      return;
    }
    if (!this.document.body) return;
    if (!this.root) this.create();
    mountLayer(this.document, this.root!);
    this.root!.hidden = false;

    if (!this.listening) {
      this.document.addEventListener("keydown", this.keydown);
      this.listening = true;
    }

    const label =
      state.status === "playing" || state.status === "loading"
        ? "Pause"
        : state.status === "paused"
          ? "Resume"
          : state.status === "ended"
            ? "Play again"
            : "Retry";

    this.play.textContent = label;

    const status = {
      loading: "Loading",
      playing: "Playing",
      paused: "Paused",
      ended: "Complete",
      error: "Playback failed",
    }[state.status];

    if (this.status.textContent !== status) this.status.textContent = status;

    this.time.textContent = `${formatTime(state.currentTime)} / ${state.duration === null ? "--:--" : formatTime(state.duration)}`;
    this.progress.disabled = state.duration === null || state.duration <= 0;
    this.progress.max = String(state.duration ?? 0);
    this.progress.value = String(state.currentTime);
    this.progress.setAttribute(
      "aria-valuetext",
      `${formatTime(state.currentTime)} of ${state.duration === null ? "unknown duration" : formatTime(state.duration)}`,
    );
    this.captions.hidden = !this.config.timeline.some((cue) => !!cue.caption);
    this.captions.setAttribute("aria-pressed", String(this.showCaptions));
    const caption = this.showCaptions ? (state.activeCue?.caption ?? "") : "";
    if (this.caption.textContent !== caption)
      this.caption.textContent = caption;
    this.caption.hidden = !caption;
    this.place(state);
  }

  private place(state: WalkthroughState): void {
    const preferred = this.config.player.position;
    this.root!.dataset.position = preferred;
    const target = state.activeCue?.target
      ? this.document.getElementById(state.activeCue.target.slice(1))
      : null;
    if (!target) return;
    const box = target.getBoundingClientRect();
    for (const position of [
      preferred,
      "top-right",
      "top-left",
      "bottom-left",
      "bottom-right",
    ]) {
      this.root!.dataset.position = position;
      const player = this.root!.getBoundingClientRect();
      if (
        player.right <= box.left ||
        player.left >= box.right ||
        player.bottom <= box.top ||
        player.top >= box.bottom
      )
        return;
    }
    this.root!.dataset.position = preferred;
  }

  private readonly keydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      this.controls.stop();
    }
  };

  private unlisten(): void {
    unmountLayer(this.document, this.root);
    if (this.listening)
      this.document.removeEventListener("keydown", this.keydown);
    this.listening = false;
  }

  destroy(): void {
    this.unlisten();
    this.root?.remove();
    this.root = null;
    this.snapshot = null;
  }
}
