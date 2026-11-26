import type { IdReference, NormalizedWalkthroughConfig } from '../core/types';
import { resolveTarget } from './TargetResolver';
import type { TargetProblem } from './TargetResolver';

/** Static renderer. Geometry is sampled on activation/seek, not tracked between cues yet. */
export class HighlightRenderer {
  private root: HTMLDivElement | null = null;
  private highlight: HTMLDivElement | null = null;

  constructor(private readonly document: Document) {}

  show(reference: IdReference, theme: NormalizedWalkthroughConfig['theme']): TargetProblem | null {
    const result = resolveTarget(this.document, reference);
    if ('code' in result) { this.clear(); return result; }
    if (!this.document.body) {
      this.clear();
      return { code: 'RENDER_UNAVAILABLE', message: 'The document body is not available for the highlight.' };
    }
    if (!this.root) {
      this.root = this.document.createElement('div');
      this.root.className = 'chaley-walkthrough-root';
      this.root.setAttribute('aria-hidden', 'true');
      this.root.hidden = true;
      this.highlight = this.document.createElement('div');
      this.highlight.className = 'chaley-walkthrough-highlight';
      this.root.append(this.highlight);
    }
    // Reuse the same nodes across cue changes and stop/start cycles.
    if (!this.root.isConnected) this.document.body.append(this.root);
    this.root.style.setProperty('--chaley-walkthrough-overlay-opacity', String(theme.overlayOpacity));
    this.root.style.setProperty('--chaley-walkthrough-highlight-color', theme.highlightColor);
    this.root.style.setProperty('--chaley-walkthrough-border-radius', `${theme.borderRadius}px`);
    const { rect } = result;
    Object.assign(this.highlight!.style, {
      left: `${rect.left - theme.padding}px`,
      top: `${rect.top - theme.padding}px`,
      width: `${rect.width + 2 * theme.padding}px`,
      height: `${rect.height + 2 * theme.padding}px`,
    });
    this.root.hidden = false;
    return null;
  }

  clear(): void { if (this.root) this.root.hidden = true; }

  destroy(): void {
    this.root?.remove();
    this.root = null;
    this.highlight = null;
  }
}
