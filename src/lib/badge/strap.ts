export function strapLabel(
  text: string,
  copies = 1,
  separator = '  ·  ',
): string {
  if (copies < 1) throw new RangeError('copies must be at least 1');
  return `${text}${separator}`.repeat(copies);
}

// Texture phase that centres one label copy on the part of the strap seen
// between the top edge and the clip, matching the placeholder.
export function labelPhase(
  visible: number,
  label: number,
  tile: number,
): number {
  return (visible + label) / (2 * tile);
}

type Point = [number, number];

// Screen length of the strap from the clip (last point) up to `top`.
export function visibleArc(points: Point[], top: number): number {
  let arc = 0;
  for (let i = points.length - 1; i > 0; i--) {
    const [x1, y1] = points[i]!;
    const [x0, y0] = points[i - 1]!;
    const length = Math.hypot(x1 - x0, y1 - y0);
    if (y0 < top) return arc + (length * (y1 - top)) / (y1 - y0);
    arc += length;
  }
  return arc;
}

// Distance along the strap from the clip to the point with coordinate `u`;
// coordinates rise toward the clip.
export function arcAt(points: Point[], us: number[], u: number): number {
  let arc = 0;
  for (let i = points.length - 1; i > 0; i--) {
    const [x1, y1] = points[i]!;
    const [x0, y0] = points[i - 1]!;
    const length = Math.hypot(x1 - x0, y1 - y0);
    if (u <= us[i]! && u >= us[i - 1]!) {
      return arc + (length * (us[i]! - u)) / (us[i]! - us[i - 1]!);
    }
    arc += length;
  }
  return Infinity;
}
