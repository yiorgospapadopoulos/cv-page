export const spans = [
  { span: 1, stiffness: 0.6 },
  { span: 2, stiffness: 1 },
  { span: 3, stiffness: 0.45 },
] as const;

export interface Spring {
  a: number;
  b: number;
  rest: number;
  stiffness: number;
  damping: number;
}

// Springs reaching past the next link give the strap bending stiffness, so it
// curves smoothly and stretches a little instead of snapping taut.
export function chainSprings(
  nodes: number,
  segment: number,
  stiffness: number,
  dampingRatio: number,
  restScale = 1,
): Spring[] {
  if (nodes < 2) throw new RangeError('a chain needs at least two nodes');
  const springs: Spring[] = [];
  for (const { span, stiffness: factor } of spans) {
    const k = stiffness * factor;
    for (let a = 0; a + span < nodes; a++) {
      springs.push({
        a,
        b: a + span,
        rest: segment * span * restScale,
        stiffness: k,
        damping: dampingRatio * Math.sqrt(k),
      });
    }
  }
  return springs;
}

export function segmentCount(length: number, target: number): number {
  return Math.max(spans.length + 1, Math.round(length / target));
}

function solve(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const a = matrix.map((row) => [...row]);
  const b = [...rhs];
  for (let col = 0; col < n; col++) {
    for (let row = col + 1; row < n; row++) {
      const f = a[row]![col]! / a[col]![col]!;
      for (let k = col; k < n; k++) a[row]![k]! -= f * a[col]![k]!;
      b[row]! -= f * b[col]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row]!;
    for (let k = row + 1; k < n; k++) sum -= a[row]![k]! * x[k]!;
    x[row] = sum / a[row]![row]!;
  }
  return x;
}

interface LayoutInput {
  anchor: [number, number];
  length: number;
  segments: number;
  stiffness: number;
  dampingRatio: number;
  linkMass: number;
  endMass: number;
  gravity: number;
}

// Static equilibrium of the hanging chain, with every rest length shortened by
// the same factor so the loaded end lands exactly one strap length down.
export function chainLayout(input: LayoutInput) {
  const { anchor, length, segments, gravity } = input;
  const segment = length / segments;
  const springs = chainSprings(
    segments + 1,
    segment,
    input.stiffness,
    input.dampingRatio,
  );
  const n = segments;
  const matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const rhs = Array.from(
    { length: n },
    (_, i) => -(i === n - 1 ? input.endMass : input.linkMass) * gravity,
  );
  for (const { a, b, stiffness: k } of springs) {
    // Unknowns are the sag of nodes 1..n relative to the unloaded rest layout.
    const ia = a - 1;
    const ib = b - 1;
    matrix[ib]![ib]! += k;
    if (ia >= 0) {
      matrix[ia]![ia]! += k;
      matrix[ia]![ib]! -= k;
      matrix[ib]![ia]! -= k;
    }
  }
  const sag = solve(matrix, rhs).map((s) => -s);
  const restScale = (length + sag[n - 1]!) / length;
  const [x, y] = anchor;
  const nodes: [number, number][] = [
    [x, y],
    ...sag.map((s, i): [number, number] => [
      x,
      y - restScale * segment * (i + 1) + s,
    ]),
  ];
  return { nodes, restScale, segment };
}
