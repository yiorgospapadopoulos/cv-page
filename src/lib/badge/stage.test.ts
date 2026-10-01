import { describe, expect, it } from 'vitest';
import {
  canvasToWorld,
  cardWorldWidth,
  clampDragTarget,
  computeStage,
  type StageInput,
} from './stage';

const card = { width: 220, height: 310, offsetTop: 192 };

function desktop(width: number, currentLeft: number): StageInput {
  return {
    hero: { width, height: 900 },
    anchor: { x: width * 0.54, y: 0 },
    strapLength: 170,
    card,
    avoid: [
      { left: 40, top: 40, right: 258, bottom: 97 },
      { left: currentLeft, top: 40, right: width - 40, bottom: 97 },
    ],
  };
}

function intersects(
  a: { left: number; top: number; width: number; height: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return (
    a.left < b.right &&
    a.left + a.width > b.left &&
    a.top < b.bottom &&
    a.top + a.height > b.top
  );
}

describe('computeStage', () => {
  it('hangs from the top edge when the text leaves enough room', () => {
    const input = desktop(1920, 1570);
    const stage = computeStage(input);
    expect(stage.rect.top).toBe(0);
    expect(stage.stub).toBe(0);
    expect(stage.rect.height).toBe(900);
    expect(stage.rect.left).toBeCloseTo(1036.8 - 330);
    expect(stage.rect.left + stage.rect.width).toBeCloseTo(1036.8 + 330);
    expect(stage.ropeLength).toBeCloseTo(170 / stage.pxPerUnit);
  });

  it('narrows a side to stay clear of nearby text', () => {
    const input = desktop(1440, 1090);
    const stage = computeStage(input);
    expect(stage.rect.top).toBe(0);
    expect(stage.rect.left + stage.rect.width).toBe(1090 - 12);
    for (const rect of input.avoid) {
      expect(intersects(stage.rect, rect)).toBe(false);
    }
  });

  it('starts below the text when the gap is too narrow', () => {
    const input = desktop(1024, 674);
    const stage = computeStage(input);
    expect(stage.rect.top).toBe(97 + 12);
    expect(stage.stub).toBe(109);
    expect(stage.rect.width).toBeCloseTo(660);
    expect(stage.ropeLength).toBeCloseTo((170 - 109) / stage.pxPerUnit);
    for (const rect of input.avoid) {
      expect(intersects(stage.rect, rect)).toBe(false);
    }
  });

  it('keeps a minimum rope when the text reaches the strap end', () => {
    const input = desktop(1024, 674);
    input.avoid[0]!.bottom = 300;
    const stage = computeStage(input);
    expect(stage.ropeLength * stage.pxPerUnit).toBeCloseTo(24);
  });

  it('stays within the hero on narrow stacked layouts', () => {
    const stage = computeStage({
      hero: { width: 375, height: 812 },
      anchor: { x: 187.5, y: 230 },
      strapLength: 200,
      card,
      avoid: [
        { left: 16, top: 16, right: 359, bottom: 120 },
        { left: 16, top: 130, right: 359, bottom: 218 },
      ],
    });
    expect(stage.rect).toEqual({ left: 0, top: 230, width: 375, height: 582 });
    expect(stage.stub).toBe(0);
  });

  it('starts below text that sits directly above the anchor', () => {
    const stage = computeStage({
      hero: { width: 900, height: 800 },
      anchor: { x: 450, y: 0 },
      strapLength: 170,
      card,
      avoid: [{ left: 400, top: 20, right: 500, bottom: 60 }],
    });
    expect(stage.rect.top).toBe(72);
  });

  it('maps the card to world units and fits the camera to the canvas', () => {
    const stage = computeStage(desktop(1920, 1570));
    expect(stage.pxPerUnit).toBeCloseTo(220 / cardWorldWidth);
    expect(stage.card.width).toBeCloseTo(cardWorldWidth);
    expect(stage.card.height).toBeCloseTo(310 / stage.pxPerUnit);
    expect(stage.clipGap).toBeCloseTo(22 / stage.pxPerUnit);
    const visible =
      2 * stage.cameraZ * Math.tan(((stage.fov / 2) * Math.PI) / 180);
    expect(visible * stage.pxPerUnit).toBeCloseTo(stage.rect.height);
    expect(stage.anchor[0]).toBeCloseTo(0);
    expect(stage.anchor[1]).toBeCloseTo(900 / 2 / stage.pxPerUnit);
  });
});

describe('canvasToWorld', () => {
  const stage = computeStage(desktop(1920, 1570));

  it('maps the canvas centre to the origin with y up', () => {
    const { width, height } = stage.rect;
    expect(canvasToWorld(stage, width / 2, height / 2)).toEqual([0, 0]);
    const [x, y] = canvasToWorld(stage, width / 2 + 110, height / 2 + 55);
    expect(x).toBeCloseTo(0.8);
    expect(y).toBeCloseTo(-0.4);
  });
});

describe('clampDragTarget', () => {
  const stage = computeStage(desktop(1920, 1570));
  const halfW = stage.rect.width / stage.pxPerUnit / 2;
  const halfH = stage.rect.height / stage.pxPerUnit / 2;
  const [ax, ay] = stage.anchor;
  const reach = stage.ropeLength + stage.clipGap + stage.card.height / 2;

  it('leaves a reachable target alone', () => {
    const target: [number, number] = [ax + 0.3, ay - reach * 0.8];
    expect(clampDragTarget(stage, target)).toEqual(target);
  });

  it('keeps the card inside the canvas', () => {
    const [x] = clampDragTarget(stage, [halfW * 5, ay - reach * 0.5]);
    expect(x).toBeLessThanOrEqual(halfW - stage.card.width / 2);
    const [, y] = clampDragTarget(stage, [ax, halfH * 5]);
    expect(y).toBeLessThanOrEqual(halfH - stage.card.height / 2);
  });

  it('lets the strap stretch only a little', () => {
    const [x, y] = clampDragTarget(stage, [ax, ay - reach * 3]);
    expect(x).toBeCloseTo(ax);
    expect(ay - y).toBeCloseTo(reach * 1.12);
  });
});
