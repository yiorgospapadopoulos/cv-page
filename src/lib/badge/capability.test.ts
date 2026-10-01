import { describe, expect, it, vi } from 'vitest';
import { shouldRender3D, supportsWebGL } from './capability';

function fakeDocument(contexts: Record<string, unknown>) {
  const getContext = vi.fn((kind: string) => contexts[kind] ?? null);
  return {
    doc: { createElement: () => ({ getContext }) },
    getContext,
  };
}

describe('supportsWebGL', () => {
  it('is true when a webgl2 context is available', () => {
    const { doc, getContext } = fakeDocument({ webgl2: {} });
    expect(supportsWebGL(doc)).toBe(true);
    expect(getContext).toHaveBeenCalledWith('webgl2');
  });

  it('falls back to webgl', () => {
    const { doc } = fakeDocument({ webgl: {} });
    expect(supportsWebGL(doc)).toBe(true);
  });

  it('is false when no context is returned', () => {
    const { doc } = fakeDocument({});
    expect(supportsWebGL(doc)).toBe(false);
  });

  it('is false when creating a context throws', () => {
    const doc = {
      createElement: () => ({
        getContext: () => {
          throw new Error('blocked');
        },
      }),
    };
    expect(supportsWebGL(doc)).toBe(false);
  });
});

describe('shouldRender3D', () => {
  it('renders only with webgl and without reduced motion', () => {
    expect(shouldRender3D({ webgl: true, reducedMotion: false })).toBe(true);
    expect(shouldRender3D({ webgl: true, reducedMotion: true })).toBe(false);
    expect(shouldRender3D({ webgl: false, reducedMotion: false })).toBe(false);
    expect(shouldRender3D({ webgl: false, reducedMotion: true })).toBe(false);
  });
});
