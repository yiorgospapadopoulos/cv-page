import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/styles/tokens.css', 'utf8');

function token(name: string): string {
  const match = new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css);
  if (match === null) throw new Error(`Missing token ${name}`);
  return match[1]!;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

describe('footer pill colours', () => {
  it.each(['--link-linkedin', '--link-github', '--link-email'])(
    'gives white text at least 4.5:1 on %s',
    (name) => {
      expect(contrast('#ffffff', token(name))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('computes known contrast ratios', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
});
