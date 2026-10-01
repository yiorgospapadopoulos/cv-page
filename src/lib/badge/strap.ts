export function strapLabel(
  text: string,
  copies = 1,
  separator = '  ·  ',
): string {
  if (copies < 1) throw new RangeError('copies must be at least 1');
  return `${text}${separator}`.repeat(copies);
}

export function strapRepeat(bandLength: number, tileLength: number): number {
  if (tileLength <= 0) throw new RangeError('tileLength must be positive');
  return Math.max(1, bandLength / tileLength);
}
