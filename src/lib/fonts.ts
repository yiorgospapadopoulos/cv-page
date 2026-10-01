export interface FontFile {
  family: string;
  url: string;
  weight: string;
}

export const latinRanges: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x00ff],
  [0x0131, 0x0131],
  [0x0152, 0x0153],
  [0x02bb, 0x02bc],
  [0x02c6, 0x02c6],
  [0x02da, 0x02da],
  [0x02dc, 0x02dc],
  [0x0304, 0x0304],
  [0x0308, 0x0308],
  [0x0329, 0x0329],
  [0x2000, 0x206f],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
  [0x2191, 0x2191],
  [0x2193, 0x2193],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
  [0xfeff, 0xfeff],
  [0xfffd, 0xfffd],
];

const hex = (code: number) => code.toString(16).toUpperCase().padStart(4, '0');

export const latinUnicodeRange = latinRanges
  .map(([from, to]) =>
    from === to ? `U+${hex(from)}` : `U+${hex(from)}-${hex(to)}`,
  )
  .join(',');

export function isLatin(text: string): boolean {
  return [...text].every((char) => {
    const code = char.codePointAt(0) as number;
    return latinRanges.some(([from, to]) => code >= from && code <= to);
  });
}

export function fontFaceCss(files: FontFile[]): string {
  return files
    .map(
      ({ family, url, weight }) =>
        `@font-face {
  font-family: '${family}';
  font-style: normal;
  font-display: swap;
  font-weight: ${weight};
  src: url('${url}') format('woff2');
  unicode-range: ${latinUnicodeRange};
}`,
    )
    .join('\n');
}
