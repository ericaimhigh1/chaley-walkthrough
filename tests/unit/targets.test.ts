import { describe, expect, it, vi } from 'vitest';
import { resolveTarget } from '../../src/dom/TargetResolver';

function fixture(overrides: Record<string, unknown> = {}, visibility = 'visible') {
  const element = {
    isConnected: true,
    getBoundingClientRect: () => ({ left: 12, top: 24, width: 80, height: 30 }),
    getClientRects: () => [{}],
    ...overrides,
  };
  const lookup = vi.fn(() => element);
  const document = { getElementById: lookup, defaultView: { getComputedStyle: () => ({ visibility }) } } as unknown as Document;
  return { element, document, lookup };
}

describe('runtime target resolution', () => {
  it('uses literal ID lookup, including selector punctuation', () => {
    const { document, lookup, element } = fixture();
    const result = resolveTarget(document, '#123:a.b');
    expect(lookup).toHaveBeenCalledWith('123:a.b');
    expect(result).toEqual({ element, rect: { left: 12, top: 24, width: 80, height: 30 } });
  });
  it('resolves again instead of caching a detached or replaced element', () => {
    const { document, lookup } = fixture();
    const replacement = fixture().element;
    resolveTarget(document, '#target'); lookup.mockReturnValue(replacement);
    expect(resolveTarget(document, '#target')).toHaveProperty('element', replacement);
    expect(lookup).toHaveBeenCalledTimes(2);
  });
  it('reports missing IDs', () => {
    const document = { getElementById: () => null } as unknown as Document;
    expect(resolveTarget(document, '#missing')).toHaveProperty('code', 'TARGET_NOT_FOUND');
  });
  it('rejects detached elements', () => {
    expect(resolveTarget(fixture({ isConnected: false }).document, '#target')).toHaveProperty('code', 'TARGET_NOT_FOUND');
  });
  it.each(['hidden', 'collapse'])('rejects visibility %s', visibility => {
    expect(resolveTarget(fixture({}, visibility).document, '#target')).toHaveProperty('code', 'TARGET_NOT_RENDERABLE');
  });
  it.each([
    { getClientRects: () => [] },
    { getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 30 }) },
    { getBoundingClientRect: () => ({ left: 0, top: 0, width: 30, height: 0 }) },
    { getBoundingClientRect: () => ({ left: Infinity, top: 0, width: 30, height: 30 }) },
  ])('rejects absent, zero-sized or invalid geometry', overrides => {
    expect(resolveTarget(fixture(overrides).document, '#target')).toHaveProperty('code', 'TARGET_NOT_RENDERABLE');
  });
});
