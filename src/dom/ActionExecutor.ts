import type { CueAction, IdReference } from "../core/types";
import { resolveTarget } from "./TargetResolver";
import { isTargetVisible } from "./ScrollController";

/** One cancellable action attempt. Timeline timing remains owned by the audio clock. */
export class ActionExecutor {
  private cleanup: (() => void) | null = null;
  constructor(private readonly document: Document) { }

  run(
    reference: IdReference,
    action: CueAction,
    ready: () => boolean,
    wait: number,
    issue: (message: string) => void,
  ): void {
    this.cancel();
    const view = this.document.defaultView!;

    let frame: number | null = null;
    let timer: number | null = null;
    let target: HTMLElement | null = null;
    let pressed = false;
    let active = true;

    const pointer = (type: string) => {
      const rect = target!.getBoundingClientRect();
      target!.dispatchEvent(
        new view.PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
          button: 0,
          buttons: type === "pointerdown" ? 1 : 0,
          clientX: rect.x + rect.width / 2,
          clientY: rect.y + rect.height / 2,
        }),
      );
    };

    const finish = (cancel: boolean) => {
      if (!active) return;
      active = false;
      if (frame !== null) view.cancelAnimationFrame(frame);
      if (timer !== null) view.clearTimeout(timer);
      this.cleanup = null;
      if (pressed) {
        pressed = false;
        pointer(cancel ? "pointercancel" : "pointerup");
      }
    };

    this.cleanup = () => finish(true);

    const valid = () =>
      target !== null &&
      this.document.getElementById(reference.slice(1)) === target &&
      !this.document.hidden &&
      isTargetVisible(target);

    const tick = () => {
      frame = null;

      if (pressed) {
        if (!valid()) {
          finish(true);
          return;
        }
      } else {
        const result = resolveTarget(this.document, reference);
        if ("code" in result) {
          finish(true);
          issue(result.message);
          return;
        }

        target = result.element;
        if (valid() && ready()) {
          if (timer !== null) view.clearTimeout(timer);
          if (action.type === "click") {
            finish(false);
            target.click();
            return;
          }

          pressed = true;
          timer = view.setTimeout(() => finish(!valid()), action.holdDuration);
          pointer("pointerdown");
          // A synchronous host handler can stop or destroy the walkthrough.
          if (!active) return;
        }
      }
      frame = view.requestAnimationFrame(tick);
    };

    timer = view.setTimeout(() => {
      finish(true);
      issue("Action target did not become visible and ready in time.");
    }, wait);

    frame = view.requestAnimationFrame(tick);
  }

  cancel(): void {
    this.cleanup?.();
  }
}
