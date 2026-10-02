import { describe, expect, it } from 'vitest';
import { dropAnchor, dropEase, dropLift, liftNodes } from './drop';
import type { Stage } from './stage';

const stage: Stage = {
  width: 1440,
  height: 900,
  pxPerUnit: 180,
  anchor: [0.4, 3.2],
  ropeLength: 1.9,
  strapVisible: 218,
  clipGap: 0.2,
  bandWidth: 0.1,
  card: { width: 1.6, height: 2.25 },
  cameraZ: 13,
  fov: 22,
};

describe('dropEase', () => {
  it('runs from 0 to 1 and holds at both ends', () => {
    expect(dropEase(-1)).toBe(0);
    expect(dropEase(0)).toBe(0);
    expect(dropEase(1)).toBe(1);
    expect(dropEase(2)).toBe(1);
  });

  it('starts and ends with zero speed', () => {
    const h = 1e-4;
    expect(dropEase(h) / h).toBeLessThan(0.01);
    expect((1 - dropEase(1 - h)) / h).toBeLessThan(0.01);
  });

  it('only moves forward', () => {
    let last = 0;
    for (let u = 0.05; u <= 1; u += 0.05) {
      const next = dropEase(u);
      expect(next).toBeGreaterThan(last);
      last = next;
    }
  });
});

describe('dropLift', () => {
  it('raises the card until its bottom clears the top of the view by the margin', () => {
    const restBottom = -1;
    const lift = dropLift(stage, restBottom, 36);
    const top = stage.height / 2 / stage.pxPerUnit;
    expect(restBottom + lift).toBeCloseTo(top + 36 / stage.pxPerUnit);
  });

  it('never lowers the card', () => {
    expect(dropLift(stage, 10, 0)).toBe(0);
  });
});

describe('dropAnchor', () => {
  const anchor: [number, number] = [0.4, 3.2];
  const offset: [number, number] = [0.5, 4];

  it('starts at the lifted anchor and ends at the rest anchor', () => {
    expect(dropAnchor(0, anchor, offset, 1.5)).toEqual([0.9, 7.2]);
    const end = dropAnchor(1.5, anchor, offset, 1.5);
    expect(end[0]).toBeCloseTo(0.4);
    expect(end[1]).toBeCloseTo(3.2);
    expect(dropAnchor(9, anchor, offset, 1.5)).toEqual(end);
  });

  it('moves down and across together', () => {
    const [x, y] = dropAnchor(0.75, anchor, offset, 1.5);
    expect((x - 0.4) / 0.5).toBeCloseTo((y - 3.2) / 4);
    expect(y).toBeLessThan(7.2);
    expect(y).toBeGreaterThan(3.2);
  });

  it('is already at rest without a duration', () => {
    expect(dropAnchor(0, anchor, offset, 0)).toEqual([0.4, 3.2]);
  });
});

describe('liftNodes', () => {
  it('moves every node by the offset', () => {
    expect(
      liftNodes(
        [
          [0, 1],
          [0, 0],
        ],
        [0.5, 2],
      ),
    ).toEqual([
      [0.5, 3],
      [0.5, 2],
    ]);
  });
});
