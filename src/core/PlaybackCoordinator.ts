interface Session { stop(): void }
interface Scope { active: Session | null; generation: number; triggers: Map<string, Session> }
const documents = new WeakMap<Document, Scope>();

function scope(document: Document): Scope {
  let entry = documents.get(document);
  if (!entry) { entry = { active: null, generation: 0, triggers: new Map() }; documents.set(document, entry); }
  return entry;
}

/** Internal document ownership. Install ownership before stopping the old session:
 * subscriber callbacks may synchronously request another start. Latest request wins. */
export function claimPlayback(document: Document, session: Session): boolean {
  const entry = scope(document);
  if (entry.active === session) return true;
  const previous = entry.active;
  const generation = ++entry.generation;
  entry.active = session;
  previous?.stop();
  return entry.active === session && entry.generation === generation;
}

export function releasePlayback(document: Document, session: Session): void {
  const entry = scope(document);
  if (entry.active === session) { entry.active = null; entry.generation++; }
}
export function claimTrigger(document: Document, reference: string, session: Session): (() => void) | null {
  const entry = scope(document);
  if (entry.triggers.has(reference)) return null;
  entry.triggers.set(reference, session);
  return () => { if (entry.triggers.get(reference) === session) entry.triggers.delete(reference); };
}
