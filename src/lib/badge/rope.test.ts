import { describe, expect, it } from 'vitest';
import {
  physics,
  ribbon,
  ribbonIndices,
  ropeLayout,
  strapCoordinates,
} from './rope';

describe('ropeLayout', () => {
  it('hangs equal segments straight down from the anchor', () => {
    const layout = ropeLayout([1, 3], 2, 0.5, 4);
    expect(layout.segment).toBeCloseTo(0.5);
    expect(layout.joints).toHaveLength(4);
    layout.joints.forEach(([x, y], i) => {
      expect(x).toBe(1);
      expect(y).toBeCloseTo(3 - (i + 1) * 0.5);
    });
    expect(layout.card[0]).toBe(1);
    expect(layout.card[1]).toBeCloseTo(3 - 2 - 0.5);
  });

  it('rejects a rope without segments', () => {
    expect(() => ropeLayout([0, 0], 1, 0, 0)).toThrow(RangeError);
  });
});

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

describe('physics tuning', () => {
  it('damps the hand spring without overshooting wildly', () => {
    const critical = 2 * Math.sqrt(physics.handStiffness * physics.cardMass);
    const ratio = physics.handDamping / critical;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(1.2);
  });

  it('keeps the rope lighter than the card', () => {
    expect(physics.segmentMass * 5).toBeLessThan(physics.cardMass);
  });
});
