import type { Stage } from './stage';

type Vec2 = [number, number];

// The entrance lowers the strap's top from above the view, so the card falls
// in hanging from it and swings when the top stops.
export function dropEase(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
}

// How far to raise the badge so the bottom of the card starts above the view.
export function dropLift(
  stage: Stage,
  restBottom: number,
  marginPx: number,
): number {
  const top = stage.height / 2 / stage.pxPerUnit;
  return Math.max(0, top - restBottom + marginPx / stage.pxPerUnit);
}

export function dropAnchor(
  time: number,
  [x, y]: Vec2,
  [dx, dy]: Vec2,
  duration: number,
): Vec2 {
  const left = duration > 0 ? 1 - dropEase(time / duration) : 0;
  return [x + dx * left, y + dy * left];
}

export function liftNodes(nodes: Vec2[], [dx, dy]: Vec2): Vec2[] {
  return nodes.map(([x, y]) => [x + dx, y + dy]);
}
