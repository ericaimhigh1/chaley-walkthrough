/** Shared visual host; no DOM access until a visible renderer acquires it. */
const hosts = new WeakMap<Document, LayerHost>();

export function mountLayer(document: Document, root: HTMLElement): void {
  let host = hosts.get(document);
  if (!host) {
    host = new LayerHost(document);
    hosts.set(document, host);
  }
  host.add(root);
}

export function unmountLayer(document: Document, root: HTMLElement | null): void {
  if (root) hosts.get(document)?.remove(root);
}

class LayerHost {
  private readonly roots = new Set<HTMLElement>();
  private readonly observer: MutationObserver;
  private container: HTMLDivElement | null = null;
  private modals: HTMLDialogElement[] = [];

  constructor(private readonly document: Document) {
    this.observer = new document.defaultView!.MutationObserver(records => {
      // Attribute records preserve opening order even for sibling dialogs.
      for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof this.document.defaultView!.HTMLDialogElement) {
          const dialog = record.target;
          this.modals = this.modals.filter(item => item !== dialog);
          if (dialog.matches(':modal')) this.modals.push(dialog);
        }
      }
      this.sync();
    });
  }

  add(root: HTMLElement): void {
    if (!this.roots.size) {
      this.observer.observe(this.document.documentElement, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['open'],
      });
      this.document.addEventListener('focusin', this.sync);
    }
    this.roots.add(root);
    this.sync();
  }

  private readonly sync = (): void => {
    const open = Array.from(this.document.querySelectorAll<HTMLDialogElement>('dialog:modal'));
    this.modals = this.modals.filter(dialog => open.includes(dialog));
    for (const dialog of open) if (!this.modals.includes(dialog)) this.modals.push(dialog);
    // Focus identifies the active modal when attaching to already-open dialogs.
    const focused = this.document.activeElement?.closest<HTMLDialogElement>('dialog:modal');
    if (focused && this.modals.includes(focused)) {
      this.modals = this.modals.filter(dialog => dialog !== focused);
      this.modals.push(focused);
    }
    const active = this.document.activeElement;
    const ownedFocus = active instanceof this.document.defaultView!.HTMLElement &&
      [...this.roots].some(root => root.contains(active));
    const modal = this.modals.at(-1);
    let parent: HTMLElement = this.document.body;
    if (!parent) return;
    if (modal) {
      if (!this.container) {
        this.container = this.document.createElement('div');
        this.container.className = 'chaley-walkthrough-layer-host';
        // A manual popover escapes dialog clipping/transforms without adding a modal.
        if (typeof this.container.showPopover === 'function') this.container.popover = 'manual';
      }
      if (this.container.parentElement !== modal) modal.append(this.container);
      parent = this.container;
    }
    for (const root of this.roots) if (root.parentElement !== parent) parent.append(root);
    if (modal && this.container?.popover && !this.container.matches(':popover-open')) {
      this.container.showPopover();
    }
    if (!modal) {
      this.container?.remove();
      this.container = null;
    }
    if (ownedFocus && this.document.activeElement !== active) active.focus({ preventScroll: true });
  };

  remove(root: HTMLElement): void {
    this.roots.delete(root);
    // Keep reusable hidden nodes in the body, outside a dialog that may be removed.
    if (root.parentElement !== this.document.body) this.document.body?.append(root);
    if (!this.roots.size) {
      this.observer.disconnect();
      this.document.removeEventListener('focusin', this.sync);
      this.container?.remove();
      this.container = null;
      this.modals = [];
      hosts.delete(this.document);
    }
  }
}
