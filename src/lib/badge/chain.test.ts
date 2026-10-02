import { describe, expect, it } from 'vitest';
import { chainLayout, chainSprings, segmentCount, spans } from './chain';

describe('spans', () => {
  it('links each node to its neighbours one, two and three links away', () => {
    expect(spans.map((s) => s.span)).toEqual([1, 2, 3]);
    expect(spans.map((s) => s.stiffness)).toEqual([0.6, 1, 0.45]);
  });
});

describe('chainSprings', () => {
  const springs = chainSprings(5, 0.5, 100, 1.4);

  it('connects every pair within three links once', () => {
    expect(springs.map((s) => [s.a, s.b])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [0, 2],
      [1, 3],
      [2, 4],
      [0, 3],
      [1, 4],
    ]);
  });

  it('rests at the span length with scaled stiffness and near critical damping', () => {
    const [near, , , , two, , , three] = springs;
    expect(near).toMatchObject({ rest: 0.5, stiffness: 60 });
    expect(near!.damping).toBeCloseTo(1.4 * Math.sqrt(60));
    expect(two).toMatchObject({ rest: 1, stiffness: 100 });
    expect(three!.rest).toBeCloseTo(1.5);
    expect(three!.stiffness).toBeCloseTo(45);
  });

  it('shortens every rest length by the rest scale', () => {
    const scaled = chainSprings(3, 0.5, 100, 1.4, 0.9);
    expect(scaled.map((s) => s.rest)).toEqual([0.45, 0.45, 0.9]);
  });

  it('rejects a chain without links', () => {
    expect(() => chainSprings(1, 0.5, 100, 1.4)).toThrow(RangeError);
  });
});

describe('segmentCount', () => {
  it('splits the strap into links close to the target length', () => {
    expect(segmentCount(2, 0.2)).toBe(10);
    expect(segmentCount(2.1, 0.2)).toBe(11);
  });

  it('keeps enough links for the three link springs', () => {
    expect(segmentCount(0.3, 0.2)).toBe(4);
  });
});

describe('chainLayout', () => {
  const base = {
    anchor: [1, 5] as [number, number],
    length: 2,
    segments: 4,
    stiffness: 90,
    dampingRatio: 1.4,
    linkMass: 0.02,
    endMass: 0.7,
    gravity: -9.8,
  };

  it('hangs the loaded end exactly one strap length below the anchor', () => {
    const { nodes } = chainLayout(base);
    expect(nodes).toHaveLength(5);
    expect(nodes[0]).toEqual([1, 5]);
    expect(nodes[4]![0]).toBe(1);
    expect(nodes[4]![1]).toBeCloseTo(3, 10);
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i]![1]).toBeLessThan(nodes[i - 1]![1]);
    }
  });

  it('shortens the springs so the stretch under load is cancelled', () => {
    const { restScale, segment } = chainLayout(base);
    expect(segment).toBe(0.5);
    expect(restScale).toBeLessThan(1);
    expect(restScale).toBeGreaterThan(0.9);
  });

  it('balances every node under gravity', () => {
    const { nodes, restScale } = chainLayout(base);
    const springs = chainSprings(5, 0.5, 90, 1.4, restScale);
    const force = nodes.map(() => 0);
    for (const s of springs) {
      const tension = s.stiffness * (nodes[s.a]![1] - nodes[s.b]![1] - s.rest);
      force[s.b]! += tension;
      force[s.a]! -= tension;
    }
    for (let i = 1; i < 4; i++) {
      expect(force[i]! + 0.02 * -9.8).toBeCloseTo(0, 8);
    }
    expect(force[4]! + 0.7 * -9.8).toBeCloseTo(0, 8);
  });

  it('needs no compensation without gravity', () => {
    const { nodes, restScale } = chainLayout({ ...base, gravity: 0 });
    expect(restScale).toBeCloseTo(1, 10);
    nodes.forEach(([, y], i) => expect(y).toBeCloseTo(5 - i * 0.5, 10));
  });
});
