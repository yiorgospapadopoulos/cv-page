import { describe, expect, it } from 'vitest';
import { ribbon, ribbonIndices, strapCoordinates } from './rope';

describe('strapCoordinates', () => {
  it('fixes the label to the rope and ends at zero on the card', () => {
    const u = strapCoordinates(2, 4, 0.5, 2);
    expect(u).toHaveLength(9);
    expect(u[0]).toBeCloseTo(-0.5);
    expect(u[4]).toBeCloseTo(-0.25);
    expect(u[8]).toBe(0);
    for (let i = 1; i < u.length; i++) {
      expect(u[i]!).toBeGreaterThan(u[i - 1]!);
    }
  });

  it('shifts the label by the phase', () => {
    const u = strapCoordinates(2, 4, 0.5, 2, 0.3);
    expect(u[0]).toBeCloseTo(-0.2);
    expect(u[8]).toBeCloseTo(0.3);
  });

  it('rejects an empty tile', () => {
    expect(() => strapCoordinates(3, 4, 0.5, 0)).toThrow(RangeError);
  });
});

describe('ribbon', () => {
  it('offsets each point sideways by half the width', () => {
    const { positions, uvs } = ribbon(
      [
        [0, 0, 0],
        [0, -1, 0],
        [0, -2, 0.5],
      ],
      0.1,
      [-1, -0.5, 0],
    );
    const expected = [
      0.1, 0, 0, -0.1, 0, 0, 0.1, -1, 0, -0.1, -1, 0, 0.1, -2, 0.5, -0.1, -2,
      0.5,
    ];
    expected.forEach((value, i) => expect(positions[i]).toBeCloseTo(value));
    expect(Array.from(uvs)).toEqual([
      -1, 1, -1, 0, -0.5, 1, -0.5, 0, 0, 1, 0, 0,
    ]);
  });

  it('follows the tangent around a bend', () => {
    const { positions } = ribbon(
      [
        [0, 0, 0],
        [1, -1, 0],
        [2, -1, 0],
      ],
      Math.SQRT2,
      [0, 0.5, 1],
    );
    const middle = Array.from(positions.slice(6, 12));
    const along = 1 / Math.sqrt(5);
    expect(middle[0]).toBeCloseTo(1 + Math.SQRT2 * along, 4);
    expect(middle[1]).toBeCloseTo(-1 + Math.SQRT2 * 2 * along, 4);
    expect(middle[3]).toBeCloseTo(1 - Math.SQRT2 * along, 4);
  });

  it('falls back to hanging straight down where points coincide', () => {
    const { positions } = ribbon(
      [
        [0, 0, 0],
        [0, 0, 0],
      ],
      1,
      [0, 1],
    );
    expect(Array.from(positions)).toEqual([
      1, 0, 0, -1, 0, 0, 1, 0, 0, -1, 0, 0,
    ]);
  });

  it('rejects mismatched coordinates', () => {
    expect(() => ribbon([[0, 0, 0]], 1, [0])).toThrow(RangeError);
    expect(() =>
      ribbon(
        [
          [0, 0, 0],
          [0, 1, 0],
        ],
        1,
        [0],
      ),
    ).toThrow(RangeError);
  });
});

describe('ribbonIndices', () => {
  it('builds two triangles per step', () => {
    expect(Array.from(ribbonIndices(3))).toEqual([
      0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5,
    ]);
  });
});
