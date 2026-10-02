export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface StageInput {
  hero: { width: number; height: number };
  badge: { x: number; top: number };
  strapLength: number;
  bandWidth: number;
  card: { width: number; height: number; offsetTop: number };
  avoid: Rect[];
}

export interface Stage {
  width: number;
  height: number;
  pxPerUnit: number;
  anchor: [number, number];
  ropeLength: number;
  clipGap: number;
  bandWidth: number;
  card: { width: number; height: number };
  cameraZ: number;
  fov: number;
}

export type Vec3 = [number, number, number];

export const cardWorldWidth = 1.6;
export const overhang = 120;
const cameraZ = 13;
const strapMargin = 8;

function textAbove(input: StageInput): boolean {
  const { badge, bandWidth, avoid } = input;
  const half = bandWidth / 2 + strapMargin;
  return avoid.some(
    (r) =>
      r.top < badge.top && r.left < badge.x + half && r.right > badge.x - half,
  );
}

export function computeStage(input: StageInput): Stage {
  const { hero, badge, card, strapLength } = input;
  const pxPerUnit = card.width / cardWorldWidth;
  const anchorY = textAbove(input) ? badge.top : -overhang;
  return {
    width: hero.width,
    height: hero.height,
    pxPerUnit,
    anchor: [
      (badge.x - hero.width / 2) / pxPerUnit,
      (hero.height / 2 - anchorY) / pxPerUnit,
    ],
    ropeLength: (strapLength + badge.top - anchorY) / pxPerUnit,
    clipGap: (card.offsetTop - strapLength) / pxPerUnit,
    bandWidth: input.bandWidth / pxPerUnit,
    card: { width: cardWorldWidth, height: card.height / pxPerUnit },
    cameraZ,
    fov: (2 * Math.atan(hero.height / pxPerUnit / 2 / cameraZ) * 180) / Math.PI,
  };
}

function halfExtents(stage: Stage, z: number): [number, number] {
  const halfH =
    (stage.cameraZ - z) * Math.tan(((stage.fov / 2) * Math.PI) / 180);
  return [(halfH * stage.width) / stage.height, halfH];
}

export function screenToPlane(
  stage: Stage,
  [px, py]: [number, number],
  z = 0,
): Vec3 {
  const [halfW, halfH] = halfExtents(stage, z);
  return [
    ((px / stage.width) * 2 - 1) * halfW,
    (1 - (py / stage.height) * 2) * halfH,
    z,
  ];
}

export function worldToScreen(stage: Stage, [x, y, z]: Vec3): [number, number] {
  const [halfW, halfH] = halfExtents(stage, z);
  return [
    ((x / halfW + 1) / 2) * stage.width,
    ((1 - y / halfH) / 2) * stage.height,
  ];
}

function clamp(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}

export function clampToFrustum(
  stage: Stage,
  [x, y]: [number, number],
  marginPx: number,
  z = 0,
): [number, number] {
  const [halfW, halfH] = halfExtents(stage, z);
  const margin = marginPx / stage.pxPerUnit;
  return [clamp(x, halfW - margin), clamp(y, halfH - margin)];
}

export function clientToNdc(
  [x, y]: [number, number],
  rect: { left: number; top: number; width: number; height: number },
): [number, number] {
  return [
    ((x - rect.left) / rect.width) * 2 - 1,
    1 - ((y - rect.top) / rect.height) * 2,
  ];
}
