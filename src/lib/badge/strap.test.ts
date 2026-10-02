import { describe, expect, it } from 'vitest';
import { arcAt, labelPhase, strapLabel, visibleArc } from './strap';

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

describe('labelPhase', () => {
  it('centres one label copy on the visible strap', () => {
    const phase = labelPhase(240, 200, 230);
    const at = (fromClip: number) => phase - fromClip / 230;
    expect(at(20)).toBeCloseTo(200 / 230);
    expect(at(220)).toBeCloseTo(0);
    expect(at(120)).toBeCloseTo(100 / 230);
  });
});

describe('visibleArc', () => {
  const points: [number, number][] = [
    [0, -100],
    [0, -20],
    [30, 20],
    [30, 100],
  ];

  it('measures the strap from the clip up to the top edge', () => {
    expect(visibleArc(points, 0)).toBeCloseTo(80 + 25);
  });

  it('measures the whole strap when it starts below the edge', () => {
    expect(visibleArc(points, -200)).toBeCloseTo(80 + 50 + 80);
  });
});

describe('arcAt', () => {
  const points: [number, number][] = [
    [0, 0],
    [0, 100],
    [0, 300],
  ];
  const coordinates = [-1, -0.5, 0];

  it('finds how far along the strap from the clip a coordinate sits', () => {
    expect(arcAt(points, coordinates, 0)).toBeCloseTo(0);
    expect(arcAt(points, coordinates, -0.25)).toBeCloseTo(100);
    expect(arcAt(points, coordinates, -0.75)).toBeCloseTo(250);
  });

  it('reports a coordinate beyond the strap as infinitely far', () => {
    expect(arcAt(points, coordinates, -2)).toBe(Infinity);
    expect(arcAt(points, coordinates, 0.5)).toBe(Infinity);
  });
});
