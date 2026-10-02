import { describe, expect, it } from 'vitest';
import { strapLabel } from './strap';

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
