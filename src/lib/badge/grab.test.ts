import { describe, expect, it } from 'vitest';
import {
  grabAnchor,
  isTap,
  limitSpeed,
  screenBounds,
  tiltDegrees,
} from './grab';

const card = { width: 1.6, height: 2.2 };

describe('grabAnchor', () => {
  it('keeps a point on the card and drops depth', () => {
    expect(grabAnchor([0.3, -0.4, 0.02], card, 0.2)).toEqual([0.3, -0.4, 0]);
  });

  it('pulls a point in the padding onto the nearest card edge', () => {
    expect(grabAnchor([1.2, -1.5, 0], card, 0.2)).toEqual([0.8, -1.1, 0]);
    expect(grabAnchor([-1.2, 2, 0], card, 0.2)).toEqual([-0.8, 1.3, 0]);
  });
});

describe('isTap', () => {
  const down = { x: 10, y: 10, time: 1000 };

  it('accepts a short press that barely moves', () => {
    expect(isTap(down, { x: 13, y: 12, time: 1200 })).toBe(true);
  });

  it('rejects a long press or a drag', () => {
    expect(isTap(down, { x: 10, y: 10, time: 1300 })).toBe(false);
    expect(isTap(down, { x: 20, y: 10, time: 1100 })).toBe(false);
  });
});

describe('tiltDegrees', () => {
  const aroundZ = (deg: number) => {
    const half = (deg * Math.PI) / 360;
    return { x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) };
  };

  it('reads the in-plane rotation of the card', () => {
    expect(tiltDegrees({ x: 0, y: 0, z: 0, w: 1 })).toBeCloseTo(0);
    expect(tiltDegrees(aroundZ(30))).toBeCloseTo(30);
    expect(tiltDegrees(aroundZ(-75))).toBeCloseTo(-75);
  });

  it('ignores a spin around the vertical axis', () => {
    const half = Math.PI / 4;
    expect(
      tiltDegrees({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }),
    ).toBeCloseTo(0);
  });
});

describe('screenBounds', () => {
  it('pads the box around the projected points', () => {
    expect(
      screenBounds(
        [
          [10, 40],
          [50, 20],
          [30, 90],
        ],
        24,
      ),
    ).toEqual({ left: -14, top: -4, width: 88, height: 118 });
  });
});

describe('limitSpeed', () => {
  it('leaves slow motion alone', () => {
    const v = { x: 1, y: 2, z: 0 };
    expect(limitSpeed(v, 10)).toBe(v);
  });

  it('scales fast motion down to the limit', () => {
    const v = limitSpeed({ x: 30, y: 40, z: 0 }, 10);
    expect(v.x).toBeCloseTo(6);
    expect(v.y).toBeCloseTo(8);
    expect(v.z).toBe(0);
  });
});
