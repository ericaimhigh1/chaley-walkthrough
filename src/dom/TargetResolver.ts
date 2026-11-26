import type { IdReference } from '../core/types';

export interface TargetProblem {
  readonly code: 'TARGET_NOT_FOUND' | 'TARGET_NOT_RENDERABLE' | 'RENDER_UNAVAILABLE';
  readonly message: string;
}

export type ResolvedTarget = { readonly element: HTMLElement; readonly rect: DOMRect } | TargetProblem;

/** Resolve literal HTML IDs at use time, without CSS selector parsing or cached elements. */
export function resolveTarget(document: Document, reference: IdReference): ResolvedTarget {
  const element = document.getElementById(reference.slice(1));
  if (!element || !element.isConnected) {
    return { code: 'TARGET_NOT_FOUND', message: `Target ${reference} was not found in the document.` };
  }
  const rect = element.getBoundingClientRect();
  const style = document.defaultView!.getComputedStyle(element);
  if (!element.getClientRects().length || rect.width <= 0 || rect.height <= 0 ||
      ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) ||
      style.visibility === 'hidden' || style.visibility === 'collapse') {
    return { code: 'TARGET_NOT_RENDERABLE', message: `Target ${reference} has no visible layout box.` };
  }
  return { element, rect };
}
