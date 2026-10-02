import { pitchAngle, yawAngle } from './physics';
import type { Vec3 } from './stage';

export const grabPadding = 24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function grabAnchor(
  [x, y]: Vec3,
  card: { width: number; height: number },
  clipTop: number,
  depth: number,
): Vec3 {
  return [
    clamp(x, -card.width / 2, card.width / 2),
    clamp(y, -card.height / 2, card.height / 2 + clipTop),
    depth,
  ];
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

const degrees = 180 / Math.PI;

export function faceDegrees(q: { x: number; y: number; z: number; w: number }) {
  return { yaw: yawAngle(q) * degrees, pitch: pitchAngle(q) * degrees };
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
// implicitly so a stiff pull cannot overshoot. The point sits on the card face,
// in front of the centre, so pulling it also tilts and twists the card.
export function gripImpulse(
  { target, point, centre, linvel, angvel, mass, dt }: GripState,
  grip: { strength: number; radius: number; maxAccel: number },
): Vec3 {
  const [rx, ry, rz] = [0, 1, 2].map((i) => point[i]! - centre[i]!) as Vec3;
  const [wx, wy, wz] = angvel;
  const v: Vec3 = [
    linvel[0] + wy * rz - wz * ry,
    linvel[1] + wz * rx - wx * rz,
    linvel[2] + wx * ry - wy * rx,
  ];
  const m = mass / (1 + (rx ** 2 + ry ** 2 + rz ** 2) / grip.radius);
  const k = grip.strength * m;
  const c = 2 * Math.sqrt(grip.strength) * m;
  const d = 1 + (c * dt + k * dt * dt) / m;
  const f = [0, 1, 2].map(
    (i) => (k * (target[i]! - point[i]!) - c * v[i]!) / d,
  ) as Vec3;
  const size = Math.hypot(...f);
  const limit = grip.maxAccel * mass;
  const scale = (size > limit ? limit / size : 1) * dt;
  return [f[0] * scale, f[1] * scale, f[2] * scale];
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
