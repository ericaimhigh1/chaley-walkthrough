import { mountLayer, unmountLayer } from "./LayerHost";
import { resolveTarget } from "./TargetResolver";
import type { TargetProblem } from "./TargetResolver";
import type {
  Effect,
  IdReference,
  NormalizedWalkthroughConfig,
  Transition,
} from "../core/types";

export interface HighlightOptions {
  readonly effect: Effect;
  readonly transition: Transition;
  readonly transitionDuration: number;
  readonly animate: boolean;
  readonly paused: boolean;
}

type Geometry = {
  left: string;
  top: string;
  width: string;
  height: string;
  borderRadius: string;
};

/** Persistent decoration with one coalesced tracking frame and cancellable movement. */
export class HighlightRenderer {
  private root: HTMLDivElement | null = null;
  private highlight: HTMLDivElement | null = null;
  private active: {
    reference: IdReference;
    theme: NormalizedWalkthroughConfig["theme"];
    options: HighlightOptions;
  } | null = null;
  private target: HTMLElement | null = null;
  private geometry: Geometry | null = null;
  private movement: Animation | null = null;
  private observer: ResizeObserver | null = null;
  private motionQuery: MediaQueryList | null = null;
  private frame: number | null = null;
  private generation = 0;
  private tracking = false;

  constructor(
    private readonly document: Document,
    private readonly onIssue: (issue: TargetProblem) => void = () => { },
  ) { }

  show(
    reference: IdReference,
    theme: NormalizedWalkthroughConfig["theme"],
    options: HighlightOptions,
  ): TargetProblem | null {
    this.active = { reference, theme, options };
    this.startTracking();
    const issue = this.refresh(options.animate, !options.animate);
    this.schedule();
    return issue;
  }

  get settled(): boolean {
    return (
      !!this.root?.isConnected &&
      !this.root.hidden &&
      (!this.movement || this.movement.playState === "finished")
    );
  }

  private refresh(animate = false, snap = false): TargetProblem | null {
    if (!this.active) return null;
    const { reference, theme, options } = this.active;
    const result = resolveTarget(this.document, reference);
    if ("code" in result) {
      this.observe(null);
      this.hide();
      return result;
    }
    if (!this.document.body) {
      this.hide();
      return {
        code: "RENDER_UNAVAILABLE",
        message: "The document body is not available for the highlight.",
      };
    }
    const replaced = this.target !== null && this.target !== result.element;
    this.observe(result.element);
    if (!this.root) {
      this.root = this.document.createElement("div");
      this.root.className = "chaley-walkthrough-root";
      this.root.setAttribute("aria-hidden", "true");
      this.root.hidden = true;
      this.highlight = this.document.createElement("div");
      this.highlight.className = "chaley-walkthrough-highlight";
      this.root.append(this.highlight);
    }
    const visible = this.root.isConnected && !this.root.hidden;
    let from: Geometry | null = null;
    if (
      animate &&
      visible &&
      !options.paused &&
      !this.motionQuery?.matches &&
      !this.document.hidden &&
      options.transition === "move" &&
      options.transitionDuration > 0
    ) {
      const style = this.document.defaultView!.getComputedStyle(
        this.highlight!,
      );
      from = {
        left: style.left,
        top: style.top,
        width: style.width,
        height: style.height,
        borderRadius: style.borderRadius,
      };
    }
    mountLayer(this.document, this.root);
    this.setProperty(
      "--chaley-walkthrough-overlay-opacity",
      String(theme.overlayOpacity),
    );
    this.setProperty(
      "--chaley-walkthrough-highlight-color",
      theme.highlightColor,
    );
    this.setProperty(
      "--chaley-walkthrough-border-radius",
      `${theme.borderRadius}px`,
    );
    if (this.root.dataset.effect !== options.effect)
      this.root.dataset.effect = options.effect;
    const paused = String(options.paused || this.document.hidden);
    if (this.root.dataset.paused !== paused) this.root.dataset.paused = paused;
    const { rect } = result;

    const next: Geometry = {
      left: `${rect.left - theme.padding}px`,
      top: `${rect.top - theme.padding}px`,
      width: `${rect.width + 2 * theme.padding}px`,
      height: `${rect.height + 2 * theme.padding}px`,
      borderRadius: `${theme.borderRadius}px`,
    };

    const changed =
      !this.geometry ||
      (Object.keys(next) as Array<keyof Geometry>).some(
        (key) => next[key] !== this.geometry![key],
      );

    if (changed || snap || replaced || !visible) {
      this.cancelMovement();
      Object.assign(this.highlight!.style, next);
      this.geometry = next;

      // Tracking changes snap to the current box rather than restarting a transition every frame.
      if (from && changed) {
        this.movement = this.highlight!.animate([from, next], {
          duration: options.transitionDuration,
          easing: "ease-in-out",
        });
      }
    }

    this.root.hidden = false;
    return null;
  }

  private setProperty(name: string, value: string): void {
    if (this.root!.style.getPropertyValue(name) !== value)
      this.root!.style.setProperty(name, value);
  }

  private observe(target: HTMLElement | null): void {
    if (target === this.target) return;
    this.observer?.disconnect();
    this.target = target;
    if (target) this.observer?.observe(target);
  }

  private startTracking(): void {
    if (this.tracking) return;
    this.tracking = true;
    const view = this.document.defaultView!;
    this.motionQuery = view.matchMedia("(prefers-reduced-motion: reduce)");
    this.motionQuery.addEventListener("change", this.handleMotion);
    this.observer = new view.ResizeObserver(this.schedule);
    this.document.addEventListener("scroll", this.schedule, true);
    view.addEventListener("resize", this.schedule);
    this.document.addEventListener("visibilitychange", this.handleVisibility);
  }

  private readonly schedule = (): void => {
    if (!this.active || this.frame !== null || this.document.hidden) return;
    const generation = this.generation;
    this.frame = this.document.defaultView!.requestAnimationFrame(() => {
      if (generation !== this.generation || !this.active) return;
      this.frame = null;
      const issue = this.refresh();
      if (issue) this.onIssue(issue);
      // Also catches transforms, sibling layout shifts and replacements without resize events.
      this.schedule();
    });
  };

  private readonly handleMotion = (): void => {
    if (!this.active) return;
    const issue = this.refresh(false, true);
    if (issue) this.onIssue(issue);
  };

  private readonly handleVisibility = (): void => {
    this.cancelFrame();
    this.handleMotion();
    this.schedule();
  };

  private cancelMovement(): void {
    this.movement?.cancel();
    this.movement = null;
  }

  private cancelFrame(): void {
    this.generation++;
    if (this.frame !== null)
      this.document.defaultView!.cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private hide(): void {
    this.cancelMovement();
    this.geometry = null;
    if (this.root) this.root.hidden = true;
    unmountLayer(this.document, this.root);
  }

  clear(): void {
    this.active = null;
    this.cancelFrame();
    this.hide();
    this.observer?.disconnect();
    this.observer = null;
    this.target = null;
    if (this.tracking) {
      this.motionQuery?.removeEventListener("change", this.handleMotion);
      this.document.removeEventListener("scroll", this.schedule, true);
      this.document.defaultView!.removeEventListener("resize", this.schedule);
      this.document.removeEventListener(
        "visibilitychange",
        this.handleVisibility,
      );
    }
    this.motionQuery = null;
    this.tracking = false;
  }

  destroy(): void {
    this.clear();
    this.root?.remove();
    this.root = null;
    this.highlight = null;
  }
}
