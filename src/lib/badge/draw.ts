import { cardPalette, type CardFace, type Measure } from './cardLayout';
import { strapLabel } from './strap';

export type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | 'font'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'textAlign'
  | 'textBaseline'
  | 'beginPath'
  | 'roundRect'
  | 'fill'
  | 'stroke'
  | 'fillRect'
  | 'fillText'
  | 'measureText'
> & { letterSpacing?: string };

export interface StrapTile {
  text: string;
  font: string;
  spacing: number;
  width: number;
  height: number;
  length: number;
  label: number;
  background: string;
  color: string;
}

function setSpacing(ctx: Ctx2D, value: number): void {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${value}px`;
}

export function canvasMeasure(ctx: Ctx2D): Measure {
  return (text, font, letterSpacing) => {
    ctx.font = font;
    const native = 'letterSpacing' in ctx;
    setSpacing(ctx, letterSpacing);
    const width = ctx.measureText(text).width;
    return native ? width : width + letterSpacing * text.length;
  };
}

// Fills every texel so filtering at the rounded edge never mixes in
// transparent black.
export function drawFace(ctx: Ctx2D, face: CardFace, borderWidth: number) {
  ctx.fillStyle = face.background;
  ctx.fillRect(0, 0, face.width, face.height);
  if (face.border !== null) {
    const inset = borderWidth / 2;
    ctx.beginPath();
    ctx.roundRect(
      inset,
      inset,
      face.width - borderWidth,
      face.height - borderWidth,
      face.radius - inset,
    );
    ctx.strokeStyle = face.border;
    ctx.lineWidth = borderWidth;
    ctx.stroke();
  }
  ctx.textBaseline = 'middle';
  for (const op of face.ops) {
    if (op.kind === 'rect') {
      ctx.beginPath();
      ctx.roundRect(op.x, op.y, op.width, op.height, op.radius);
      ctx.fillStyle = op.color;
      ctx.fill();
    } else {
      ctx.font = op.font;
      setSpacing(ctx, op.letterSpacing);
      ctx.fillStyle = op.color;
      ctx.textAlign = op.align;
      ctx.fillText(op.text, op.x, op.y);
    }
  }
}

export function strapTile(
  label: string,
  options: { band: number; scale: number; mono: string; measure: Measure },
): StrapTile {
  const text = strapLabel(label);
  const height = options.band * options.scale;
  const size = height / 2;
  const font = `400 ${size}px ${options.mono}`;
  const spacing = 0.04 * size;
  const width = Math.ceil(options.measure(text, font, spacing));
  return {
    text,
    font,
    spacing,
    width,
    height,
    length: width / options.scale,
    label: options.measure(label, font, spacing) / options.scale,
    background: cardPalette.strap,
    color: cardPalette.backMuted,
  };
}

export function drawStrapTile(ctx: Ctx2D, tile: StrapTile): void {
  ctx.fillStyle = tile.background;
  ctx.fillRect(0, 0, tile.width, tile.height);
  ctx.font = tile.font;
  setSpacing(ctx, tile.spacing);
  ctx.fillStyle = tile.color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(tile.text, 0, tile.height / 2);
}
