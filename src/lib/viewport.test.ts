import { describe, expect, it } from 'vitest';
import { stableHeightScript, stableHeightVar } from './viewport';

function runHead(width: number, height: number) {
  const props = new Map<string, string>();
  const listeners = new Map<string, () => void>();
  const root = {
    clientWidth: width,
    clientHeight: height,
    style: {
      setProperty: (name: string, value: string) => props.set(name, value),
    },
  };
  const win = {
    addEventListener: (type: string, listener: () => void) =>
      listeners.set(type, listener),
  };
  const run = new Function('window', 'document', stableHeightScript) as (
    ...args: unknown[]
  ) => void;
  run(win, { documentElement: root });
  const resize = (w: number, h: number) => {
    root.clientWidth = w;
    root.clientHeight = h;
    listeners.get('resize')?.();
  };
  return { value: () => props.get(stableHeightVar), resize };
}

describe('stableHeightScript', () => {
  it('stores the viewport height in px at load', () => {
    const { value } = runHead(390, 664);
    expect(value()).toBe('664px');
  });

  it('ignores height-only changes such as a toolbar hiding', () => {
    const { value, resize } = runHead(390, 664);
    resize(390, 750);
    expect(value()).toBe('664px');
    resize(390, 600);
    expect(value()).toBe('664px');
  });

  it('measures again when the width changes', () => {
    const { value, resize } = runHead(390, 664);
    resize(844, 340);
    expect(value()).toBe('340px');
    resize(844, 390);
    expect(value()).toBe('340px');
    resize(390, 750);
    expect(value()).toBe('750px');
  });
});
