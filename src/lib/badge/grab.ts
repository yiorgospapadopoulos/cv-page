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

export function limitSpeed<T extends { x: number; y: number; z: number }>(
  v: T,
  max: number,
): T | { x: number; y: number; z: number } {
  const speed = Math.hypot(v.x, v.y, v.z);
  if (speed <= max) return v;
  const k = max / speed;
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}
