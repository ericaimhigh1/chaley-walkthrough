import type { IdReference } from '../core/types';
import { resolveTarget } from './TargetResolver';

/** Full containment; oversized targets cannot be made fully visible and time out safely. */
export function isTargetVisible(element: HTMLElement): boolean {
  const doc = element.ownerDocument;
  const view = doc.defaultView!;
  if (!element.isConnected || !element.getClientRects().length) return false;
  const box = element.getBoundingClientRect();
  let left = 0, top = 0, right = doc.documentElement.clientWidth, bottom = doc.documentElement.clientHeight;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = view.getComputedStyle(node);
    if (style.visibility !== 'visible' || Number(style.opacity) === 0 || style.contentVisibility === 'hidden') return false;
    if (node === element) continue;
    const rect = node.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
      left = Math.max(left, rect.left + node.clientLeft);
      right = Math.min(right, rect.left + node.clientLeft + node.clientWidth);
    }
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
      top = Math.max(top, rect.top + node.clientTop);
      bottom = Math.min(bottom, rect.top + node.clientTop + node.clientHeight);
    }
  }
  return box.width > 0 && box.height > 0 && box.left >= left - 1 && box.right <= right + 1 && box.top >= top - 1 && box.bottom <= bottom + 1;
}

export class ScrollController {
  private cleanup: (() => void) | null = null;
  constructor(private readonly document: Document) {}

  /** Returns true only when asynchronous scrolling owns the completion callback. */
  start(reference: IdReference, done: (visible: boolean) => void): boolean {
    this.cancel();
    const result = resolveTarget(this.document, reference);
    if ('code' in result || isTargetVisible(result.element)) return false;
    const element = result.element;
    const view = this.document.defaultView!;
    const ancestors: HTMLElement[] = [];
    for (let node = element.parentElement; node; node = node.parentElement) ancestors.push(node);
    let frame: number | null = null;
    let timer: number | null = null;
    let stable = 0;
    let previous = '';
    const finish = (notify: boolean, visible = false) => {
      if (frame !== null) view.cancelAnimationFrame(frame);
      if (timer !== null) view.clearTimeout(timer);
      this.cleanup = null;
      // Native smooth scrolling has no AbortSignal. Freeze owned scroll chains in place.
      // A same-position instant scroll can be ignored before Chrome's first smooth frame.
      // Change a scrollable coordinate and restore it in this task to abort that queued frame.
      for (const node of ancestors) {
        if (node === this.document.scrollingElement || node === this.document.body) continue;
        const left = node.scrollLeft, top = node.scrollTop;
        if (node.scrollHeight > node.clientHeight) node.scrollTo({ left, top: top > 0 ? top - 1 : 1, behavior: 'instant' });
        else if (node.scrollWidth > node.clientWidth) node.scrollTo({ left: left > 0 ? left - 1 : 1, top, behavior: 'instant' });
        node.scrollTo({ left, top, behavior: 'instant' });
      }
      const left = view.scrollX, top = view.scrollY;
      if (this.document.documentElement.scrollHeight > view.innerHeight) view.scrollTo({ left, top: top > 0 ? top - 1 : 1, behavior: 'instant' });
      else if (this.document.documentElement.scrollWidth > view.innerWidth) view.scrollTo({ left: left > 0 ? left - 1 : 1, top, behavior: 'instant' });
      view.scrollTo({ left, top, behavior: 'instant' });
      if (notify) done(visible);
    };
    this.cleanup = () => finish(false);
    const tick = () => {
      if (this.document.getElementById(reference.slice(1)) !== element || !element.isConnected) { finish(true); return; }
      const rect = element.getBoundingClientRect();
      const position = `${rect.x}:${rect.y}`;
      stable = position === previous ? stable + 1 : 0;
      previous = position;
      if (stable >= 3 && isTargetVisible(element)) { finish(true, true); return; }
      frame = view.requestAnimationFrame(tick);
    };
    try {
      element.scrollIntoView({ behavior: view.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center', inline: 'nearest' });
      timer = view.setTimeout(() => finish(true, isTargetVisible(element)), 2000);
      frame = view.requestAnimationFrame(tick);
    } catch { finish(false); return false; }
    return true;
  }
  cancel(): void { this.cleanup?.(); }
}
