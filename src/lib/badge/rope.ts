import type { Vec3 } from './stage';

export const ropeSegments = 5;

export function ropeLayout(
  anchor: [number, number],
  ropeLength: number,
  jointY: number,
  segments = ropeSegments,
) {
  if (segments < 1) throw new RangeError('segments must be at least 1');
  const [x, y] = anchor;
  const segment = ropeLength / segments;
  const joints = Array.from({ length: segments }, (_, i): [number, number] => [
    x,
    y - (i + 1) * segment,
  ]);
  const card: [number, number] = [x, y - ropeLength - jointY];
  return { segment, joints, card };
}

// Label coordinates fixed to the rope material, zero at the card end so the
// visible text never slides when the rope bends or the hero resizes.
export function strapCoordinates(
  intervals: number,
  divisionsPerInterval: number,
  segmentLength: number,
  tileLength: number,
): number[] {
  if (tileLength <= 0) throw new RangeError('tileLength must be positive');
  const total = intervals * divisionsPerInterval;
  return Array.from(
    { length: total + 1 },
    (_, j) =>
      ((j / divisionsPerInterval - intervals) * segmentLength) / tileLength,
  );
}

export function ribbon(points: Vec3[], halfWidth: number, u: number[]) {
  if (points.length < 2 || u.length !== points.length) {
    throw new RangeError('ribbon needs two or more points with coordinates');
  }
  const positions = new Float32Array(points.length * 6);
  const uvs = new Float32Array(points.length * 4);
  let tx = 0;
  let ty = -1;
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(points.length - 1, i + 1)]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (length > 1e-6) {
      tx = dx / length;
      ty = dy / length;
    }
    const nx = -ty * halfWidth;
    const ny = tx * halfWidth;
    positions.set(
      [p[0] + nx, p[1] + ny, p[2], p[0] - nx, p[1] - ny, p[2]],
      i * 6,
    );
    uvs.set([u[i]!, 1, u[i]!, 0], i * 4);
  });
  return { positions, uvs };
}

export function ribbonIndices(count: number): Uint16Array {
  const indices = new Uint16Array((count - 1) * 6);
  for (let i = 0; i < count - 1; i++) {
    const n = i * 2;
    indices.set([n, n + 1, n + 2, n + 2, n + 1, n + 3], i * 6);
  }
  return indices;
}

export const physics = {
  gravity: -45,
  timeStep: 1 / 60,
  solverIterations: 8,
  segmentMass: 0.04,
  segmentDamping: 1.5,
  cardMass: 0.4,
  cardLinearDamping: 1.6,
  cardAngularDamping: 3.5,
  handStiffness: 260,
  handDamping: 14,
  facing: 0.25,
  maxSpeed: 14,
  flipSpin: 14,
  nudge: 1,
  frustumMargin: 16,
  restSpeed: 0.02,
  restFrames: 45,
} as const;
