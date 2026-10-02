import type { Vec3 } from './stage';

export const grabPadding = 24;
const tapTime = 250;
const tapDistance = 6;

interface Press {
  x: number;
  y: number;
  time: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function grabAnchor(
  [x, y]: Vec3,
  card: { width: number; height: number },
  clipTop: number,
): Vec3 {
  return [
    clamp(x, -card.width / 2, card.width / 2),
    clamp(y, -card.height / 2, card.height / 2 + clipTop),
    0,
  ];
}

export function isTap(down: Press, up: Press): boolean {
  return (
    up.time - down.time < tapTime &&
    Math.hypot(up.x - down.x, up.y - down.y) < tapDistance
  );
}

export function tiltDegrees(q: {
  x: number;
  y: number;
  z: number;
  w: number;
}): number {
  const upX = 2 * (q.x * q.y - q.w * q.z);
  const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
  return (Math.atan2(-upX, upY) * 180) / Math.PI;
}

export function screenBounds(points: [number, number][], padding: number) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(...xs) - padding;
  const top = Math.min(...ys) - padding;
  return {
    left,
    top,
    width: Math.max(...xs) + padding - left,
    height: Math.max(...ys) + padding - top,
  };
}

interface GripState {
  target: Vec3;
  point: Vec3;
  centre: Vec3;
  linvel: Vec3;
  angvel: Vec3;
  mass: number;
  dt: number;
}

// Critically damped spring from the grabbed point to the pointer, integrated
// implicitly so a stiff pull cannot overshoot. Returns the impulse for one step.
export function gripImpulse(
  { target, point, centre, linvel, angvel, mass, dt }: GripState,
  grip: { strength: number; radius: number; maxAccel: number },
): Vec3 {
  const r = [0, 1, 2].map((i) => point[i]! - centre[i]!) as Vec3;
  const vx = linvel[0] + angvel[1] * r[2] - angvel[2] * r[1];
  const vy = linvel[1] + angvel[2] * r[0] - angvel[0] * r[2];
  const m = mass / (1 + (r[0] ** 2 + r[1] ** 2 + r[2] ** 2) / grip.radius);
  const k = grip.strength * m;
  const c = 2 * Math.sqrt(grip.strength) * m;
  const d = 1 + (c * dt + k * dt * dt) / m;
  let fx = (k * (target[0] - point[0]) - c * vx) / d;
  let fy = (k * (target[1] - point[1]) - c * vy) / d;
  const limit = grip.maxAccel * mass;
  const size = Math.hypot(fx, fy);
  if (size > limit) {
    fx *= limit / size;
    fy *= limit / size;
  }
  return [fx * dt, fy * dt, 0];
}

export function hoverImpulse(
  dx: number,
  dy: number,
  hover: {
    limitX: number;
    limitY: number;
    scaleX: number;
    scaleY: number;
    force: number;
    scale: number;
  },
): Vec3 {
  const k = hover.force * hover.scale;
  return [
    clamp(dx, -hover.limitX, hover.limitX) * hover.scaleX * k,
    -clamp(dy, -hover.limitY, hover.limitY) * hover.scaleY * k,
    0,
  ];
}
