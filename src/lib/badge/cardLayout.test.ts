import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { profile } from '../../content/profile';
import { promptText } from '../terminal';
import {
  cardPalette,
  cardSize,
  fitFontSize,
  layoutCardBack,
  layoutCardFront,
  mixWithWhite,
  wrapText,
  type CardOp,
  type Measure,
} from './cardLayout';

const tokens = readFileSync('src/styles/tokens.css', 'utf8');
const placeholder = readFileSync(
  'src/components/BadgePlaceholder.astro',
  'utf8',
);

function token(name: string): string {
  const match = new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(tokens);
  if (match === null) throw new Error(`Missing token ${name}`);
  return match[1]!.toLowerCase();
}

function sizeOf(font: string): number {
  return Number(/([\d.]+)px/.exec(font)![1]);
}

const measure: Measure = (text, font, letterSpacing) =>
  text.length * (sizeOf(font) * 0.5 + letterSpacing);

const options = { measure, serif: 'Serif', mono: 'Mono', scale: 4 };

type TextOp = Extract<CardOp, { kind: 'text' }>;
type RectOp = Extract<CardOp, { kind: 'rect' }>;

function texts(ops: CardOp[]): TextOp[] {
  return ops.filter((op): op is TextOp => op.kind === 'text');
}

function rects(ops: CardOp[]): RectOp[] {
  return ops.filter((op): op is RectOp => op.kind === 'rect');
}

function find(ops: CardOp[], text: string): TextOp {
  const op = texts(ops).find((candidate) => candidate.text === text);
  if (op === undefined) throw new Error(`Missing text ${text}`);
  return op;
}

describe('mixWithWhite', () => {
  it('matches css color-mix with white', () => {
    expect(mixWithWhite('#0a66c2', 0.14)).toBe('#ddeaf6');
  });

  it('keeps the colour at full strength and gives white at zero', () => {
    expect(mixWithWhite('#123456', 1)).toBe('#123456');
    expect(mixWithWhite('#123456', 0)).toBe('#ffffff');
  });

  it('rejects anything but a six digit hex colour', () => {
    expect(() => mixWithWhite('red', 0.5)).toThrow(TypeError);
  });
});

describe('cardPalette', () => {
  it('matches the design tokens', () => {
    expect(cardPalette.paper).toBe(token('--paper'));
    expect(cardPalette.ink).toBe(token('--ink'));
    expect(cardPalette.muted).toBe(token('--ink-muted'));
    expect(cardPalette.line).toBe(token('--line'));
    expect(cardPalette.backInk).toBe(token('--term-prompt'));
    expect(cardPalette.backMuted).toBe(token('--term-muted'));
    expect(cardPalette.back).toBe(token('--term-bg'));
  });

  it('matches the placeholder chip colours', () => {
    const [first, second, third] = cardPalette.chips;
    expect(first).toEqual({
      fill: mixWithWhite(token('--link-linkedin'), 0.14),
      text: token('--link-linkedin'),
    });
    expect(second!.fill).toBe(mixWithWhite(token('--link-email'), 0.14));
    expect(third!.fill).toBe(mixWithWhite(token('--term-prompt'), 0.3));
    expect(placeholder).toContain(`color: ${second!.text};`);
    expect(placeholder).toContain(`color: ${third!.text};`);
  });

  it('matches the placeholder card size', () => {
    expect(placeholder).toContain(`width: ${cardSize.width}px;`);
    expect(placeholder).toContain(`height: ${cardSize.height}px;`);
    expect(placeholder).toContain(`border-radius: ${cardSize.radius}px;`);
  });
});

describe('wrapText', () => {
  const width = (text: string) => text.length * 10;

  it('keeps short text on one line', () => {
    expect(wrapText('one two', 100, width)).toEqual(['one two']);
  });

  it('breaks between words to fit the width', () => {
    expect(wrapText('one two three four', 90, width)).toEqual([
      'one two',
      'three',
      'four',
    ]);
  });

  it('keeps a word that is too long on its own line', () => {
    expect(wrapText('a enormousword b', 50, width)).toEqual([
      'a',
      'enormousword',
      'b',
    ]);
  });

  it('collapses extra whitespace and returns nothing for blank text', () => {
    expect(wrapText('  a   b ', 100, width)).toEqual(['a b']);
    expect(wrapText('   ', 100, width)).toEqual([]);
  });
});

describe('fitFontSize', () => {
  const widthAt = (line: string, size: number) => line.length * size;

  it('keeps the size when every line fits', () => {
    expect(fitFontSize(['abc', 'de'], 10, 40, widthAt, 5)).toBe(10);
  });

  it('shrinks so the widest line fits', () => {
    expect(fitFontSize(['abcd', 'ab'], 10, 20, widthAt, 2)).toBe(5);
  });

  it('never goes below the minimum', () => {
    expect(fitFontSize(['abcdefghij'], 10, 10, widthAt, 4)).toBe(4);
  });
});

