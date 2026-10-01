import { describe, expect, it } from 'vitest';
import { strapLabel, strapRepeat } from './strap';

describe('strapLabel', () => {
  it('repeats the text with a separator after every copy', () => {
    expect(strapLabel('site.dev', 2)).toBe('site.dev  ·  site.dev  ·  ');
  });

  it('defaults to a single copy', () => {
    expect(strapLabel('site.dev')).toBe('site.dev  ·  ');
  });

  it('accepts a custom separator', () => {
    expect(strapLabel('a', 3, ' / ')).toBe('a / a / a / ');
  });

  it('rejects fewer than one copy', () => {
    expect(() => strapLabel('a', 0)).toThrow(RangeError);
  });
});

describe('strapRepeat', () => {
  it('is the band length in tiles', () => {
    expect(strapRepeat(300, 100)).toBe(3);
    expect(strapRepeat(250, 100)).toBe(2.5);
  });

  it('shows part of a tile on short bands so the text keeps its size', () => {
    expect(strapRepeat(20, 100)).toBe(0.2);
  });

  it('rejects a non-positive tile length', () => {
    expect(() => strapRepeat(100, 0)).toThrow(RangeError);
  });
});
