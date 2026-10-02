import { describe, expect, it } from 'vitest';
import {
  grabAnchor,
  gripImpulse,
  hoverImpulse,
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

const grip = { strength: 100, radius: 0.65, maxAccel: 110 };
const still = {
  centre: [0, 0, 0] as [number, number, number],
  linvel: [0, 0, 0] as [number, number, number],
  angvel: [0, 0, 0] as [number, number, number],
  mass: 0.72,
  dt: 1 / 60,
};

describe('gripImpulse', () => {
  it('pulls the grabbed point toward the pointer with an implicit spring', () => {
    const [x, y, z] = gripImpulse(
      { ...still, point: [0, 0, 0], target: [0.1, 0, 0] },
      grip,
    );
    const k = 100 * 0.72;
    const c = 20 * 0.72;
    const d = 1 + (c / 60 + k / 3600) / 0.72;
    expect(x).toBeCloseTo(((k * 0.1) / d) * (1 / 60));
    expect(y).toBe(0);
    expect(z).toBe(0);
  });

  it('pulls more gently when grabbed far from the centre', () => {
    const centred = gripImpulse(
      { ...still, point: [0, 0, 0], target: [0, -0.1, 0] },
      grip,
    );
    const corner = gripImpulse(
      { ...still, point: [0.8, 1.1, 0], target: [0.8, 1, 0] },
      grip,
    );
    expect(corner[1]).toBeLessThan(0);
    expect(Math.abs(corner[1])).toBeLessThan(Math.abs(centred[1]) / 2);
  });

  it('damps the velocity of the grabbed point, including spin', () => {
    const moving = gripImpulse(
      {
        ...still,
        point: [1, 0, 0],
        target: [1, 0, 0],
        angvel: [0, 0, 2],
      },
      grip,
    );
    expect(moving[0]).toBeCloseTo(0);
    expect(moving[1]).toBeLessThan(0);
  });

  it('caps the force so a far pointer cannot fling the card', () => {
    const [x, y] = gripImpulse(
      { ...still, point: [0, 0, 0], target: [30, 40, 0] },
      grip,
    );
    expect(Math.hypot(x, y)).toBeCloseTo((110 * 0.72) / 60);
    expect(x / y).toBeCloseTo(0.75);
  });

  it('stays in the card plane', () => {
    const impulse = gripImpulse(
      {
        ...still,
        point: [0, 0, 0.2],
        target: [0, 0, -1],
        linvel: [0, 0, 3],
      },
      grip,
    );
    expect(impulse).toEqual([0, 0, 0]);
  });
});

describe('hoverImpulse', () => {
  const hover = {
    limitX: 12,
    limitY: 8,
    scaleX: 0.008,
    scaleY: 0.004,
    force: 1,
    scale: 1,
  };

  it('pushes the card along the pointer motion, screen down is world down', () => {
    const [x, y, z] = hoverImpulse(5, 2, hover);
    expect(x).toBeCloseTo(0.04);
    expect(y).toBeCloseTo(-0.008);
    expect(z).toBe(0);
  });

  it('clamps a fast pointer', () => {
    const [x, y] = hoverImpulse(-40, -40, hover);
    expect(x).toBeCloseTo(-0.096);
    expect(y).toBeCloseTo(0.032);
  });

  it('applies the force and world scale', () => {
    const [x] = hoverImpulse(10, 0, { ...hover, force: 2, scale: 0.5 });
    expect(x).toBeCloseTo(0.08);
  });
});
