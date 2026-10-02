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
  grip: { strength: 100, radius: 0.65, maxAccel: 110, depth: 0.07 },
  pinch: { strength: 2.5, damping: 0.3 },
  hover: { limitX: 12, limitY: 8, scaleX: 0.0016, scaleY: 0.0008, force: 1 },
  twist: { strength: 0.45, progression: 3, damping: 0.3, limit: 18 },
  swivel: { twist: 0.15, tilt: 0.08 + 0.4 * 0.15, inertia: 0.03 },
  skew: 20,
  nudge: 0.3,
  // Entrance: margin in pixels above the view, side offset in metres, seconds, radians.
  drop: { margin: 40, side: -0.5, duration: 1.5, yaw: -0.35 },
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
      depth: p.grip.depth / m,
    },
    pinch: {
      strength: p.pinch.strength / (m * m),
      damping: p.pinch.damping / (m * m),
    },
    twist: {
      ...p.twist,
      strength: p.twist.strength / (m * m),
      damping: p.twist.damping / m,
      limit: p.twist.limit / (m * m),
    },
    swivel: { ...p.swivel, inertia: p.swivel.inertia / (m * m) },
    drop: { ...p.drop, side: p.drop.side / m },
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

// Leaning toward (positive) or away from the viewer, from the card's normal.
export function pitchAngle(q: {
  x: number;
  y: number;
  z: number;
  w: number;
}): number {
  const nx = 2 * (q.x * q.z + q.w * q.y);
  const ny = 2 * (q.y * q.z - q.w * q.x);
  const nz = 1 - 2 * (q.x * q.x + q.y * q.y);
  return Math.atan2(-ny, Math.hypot(nx, nz));
}

// Restoring torque about the vertical axis that grows faster than a spring
// the further the card is turned, so small twists linger and big ones return.
export function twistTorque(
  yaw: number,
  rate: number,
  twist: {
    strength: number;
    progression: number;
    damping: number;
    limit: number;
  },
): number {
  if (twist.strength === 0) return 0;
  const spring =
    twist.strength * yaw * (1 + twist.progression * (yaw / Math.PI) ** 2);
  const torque = -spring - twist.damping * Math.sqrt(twist.strength) * rate;
  return Math.min(twist.limit, Math.max(-twist.limit, torque));
}

// Angular impulse that removes part of the spin about one axis in a step, as
// friction in the clip that joins the card to the strap.
export function swivelImpulse(
  rate: number,
  inertia: number,
  damping: number,
  dt: number,
): number {
  return -rate * inertia * (1 - Math.exp(-10 * damping * dt));
}

type Axes = [boolean, boolean, boolean];

export const freedom: Record<
  'link' | 'card',
  { translations: Axes; rotations: Axes }
> = {
  link: { translations: [true, true, true], rotations: [false, false, false] },
  card: { translations: [true, true, true], rotations: [true, true, true] },
};

// While held, the fingers resist tilting the card toward or away from the
// viewer, so lifting it by its face does not fold it flat.
export function pinchTorque(
  pitch: number,
  rate: number,
  pinch: { strength: number; damping: number },
): number {
  return -(pinch.strength * pitch + pinch.damping * rate);
}

// Mass properties of the card with its inertia axes turned in its own plane,
// like a badge whose weight is not perfectly even, so a tilt also twists it.
export function cardInertia(
  mass: number,
  [width, height, depth]: [number, number, number],
  skewDegrees: number,
) {
  const half = (skewDegrees * Math.PI) / 360;
  return {
    mass,
    centerOfMass: { x: 0, y: 0, z: 0 },
    principalAngularInertia: {
      x: (mass * (height ** 2 + depth ** 2)) / 12,
      y: (mass * (width ** 2 + depth ** 2)) / 12,
      z: (mass * (width ** 2 + height ** 2)) / 12,
    },
    angularInertiaLocalFrame: {
      x: 0,
      y: 0,
      z: Math.sin(half),
      w: Math.cos(half),
    },
  };
}
