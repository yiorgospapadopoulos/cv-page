import type { Badge } from '../../content/types';

export type Measure = (
  text: string,
  font: string,
  letterSpacing: number,
) => number;

export type CardOp =
  | {
      kind: 'text';
      text: string;
      x: number;
      y: number;
      font: string;
      color: string;
      align: 'left' | 'right';
      letterSpacing: number;
    }
  | {
      kind: 'rect';
      x: number;
      y: number;
      width: number;
      height: number;
      radius: number;
      color: string;
    };

export interface CardFace {
  width: number;
  height: number;
  radius: number;
  background: string;
  border: string | null;
  ops: CardOp[];
}

export interface FaceOptions {
  measure: Measure;
  serif: string;
  mono: string;
  scale: number;
}

export const cardSize = { width: 220, height: 310, radius: 14 } as const;

export function mixWithWhite(hex: string, amount: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    throw new TypeError(`Expected a #rrggbb colour, got ${hex}`);
  }
  const channels = [1, 3, 5].map((i) => {
    const value = parseInt(hex.slice(i, i + 2), 16);
    const mixed = Math.round(value * amount + 255 * (1 - amount));
    return mixed.toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

export const cardPalette = {
  paper: '#ffffff',
  ink: '#111111',
  muted: '#6b6b6b',
  line: '#e6e4df',
  back: '#121212',
  backInk: '#7ee787',
  backMuted: '#8b949e',
  strap: '#141414',
  chips: [
    { fill: mixWithWhite('#0a66c2', 0.14), text: '#0a66c2' },
    { fill: mixWithWhite('#c2410c', 0.14), text: '#a63b08' },
    { fill: mixWithWhite('#7ee787', 0.3), text: '#1a6a2a' },
  ],
} as const;

export function splitAffiliation(text: string): {
  head: string;
  org?: string;
} {
  const at = text.indexOf(' @ ');
  if (at < 0) return { head: text };
  return { head: text.slice(0, at), org: text.slice(at + 3) };
}

// Everything from an at sign moves to the next line as one piece when it fits,
// like the nowrap span on the HTML card; otherwise only "@ word" stays joined.
function joinAffiliation(
  words: string[],
  maxWidth: number,
  width: (text: string) => number,
): string[] {
  const at = words.indexOf('@');
  if (at < 0 || at === words.length - 1) return words;
  const tail = words.slice(at).join(' ');
  if (width(tail) <= maxWidth) return [...words.slice(0, at), tail];
  return [...words.slice(0, at), `@ ${words[at + 1]}`, ...words.slice(at + 2)];
}

export function wrapText(
  text: string,
  maxWidth: number,
  width: (text: string) => number,
): string[] {
  const lines: string[] = [];
  let current = '';
  const words = joinAffiliation(
    text.split(/\s+/).filter(Boolean),
    maxWidth,
    width,
  );
  for (const word of words) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (current !== '' && width(candidate) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}

export function fitFontSize(
  lines: string[],
  size: number,
  maxWidth: number,
  widthAt: (line: string, size: number) => number,
  minSize: number,
): number {
  const widest = Math.max(...lines.map((line) => widthAt(line, size)));
  if (widest <= maxWidth) return size;
  return Math.max(minSize, (size * maxWidth) / widest);
}

function font(weight: number, size: number, family: string): string {
  return `${weight} ${size}px ${family}`;
}

export function layoutCardFront(
  badge: Pick<Badge, 'name' | 'role' | 'line' | 'chips' | 'pass'>,
  { measure, serif, mono, scale: s }: FaceOptions,
): CardFace {
  const width = cardSize.width * s;
  const height = cardSize.height * s;
  const padX = 18 * s;
  const inner = width - 2 * padX;
  const ops: CardOp[] = [];
  const text = (
    value: string,
    x: number,
    y: number,
    fontValue: string,
    color: string,
    letterSpacing = 0,
    align: 'left' | 'right' = 'left',
  ) => {
    ops.push({
      kind: 'text',
      text: value,
      x,
      y,
      font: fontValue,
      color,
      align,
      letterSpacing,
    });
  };

  let y = 20 * s;
  const nameLines = badge.name.split(/\s+/).filter(Boolean);
  const nameSize = fitFontSize(
    nameLines,
    28 * s,
    inner,
    (line, size) => measure(line, font(500, size, serif), -0.03 * size),
    14 * s,
  );
  const nameFont = font(500, nameSize, serif);
  for (const line of nameLines) {
    text(
      line,
      padX,
      y + nameSize / 2,
      nameFont,
      cardPalette.ink,
      -0.03 * nameSize,
    );
    y += nameSize;
  }

  const paragraphs = [
    {
      value: badge.role,
      gap: 18,
      size: 13,
      lh: 1.25,
      weight: 500,
      color: cardPalette.ink,
    },
    {
      value: badge.line,
      gap: 4,
      size: 12.8,
      lh: 1.3,
      weight: 400,
      color: cardPalette.muted,
    },
  ];
  for (const p of paragraphs) {
    y += p.gap * s;
    const size = p.size * s;
    const lineHeight = size * p.lh;
    const fontValue = font(p.weight, size, serif);
    for (const line of wrapText(p.value, inner, (t) =>
      measure(t, fontValue, 0),
    )) {
      text(line, padX, y + lineHeight / 2, fontValue, p.color);
      y += lineHeight;
    }
  }

  y += 16 * s;
  const chipSize = 11.52 * s;
  const chipFont = font(400, chipSize, serif);
  const pillHeight = chipSize * 1.5 + 4 * s;
  const chipPad = 9 * s;
  const gap = 6 * s;
  let x = padX;
  badge.chips.forEach((chip, i) => {
    const colours = cardPalette.chips[i % cardPalette.chips.length]!;
    const pillWidth = measure(chip, chipFont, 0) + 2 * chipPad;
    if (x > padX && x + pillWidth > width - padX) {
      x = padX;
      y += pillHeight + gap;
    }
    ops.push({
      kind: 'rect',
      x,
      y,
      width: pillWidth,
      height: pillHeight,
      radius: pillHeight / 2,
      color: colours.fill,
    });
    text(chip, x + chipPad, y + pillHeight / 2, chipFont, colours.text);
    x += pillWidth + gap;
  });

  const passSize = 8.8 * s;
  text(
    badge.pass,
    width - padX,
    height - 16 * s - (passSize * 1.5) / 2,
    font(400, passSize, mono),
    cardPalette.muted,
    0.04 * passSize,
    'right',
  );

  return {
    width,
    height,
    radius: cardSize.radius * s,
    background: cardPalette.paper,
    border: cardPalette.line,
    ops,
  };
}

export function layoutCardBack(
  back: { prompt: string; url: string },
  { measure, mono, scale: s }: FaceOptions,
): CardFace {
  const width = cardSize.width * s;
  const height = cardSize.height * s;
  const padX = 18 * s;
  const inner = width - 2 * padX;
  const minSize = 4 * s;

  const promptSize = fitFontSize(
    [back.prompt],
    12 * s,
    inner,
    (line, size) => measure(line, font(500, size, mono), 0) + 0.85 * size,
    minSize,
  );
  const promptFont = font(500, promptSize, mono);
  const promptY = 24 * s + (promptSize * 1.5) / 2;
  const promptWidth = measure(back.prompt, promptFont, 0);

  const urlSize = fitFontSize(
    [back.url],
    9 * s,
    inner,
    (line, size) => measure(line, font(400, size, mono), 0.04 * size),
    minSize,
  );

  return {
    width,
    height,
    radius: cardSize.radius * s,
    background: cardPalette.back,
    border: null,
    ops: [
      {
        kind: 'text',
        text: back.prompt,
        x: padX,
        y: promptY,
        font: promptFont,
        color: cardPalette.backInk,
        align: 'left',
        letterSpacing: 0,
      },
      {
        kind: 'rect',
        x: padX + promptWidth + 0.3 * promptSize,
        y: promptY - 0.6 * promptSize,
        width: 0.55 * promptSize,
        height: 1.2 * promptSize,
        radius: 0,
        color: cardPalette.backInk,
      },
      {
        kind: 'text',
        text: back.url,
        x: padX,
        y: height - 16 * s - (urlSize * 1.5) / 2,
        font: font(400, urlSize, mono),
        color: cardPalette.backMuted,
        align: 'left',
        letterSpacing: 0.04 * urlSize,
      },
    ],
  };
}
