export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface StageInput {
  hero: { width: number; height: number };
  anchor: { x: number; y: number };
  strapLength: number;
  card: { width: number; height: number; offsetTop: number };
  avoid: Rect[];
}

export interface Stage {
  rect: { left: number; top: number; width: number; height: number };
  stub: number;
  pxPerUnit: number;
  anchor: [number, number];
  ropeLength: number;
  clipGap: number;
  card: { width: number; height: number };
  cameraZ: number;
  fov: number;
}

export const cardWorldWidth = 1.6;
const margin = 12;
const minRope = 24;
const cameraZ = 13;
const stretch = 1.12;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function horizontalRoom(input: StageInput, top: number) {
  const { hero, anchor, card } = input;
  let left = clamp(anchor.x - card.width * 1.5, 0, hero.width);
  let right = clamp(anchor.x + card.width * 1.5, 0, hero.width);
  let blocked = false;
  for (const r of input.avoid.filter((rect) => rect.bottom > top)) {
    if (r.right + margin <= anchor.x) {
      left = Math.max(left, r.right + margin);
    } else if (r.left - margin >= anchor.x) {
      right = Math.min(right, r.left - margin);
    } else {
      blocked = true;
    }
  }
  const minSide = card.width * 1.25;
  const tooNarrow =
    anchor.x - left < Math.min(minSide, anchor.x) ||
    right - anchor.x < Math.min(minSide, hero.width - anchor.x);
  return { left, right, fits: !blocked && !tooNarrow };
}

export function computeStage(input: StageInput): Stage {
  const { hero, anchor, card, strapLength } = input;
  let top = anchor.y;
  let room = horizontalRoom(input, top);
  if (!room.fits) {
    const below = input.avoid.filter((rect) => rect.bottom > top);
    top = Math.max(...below.map((rect) => rect.bottom)) + margin;
    room = horizontalRoom(input, top);
  }
  const width = room.right - room.left;
  const height = hero.height - top;
  const stub = top - anchor.y;
  const pxPerUnit = card.width / cardWorldWidth;
  return {
    rect: { left: room.left, top, width, height },
    stub,
    pxPerUnit,
    anchor: [
      (anchor.x - room.left - width / 2) / pxPerUnit,
      height / 2 / pxPerUnit,
    ],
    ropeLength: Math.max(strapLength - stub, minRope) / pxPerUnit,
    clipGap: (card.offsetTop - strapLength) / pxPerUnit,
    card: { width: cardWorldWidth, height: card.height / pxPerUnit },
    cameraZ,
    fov: (2 * Math.atan(height / pxPerUnit / 2 / cameraZ) * 180) / Math.PI,
  };
}

export function canvasToWorld(
  stage: Stage,
  x: number,
  y: number,
): [number, number] {
  const { width, height } = stage.rect;
  return [
    (x - width / 2) / stage.pxPerUnit,
    (height / 2 - y) / stage.pxPerUnit,
  ];
}

export function clampDragTarget(
  stage: Stage,
  target: [number, number],
): [number, number] {
  const [ax, ay] = stage.anchor;
  const reach =
    (stage.ropeLength + stage.clipGap + stage.card.height / 2) * stretch;
  let [x, y] = target;
  const distance = Math.hypot(x - ax, y - ay);
  if (distance > reach) {
    x = ax + ((x - ax) * reach) / distance;
    y = ay + ((y - ay) * reach) / distance;
  }
  const halfW = stage.rect.width / stage.pxPerUnit / 2 - stage.card.width / 2;
  const halfH = stage.rect.height / stage.pxPerUnit / 2 - stage.card.height / 2;
  return [clamp(x, -halfW, halfW), clamp(y, -halfH, halfH)];
}