describe('layoutCardFront', () => {
  const { badge } = profile;
  const face = layoutCardFront(badge, options);
  const pad = 18 * options.scale;

  it('is the placeholder card at the requested scale', () => {
    expect(face.width).toBe(cardSize.width * 4);
    expect(face.height).toBe(cardSize.height * 4);
    expect(face.height).toBeGreaterThanOrEqual(1024);
    expect(face.radius).toBe(cardSize.radius * 4);
    expect(face.background).toBe(cardPalette.paper);
    expect(face.border).toBe(cardPalette.line);
  });

  it('puts the name on two serif lines at the top left', () => {
    const [first, second] = badge.name.split(' ');
    const a = find(face.ops, first!);
    const b = find(face.ops, second!);
    expect(a.x).toBe(pad);
    expect(a.align).toBe('left');
    expect(a.font).toBe('500 112px Serif');
    expect(a.letterSpacing).toBeCloseTo(-0.03 * 112);
    expect(b.y - a.y).toBeCloseTo(112);
    expect(a.color).toBe(cardPalette.ink);
  });

  it('shrinks a name line that would overflow the card', () => {
    const long = layoutCardFront(
      { ...badge, name: 'Abcdefghijklmnopq Short' },
      options,
    );
    const line = find(long.ops, 'Abcdefghijklmnopq');
    expect(sizeOf(line.font)).toBeLessThan(112);
    expect(
      measure(line.text, line.font, line.letterSpacing),
    ).toBeLessThanOrEqual(face.width - 2 * pad + 0.001);
  });

  it('places the role below the name and the muted line below the role', () => {
    const lastName = find(face.ops, badge.name.split(' ').at(-1)!);
    const roleOps = texts(face.ops).filter((op) =>
      op.font.startsWith('500 57.6px'),
    );
    expect(roleOps.map((op) => op.text).join(' ')).toBe(badge.role);
    expect(roleOps[0]!.y).toBeGreaterThan(lastName.y);
    const lineOps = texts(face.ops).filter(
      (op) => op.color === cardPalette.muted && op.font.includes('Serif'),
    );
    expect(lineOps.map((op) => op.text).join(' ')).toBe(badge.line);
    expect(lineOps[0]!.y).toBeGreaterThan(roleOps.at(-1)!.y);
  });

  it('wraps every text line inside the padding', () => {
    for (const op of texts(face.ops)) {
      const width = measure(op.text, op.font, op.letterSpacing);
      const left = op.align === 'left' ? op.x : op.x - width;
      expect(left).toBeGreaterThanOrEqual(pad - 0.001);
      expect(left + width).toBeLessThanOrEqual(face.width - pad + 0.001);
    }
  });

  it('draws one coloured pill per chip with its label centred', () => {
    const pills = rects(face.ops);
    expect(pills).toHaveLength(badge.chips.length);
    badge.chips.forEach((chip, i) => {
      const pill = pills[i]!;
      const label = find(face.ops, chip);
      const colours = cardPalette.chips[i % 3]!;
      expect(pill.color).toBe(colours.fill);
      expect(label.color).toBe(colours.text);
      expect(pill.radius).toBe(pill.height / 2);
      expect(label.x).toBe(pill.x + 9 * options.scale);
      expect(label.y).toBeCloseTo(pill.y + pill.height / 2);
    });
    expect(pills[1]!.x).toBeCloseTo(
      pills[0]!.x + pills[0]!.width + 6 * options.scale,
    );
  });

  it('wraps chips onto a new row when they run out of room', () => {
    const many = layoutCardFront(
      { ...badge, chips: ['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc', 'd'] },
      options,
    );
    const pills = rects(many.ops);
    expect(pills[0]!.y).toBe(pills[1]!.y);
    const wrapped = pills[2]!;
    expect(wrapped.y).toBeGreaterThan(pills[0]!.y);
    expect(wrapped.x).toBe(pad);
    expect(pills[3]!.y).toBe(wrapped.y);
    for (const pill of pills) {
      expect(pill.x + pill.width).toBeLessThanOrEqual(many.width - pad + 0.001);
    }
  });

  it('puts the pass in mono at the bottom right', () => {
    const pass = find(face.ops, badge.pass);
    expect(pass.align).toBe('right');
    expect(pass.x).toBe(face.width - pad);
    expect(pass.font).toContain('Mono');
    expect(pass.y).toBeGreaterThan(face.height * 0.9);
    expect(pass.y).toBeLessThan(face.height);
    const lowestPill = Math.max(...rects(face.ops).map((p) => p.y + p.height));
    expect(pass.y).toBeGreaterThan(lowestPill);
  });
});

describe('layoutCardBack', () => {
  const back = layoutCardBack(
    { prompt: promptText, url: profile.badge.strap },
    options,
  );

  it('is a dark card the same size as the front', () => {
    expect(back.width).toBe(cardSize.width * 4);
    expect(back.height).toBe(cardSize.height * 4);
    expect(back.background).toBe(cardPalette.back);
    expect(back.border).toBeNull();
  });

  it('shows the prompt with a cursor and the url in mono', () => {
    const prompt = find(back.ops, promptText);
    const url = find(back.ops, profile.badge.strap);
    expect(prompt.font).toContain('Mono');
    expect(prompt.color).toBe(cardPalette.backInk);
    expect(url.font).toContain('Mono');
    expect(url.color).toBe(cardPalette.backMuted);
    expect(url.y).toBeGreaterThan(prompt.y);
    const [cursor] = rects(back.ops);
    expect(cursor!.x).toBeGreaterThan(prompt.x);
    expect(cursor!.color).toBe(cardPalette.backInk);
  });

  it('fits long text inside the padding', () => {
    const wide = layoutCardBack(
      { prompt: 'x'.repeat(80), url: 'y'.repeat(80) },
      options,
    );
    const pad = 18 * options.scale;
    for (const op of texts(wide.ops)) {
      expect(op.x + measure(op.text, op.font, op.letterSpacing)).toBeLessThan(
        wide.width - pad + 0.001,
      );
    }
    const [cursor] = rects(wide.ops);
    expect(cursor!.x + cursor!.width).toBeLessThanOrEqual(wide.width - pad);
  });
});
