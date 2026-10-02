import { describe, expect, it } from 'vitest';
import {
  cardInertia,
  freeDamping,
  freedom,
  physics,
  pinchTorque,
  pitchAngle,
  swivelImpulse,
  toWorld,
  twistTorque,
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
    expect(world.grip.depth).toBeCloseTo(physics.grip.depth * 2);
    expect(world.pinch.strength).toBeCloseTo(physics.pinch.strength * 4);
    expect(world.pinch.damping).toBeCloseTo(physics.pinch.damping * 4);
    expect(world.twist.strength).toBeCloseTo(physics.twist.strength * 4);
    expect(world.twist.damping).toBeCloseTo(physics.twist.damping * 2);
    expect(world.twist.limit).toBeCloseTo(physics.twist.limit * 4);
    expect(world.twist.progression).toBe(physics.twist.progression);
    expect(world.swivel.inertia).toBeCloseTo(physics.swivel.inertia * 4);
    expect(world.swivel.twist).toBe(physics.swivel.twist);
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

describe('pitchAngle', () => {
  const aroundX = (rad: number) => ({
    x: Math.sin(rad / 2),
    y: 0,
    z: 0,
    w: Math.cos(rad / 2),
  });

  it('reads how far the card leans toward or away from the viewer', () => {
    expect(pitchAngle({ x: 0, y: 0, z: 0, w: 1 })).toBeCloseTo(0);
    expect(pitchAngle(aroundX(0.4))).toBeCloseTo(0.4);
    expect(pitchAngle(aroundX(-0.3))).toBeCloseTo(-0.3);
  });

  it('ignores a twist or an in-plane swing', () => {
    const half = Math.PI / 6;
    expect(
      pitchAngle({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }),
    ).toBeCloseTo(0);
    expect(
      pitchAngle({ x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) }),
    ).toBeCloseTo(0);
  });
});

describe('twistTorque', () => {
  const twist = { strength: 2, progression: 3, damping: 0.5, limit: 18 };

  it('does nothing when the card faces forward and is still', () => {
    expect(twistTorque(0, 0, twist)).toBeCloseTo(0);
  });

  it('turns the card back toward facing forward', () => {
    expect(twistTorque(0.3, 0, twist)).toBeLessThan(0);
    expect(twistTorque(-0.3, 0, twist)).toBeGreaterThan(0);
  });

  it('pulls harder than a plain spring the further the card is turned', () => {
    expect(twistTorque(0.1, 0, twist)).toBeCloseTo(
      -2 * 0.1 * (1 + 3 * (0.1 / Math.PI) ** 2),
    );
    expect(twistTorque(Math.PI / 2, 0, twist)).toBeCloseTo(
      -2 * (Math.PI / 2) * 1.75,
    );
  });

  it('damps the swivel in proportion to the spring strength', () => {
    expect(twistTorque(0, 4, twist)).toBeCloseTo(-0.5 * Math.sqrt(2) * 4);
  });

  it('limits the torque so a hard spin cannot run away', () => {
    expect(twistTorque(0, 100, twist)).toBe(-18);
    expect(twistTorque(-3, -100, twist)).toBe(18);
  });

  it('is off when the strength is zero', () => {
    expect(twistTorque(1, 1, { ...twist, strength: 0 })).toBe(0);
  });
});

describe('swivelImpulse', () => {
  it('removes part of the spin about an axis each step', () => {
    const impulse = swivelImpulse(2, 0.5, 0.15, 1 / 60);
    expect(impulse).toBeCloseTo(-2 * 0.5 * (1 - Math.exp(-1.5 / 60)));
  });

  it('never reverses the spin, even with a long step', () => {
    const impulse = swivelImpulse(2, 0.5, 0.15, 100);
    expect(impulse).toBeCloseTo(-1);
  });

  it('does nothing without spin or damping', () => {
    expect(swivelImpulse(0, 0.5, 0.15, 1 / 60)).toBeCloseTo(0);
    expect(swivelImpulse(2, 0.5, 0, 1 / 60)).toBeCloseTo(0);
  });
});

describe('freedom', () => {
  it('lets the strap and card move in depth', () => {
    expect(freedom.link.translations).toEqual([true, true, true]);
    expect(freedom.card.translations).toEqual([true, true, true]);
  });

  it('lets the card tilt, twist and swing, while strap links do not spin', () => {
    expect(freedom.card.rotations).toEqual([true, true, true]);
    expect(freedom.link.rotations).toEqual([false, false, false]);
  });
});

describe('pinchTorque', () => {
  const pinch = { strength: 2, damping: 0.5 };

  it('holds the card upright while it is held', () => {
    expect(pinchTorque(0, 0, pinch)).toBeCloseTo(0);
    expect(pinchTorque(0.2, 0, pinch)).toBeCloseTo(-0.4);
    expect(pinchTorque(-0.2, 0, pinch)).toBeCloseTo(0.4);
  });

  it('damps a tilting motion', () => {
    expect(pinchTorque(0, 2, pinch)).toBeCloseTo(-1);
  });
});

describe('cardInertia', () => {
  const size: [number, number, number] = [1.6, 2.2, 0.04];

  it('is a thin box with its centre of mass in the middle', () => {
    const { mass, centerOfMass, principalAngularInertia } = cardInertia(
      0.72,
      size,
      0,
    );
    expect(mass).toBe(0.72);
    expect(centerOfMass).toEqual({ x: 0, y: 0, z: 0 });
    expect(principalAngularInertia.x).toBeCloseTo(
      (0.72 * (2.2 ** 2 + 0.04 ** 2)) / 12,
    );
    expect(principalAngularInertia.y).toBeCloseTo(
      (0.72 * (1.6 ** 2 + 0.04 ** 2)) / 12,
    );
    expect(principalAngularInertia.z).toBeCloseTo(
      (0.72 * (1.6 ** 2 + 2.2 ** 2)) / 12,
    );
  });

  it('turns the inertia axes about the card normal by the skew', () => {
    const frame = cardInertia(0.72, size, 20).angularInertiaLocalFrame;
    expect(frame.x).toBe(0);
    expect(frame.y).toBe(0);
    expect(frame.z).toBeCloseTo(Math.sin(Math.PI / 18));
    expect(frame.w).toBeCloseTo(Math.cos(Math.PI / 18));
  });
});
