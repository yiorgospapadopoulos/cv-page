// Tuning in metres, kilograms and seconds. toWorld converts it to scene units.
export const physics = {
  metersPerUnit: 1,
  gravity: 9.81,
  timeStep: 1 / 60,
  solverIterations: 12,
  card: { mass: 0.72, linearDamping: 0.45, angularDamping: 0.65 },
  settle: { boost: 2, from: 0.8, to: 0.2, air: 0.15 },
  strap: {
    stiffness: 90,
    dampingRatio: 0.6,
    linkMass: 0.02,
    linkDamping: 1,
    segment: 0.18,
  },
  grip: { strength: 100, radius: 0.65, maxAccel: 110 },
  hover: { limitX: 12, limitY: 8, scaleX: 0.0016, scaleY: 0.0008, force: 1 },
  twist: { strength: 2.2, progressive: 1, damping: 2, limit: 2 },
  nudge: 0.3,
  frustumMargin: 16,
  restSpeed: 0.01,
  restFrames: 45,
} as const;

export type Physics = Omit<typeof physics, 'metersPerUnit'> & {
  metersPerUnit: number;
};

export function toWorld(p: Physics = physics) {
  const m = p.metersPerUnit;
  return {
    ...p,
    gravity: -p.gravity / m,
    grip: {
      ...p.grip,
      radius: p.grip.radius / (m * m),
      maxAccel: p.grip.maxAccel / m,
    },
    hover: { ...p.hover, scale: 1 / m },
    settle: {
      ...p.settle,
      from: p.settle.from / m,
      to: p.settle.to / m,
      air: p.settle.air * m,
    },
  };
}

// Damping while the card hangs free: a boost fades in as it slows so small
// swings die out quickly, and air drag grows with speed so a hard fling
// cannot carry the card over the anchor.
export function freeDamping(
  base: number,
  speed: number,
  settle: { boost: number; from: number; to: number; air: number },
): number {
  const t = (settle.from - speed) / (settle.from - settle.to);
  return base + settle.boost * Math.min(1, Math.max(0, t)) + settle.air * speed;
}

export function yawAngle(q: {
  x: number;
  y: number;
  z: number;
  w: number;
}): number {
  const nx = 2 * (q.x * q.z + q.w * q.y);
  const nz = 1 - 2 * (q.x * q.x + q.y * q.y);
  return Math.atan2(nx, nz);
}

// Change in spin about the vertical axis for one step, given how far the card
// is turned away from where it should face.
export function twistRate(
  error: number,
  rate: number,
  dt: number,
  twist: {
    strength: number;
    progressive: number;
    damping: number;
    limit: number;
  },
): number {
  const e = Math.min(twist.limit, Math.max(-twist.limit, error));
  const torque = twist.strength * e + twist.progressive * e * Math.abs(e);
  return -(torque + twist.damping * rate) * dt;
}
