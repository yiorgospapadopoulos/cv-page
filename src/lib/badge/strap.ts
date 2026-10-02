export function strapLabel(
  text: string,
  copies = 1,
  separator = '  ·  ',
): string {
  if (copies < 1) throw new RangeError('copies must be at least 1');
  return `${text}${separator}`.repeat(copies);
}
