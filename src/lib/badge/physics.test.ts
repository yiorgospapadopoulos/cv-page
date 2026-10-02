import { describe, expect, it } from 'vitest';
import {
  freeDamping,
  physics,
  toWorld,
  twistRate,
  unwrapAngle,
  yawAngle,
} from './physics';

describe('toWorld', () => {
  it('keeps metre based values when one world unit is a metre', () => {
    const world = toWorld({ ...physics, metersPerUnit: 1 });
    expect(world.gravity).toBeCloseTo(-9.81);
    expect(world.grip.radius).toBeCloseTo(0.65);
    expect(world.grip.maxAccel).toBeCloseTo(110);
    expect(world.hover.scale).toBeCloseTo(1);
  });

  it('scales lengths, accelerations and impulses together', () => {
    const world = toWorld({ ...physics, metersPerUnit: 0.5 });
    expect(world.gravity).toBeCloseTo(-19.62);
    expect(world.grip.radius).toBeCloseTo(2.6);
    expect(world.grip.maxAccel).toBeCloseTo(220);
    expect(world.hover.scale).toBeCloseTo(2);
    expect(world.settle.from).toBeCloseTo(physics.settle.from * 2);
    expect(world.settle.to).toBeCloseTo(physics.settle.to * 2);
    expect(world.settle.air).toBeCloseTo(physics.settle.air / 2);
  });

  it('leaves mass, stiffness and damping unchanged', () => {
    const world = toWorld({ ...physics, metersPerUnit: 0.25 });
    expect(world.card).toEqual(physics.card);
    expect(world.strap.stiffness).toBe(physics.strap.stiffness);
    expect(world.grip.strength).toBe(physics.grip.strength);
  });
});

describe('freeDamping', () => {
  const settle = { boost: 2, from: 1, to: 0.2, air: 0 };

  it('keeps the base damping while the card moves at a normal pace', () => {
    expect(freeDamping(0.45, 3, settle)).toBe(0.45);
    expect(freeDamping(0.45, 1, settle)).toBe(0.45);
  });

  it('adds the full boost once the card is nearly still', () => {
    expect(freeDamping(0.45, 0.2, settle)).toBeCloseTo(2.45);
    expect(freeDamping(0.45, 0, settle)).toBeCloseTo(2.45);
  });

  it('blends the boost in between', () => {
    expect(freeDamping(0.45, 0.6, settle)).toBeCloseTo(1.45);
  });

  it('adds air drag that grows with speed so a hard fling slows quickly', () => {
    const air = { ...settle, air: 0.1 };
    expect(freeDamping(0.45, 3, air)).toBeCloseTo(0.75);
    expect(freeDamping(0.45, 10, air)).toBeCloseTo(1.45);
  });
});

describe('yawAngle', () => {
  const aroundY = (rad: number) => ({
    x: 0,
    y: Math.sin(rad / 2),
    z: 0,
    w: Math.cos(rad / 2),
  });

  it('reads how far the card has turned about the vertical axis', () => {
    expect(yawAngle({ x: 0, y: 0, z: 0, w: 1 })).toBeCloseTo(0);
    expect(yawAngle(aroundY(0.5))).toBeCloseTo(0.5);
    expect(yawAngle(aroundY(-2))).toBeCloseTo(-2);
  });

  it('wraps a full turn back to facing forward', () => {
    expect(yawAngle(aroundY(2 * Math.PI - 0.3))).toBeCloseTo(-0.3);
  });

  it('ignores an in-plane tilt', () => {
    const half = Math.PI / 8;
    expect(
      yawAngle({ x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) }),
    ).toBeCloseTo(0);
  });
});

describe('twistRate', () => {
  const twist = { strength: 2, progressive: 1, damping: 0.5, limit: 2 };

  it('does nothing when the card faces forward and is still', () => {
    expect(twistRate(0, 0, 0.1, twist)).toBeCloseTo(0);
  });

  it('turns the card back toward facing forward, harder when far off', () => {
    const near = twistRate(0.2, 0, 0.1, twist);
    const far = twistRate(-1, 0, 0.1, twist);
    expect(near).toBeCloseTo(-(2 * 0.2 + 0.04) * 0.1);
    expect(far).toBeCloseTo((2 + 1) * 0.1);
  });

  it('limits the pull so a full turn after a tap spins at a calm pace', () => {
    expect(twistRate(-2 * Math.PI, 0, 0.1, twist)).toBeCloseTo((4 + 4) * 0.1);
  });

  it('damps the swivel', () => {
    expect(twistRate(0, 4, 0.1, twist)).toBeCloseTo(-0.2);
  });
});

describe('unwrapAngle', () => {
  it('follows small changes directly', () => {
    expect(unwrapAngle(0.5, 0.7)).toBeCloseTo(0.7);
    expect(unwrapAngle(-0.5, -0.7)).toBeCloseTo(-0.7);
  });

  it('keeps counting past half a turn instead of jumping back', () => {
    expect(unwrapAngle(3, -3)).toBeCloseTo(2 * Math.PI - 3);
    expect(unwrapAngle(-3, 3)).toBeCloseTo(3 - 2 * Math.PI);
  });

  it('keeps counting over several turns', () => {
    const turned = unwrapAngle(4 * Math.PI + 3, -3);
    expect(turned).toBeCloseTo(6 * Math.PI - 3);
  });
});
