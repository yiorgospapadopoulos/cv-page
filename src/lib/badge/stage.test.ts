import { describe, expect, it } from 'vitest';
import {
  cardWorldWidth,
  clampToFrustum,
  clientToNdc,
  computeStage,
  overhang,
  screenToPlane,
  worldToScreen,
  type StageInput,
} from './stage';

const card = { width: 220, height: 310, offsetTop: 192 };

function desktop(width = 1440, height = 900): StageInput {
  return {
    hero: { width, height },
    badge: { x: width * 0.54, top: 0 },
    strapLength: 170,
    bandWidth: 16,
    card,
    avoid: [
      { left: 40, top: 40, right: 258, bottom: 97 },
      { left: width - 400, top: 40, right: width - 40, bottom: 97 },
    ],
  };
}

function stacked(): StageInput {
  return {
    hero: { width: 375, height: 812 },
    badge: { x: 187.5, top: 230 },
    strapLength: 200,
    bandWidth: 16,
    card,
    avoid: [
      { left: 16, top: 16, right: 359, bottom: 120 },
      { left: 16, top: 130, right: 359, bottom: 218 },
    ],
  };
}

describe('computeStage', () => {
  it('covers the whole hero', () => {
    const stage = computeStage(desktop());
    expect(stage.width).toBe(1440);
    expect(stage.height).toBe(900);
  });

  it('maps the card to world units and fits the camera to the hero', () => {
    const stage = computeStage(desktop());
    expect(stage.pxPerUnit).toBeCloseTo(220 / cardWorldWidth);
    expect(stage.card.width).toBeCloseTo(cardWorldWidth);
    expect(stage.card.height).toBeCloseTo(310 / stage.pxPerUnit);
    expect(stage.clipGap).toBeCloseTo(22 / stage.pxPerUnit);
    expect(stage.bandWidth).toBeCloseTo(16 / stage.pxPerUnit);
    const visible =
      2 * stage.cameraZ * Math.tan(((stage.fov / 2) * Math.PI) / 180);
    expect(visible * stage.pxPerUnit).toBeCloseTo(900);
  });

  it('hangs the strap from above the hero when no text is in the way', () => {
    const stage = computeStage(desktop());
    const [x, y] = worldToScreen(stage, [...stage.anchor, 0]);
    expect(x).toBeCloseTo(1440 * 0.54);
    expect(y).toBeCloseTo(-overhang);
    expect(stage.ropeLength * stage.pxPerUnit).toBeCloseTo(170 + overhang);
  });

  it('starts the strap at the badge when text sits above it', () => {
    const stage = computeStage(stacked());
    const [x, y] = worldToScreen(stage, [...stage.anchor, 0]);
    expect(x).toBeCloseTo(187.5);
    expect(y).toBeCloseTo(230);
    expect(stage.ropeLength * stage.pxPerUnit).toBeCloseTo(200);
  });

  it('ignores text beside the strap or below the badge top', () => {
    const input = desktop();
    input.badge.top = 50;
    input.avoid = [
      { left: 0, top: 0, right: 760, bottom: 40 },
      { left: 800, top: 0, right: 1440, bottom: 40 },
      { left: 0, top: 60, right: 1440, bottom: 90 },
    ];
    const stage = computeStage(input);
    const [, y] = worldToScreen(stage, [...stage.anchor, 0]);
    expect(y).toBeCloseTo(-overhang);
    expect(stage.ropeLength * stage.pxPerUnit).toBeCloseTo(170 + 50 + overhang);
  });
});

describe('screen and world mapping', () => {
  const stage = computeStage(desktop());

  it('maps the hero centre to the world origin', () => {
    expect(screenToPlane(stage, [720, 450])).toEqual([0, 0, 0]);
  });

  it('maps pixels one to one on the card plane', () => {
    const [x, y] = screenToPlane(stage, [720 + 137.5, 450 - 275]);
    expect(x).toBeCloseTo(1);
    expect(y).toBeCloseTo(2);
  });

  it('round trips through the camera on and off the card plane', () => {
    for (const z of [0, 0.5, -1]) {
      const point = screenToPlane(stage, [100, 800], z);
      expect(point[2]).toBe(z);
      const [px, py] = worldToScreen(stage, point);
      expect(px).toBeCloseTo(100);
      expect(py).toBeCloseTo(800);
    }
  });

  it('shows nearer points farther from the centre', () => {
    const [near] = worldToScreen(stage, [1, 0, 1]);
    const [far] = worldToScreen(stage, [1, 0, 0]);
    expect(near).toBeGreaterThan(far);
  });
});

describe('clampToFrustum', () => {
  const stage = computeStage(desktop());
  const halfW = 720 / stage.pxPerUnit;
  const halfH = 450 / stage.pxPerUnit;
  const margin = 12 / stage.pxPerUnit;

  it('leaves points inside the visible hero alone', () => {
    expect(clampToFrustum(stage, [1, -1], 12)).toEqual([1, -1]);
  });

  it('keeps points inside the visible hero minus a margin', () => {
    const [x, y] = clampToFrustum(stage, [halfW * 3, -halfH * 3], 12);
    expect(x).toBeCloseTo(halfW - margin);
    expect(y).toBeCloseTo(-halfH + margin);
    const [x2, y2] = clampToFrustum(stage, [-halfW * 3, halfH * 3], 12);
    expect(x2).toBeCloseTo(-halfW + margin);
    expect(y2).toBeCloseTo(halfH - margin);
  });
});

describe('clientToNdc', () => {
  const rect = { left: 10, top: -200, width: 400, height: 300 };

  it('maps the element corners and centre', () => {
    expect(clientToNdc([10, -200], rect)).toEqual([-1, 1]);
    expect(clientToNdc([410, 100], rect)).toEqual([1, -1]);
    expect(clientToNdc([210, -50], rect)).toEqual([0, 0]);
  });
});
