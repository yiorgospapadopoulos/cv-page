import { describe, expect, it } from 'vitest';
import type { CardFace } from './cardLayout';
import {
  canvasMeasure,
  drawFace,
  drawStrapTile,
  strapTile,
  type Ctx2D,
} from './draw';

function recorder(options: { letterSpacing?: boolean } = {}) {
  const calls: string[] = [];
  const ctx = {
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    textAlign: 'start',
    textBaseline: 'alphabetic',
    beginPath: () => calls.push('beginPath'),
    roundRect: (x: number, y: number, w: number, h: number, r: number) =>
      calls.push(`roundRect ${x} ${y} ${w} ${h} ${r}`),
    fill: () => calls.push(`fill ${ctx.fillStyle}`),
    stroke: () => calls.push(`stroke ${ctx.strokeStyle} ${ctx.lineWidth}`),
    fillRect: (x: number, y: number, w: number, h: number) =>
      calls.push(`fillRect ${ctx.fillStyle} ${x} ${y} ${w} ${h}`),
    fillText: (text: string, x: number, y: number) =>
      calls.push(
        `fillText ${text} ${x} ${y} ${ctx.font} ${ctx.fillStyle} ${ctx.textAlign} ${ctx.textBaseline} ${ctx.letterSpacing ?? '-'}`,
      ),
    measureText: (text: string) => ({ width: text.length * 10 }),
  } as unknown as Ctx2D;
  if (options.letterSpacing !== false) ctx.letterSpacing = '0px';
  return { ctx, calls };
}

const face: CardFace = {
  width: 100,
  height: 140,
  radius: 8,
  background: '#ffffff',
  border: '#eeeeee',
  ops: [
    {
      kind: 'rect',
      x: 10,
      y: 20,
      width: 30,
      height: 10,
      radius: 5,
      color: '#ff0000',
    },
    {
      kind: 'text',
      text: 'Hi',
      x: 90,
      y: 50,
      font: '400 12px Mono',
      color: '#111111',
      align: 'right',
      letterSpacing: 1,
    },
  ],
};

describe('drawFace', () => {
  it('fills the whole texture, then paints the border and every op in order', () => {
    const { ctx, calls } = recorder();
    drawFace(ctx, face, 2);
    expect(calls).toEqual([
      'fillRect #ffffff 0 0 100 140',
      'beginPath',
      'roundRect 1 1 98 138 7',
      'stroke #eeeeee 2',
      'beginPath',
      'roundRect 10 20 30 10 5',
      'fill #ff0000',
      'fillText Hi 90 50 400 12px Mono #111111 right middle 1px',
    ]);
  });

  it('skips the border when there is none', () => {
    const { ctx, calls } = recorder();
    drawFace(ctx, { ...face, border: null, ops: [] }, 2);
    expect(calls).toEqual(['fillRect #ffffff 0 0 100 140']);
  });
});

describe('canvasMeasure', () => {
  it('uses native letter spacing when the canvas supports it', () => {
    const { ctx } = recorder();
    const measure = canvasMeasure(ctx);
    expect(measure('abc', '400 10px Serif', 2)).toBe(30);
    expect(ctx.font).toBe('400 10px Serif');
    expect(ctx.letterSpacing).toBe('2px');
  });

  it('adds the spacing itself when the canvas does not', () => {
    const { ctx } = recorder({ letterSpacing: false });
    expect(canvasMeasure(ctx)('abc', '400 10px Serif', 2)).toBe(36);
  });
});

describe('strapTile', () => {
  it('sizes one label to the band at the given scale', () => {
    const tile = strapTile('abc', {
      band: 16,
      scale: 4,
      mono: 'Mono',
      measure: (text, _font, spacing) => text.length * (10 + spacing),
    });
    expect(tile.height).toBe(64);
    expect(tile.font).toBe('400 32px Mono');
    expect(tile.spacing).toBeCloseTo(1.28);
    expect(tile.width).toBe(Math.ceil('abc  ·  '.length * 11.28));
    expect(tile.length).toBe(tile.width / 4);
    expect(tile.label).toBeCloseTo((3 * 11.28) / 4);
    expect(tile.text).toBe('abc  ·  ');
  });
});

describe('drawStrapTile', () => {
  it('fills the band colour and writes the label centred vertically', () => {
    const { ctx, calls } = recorder();
    drawStrapTile(ctx, {
      text: 'abc  ·  ',
      font: '400 32px Mono',
      spacing: 1.28,
      width: 80,
      height: 64,
      length: 20,
      label: 8,
      background: '#141414',
      color: '#8b949e',
    });
    expect(calls).toEqual([
      'fillRect #141414 0 0 80 64',
      'fillText abc  ·   0 32 400 32px Mono #8b949e left middle 1.28px',
    ]);
  });
});
