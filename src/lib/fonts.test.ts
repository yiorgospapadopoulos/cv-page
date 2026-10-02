import { describe, expect, it } from 'vitest';
import { profile } from '../content/profile';
import { fontFaceCss, latinRanges, latinUnicodeRange, isLatin } from './fonts';
import { tryIt, welcomeLines, windowTitle } from './terminal';

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === 'object') {
    return Object.values(value).flatMap(strings);
  }
  return [];
}

describe('isLatin', () => {
  it('accepts basic latin, accented letters and common punctuation', () => {
    expect(isLatin('Yiorgos Papadopoulos · MSc, café – ok')).toBe(true);
  });

  it('rejects letters from other scripts', () => {
    expect(isLatin('Γιώργος')).toBe(false);
    expect(isLatin('Ж')).toBe(false);
  });

  it('accepts the empty string', () => {
    expect(isLatin('')).toBe(true);
  });
});

describe('latinUnicodeRange', () => {
  it('lists every range in css form', () => {
    expect(latinUnicodeRange).toContain('U+0000-00FF');
    expect(latinUnicodeRange).toContain('U+0131');
    expect(latinUnicodeRange.split(',')).toHaveLength(latinRanges.length);
  });
});

describe('fontFaceCss', () => {
  it('writes one swapping latin face per font', () => {
    const css = fontFaceCss([
      { family: 'Test Variable', url: '/a.woff2', weight: '100 900' },
      { family: 'Other Variable', url: '/b.woff2', weight: '100 800' },
    ]);
    expect(css.match(/@font-face/g)).toHaveLength(2);
    expect(css).toContain("font-family: 'Test Variable';");
    expect(css).toContain("src: url('/a.woff2') format('woff2');");
    expect(css).toContain('font-weight: 100 800;');
    expect(css).toContain('font-display: swap;');
    expect(css).toContain(`unicode-range: ${latinUnicodeRange};`);
  });
});

describe('site text and the shipped font subset', () => {
  it('only uses characters covered by the latin subset', () => {
    const text = [
      ...strings(profile),
      ...welcomeLines,
      tryIt.heading,
      tryIt.panelHeading,
      tryIt.placeholder,
      windowTitle,
    ];
    const outside = text.filter((value) => !isLatin(value));
    expect(outside).toEqual([]);
  });
});
