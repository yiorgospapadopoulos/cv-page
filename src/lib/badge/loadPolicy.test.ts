import { describe, expect, it } from 'vitest';
import { badgeLoadMode, readLoadEnv } from './loadPolicy';

describe('badgeLoadMode', () => {
  it('loads when idle on a fine pointer with a normal connection', () => {
    expect(badgeLoadMode({ coarsePointer: false })).toBe('idle');
    expect(
      badgeLoadMode({
        coarsePointer: false,
        connection: { saveData: false, effectiveType: '4g' },
      }),
    ).toBe('idle');
  });

  it('defers on a coarse pointer', () => {
    expect(badgeLoadMode({ coarsePointer: true })).toBe('deferred');
  });

  it('skips when the user asks to save data', () => {
    expect(
      badgeLoadMode({ coarsePointer: false, connection: { saveData: true } }),
    ).toBe('skip');
    expect(
      badgeLoadMode({ coarsePointer: true, connection: { saveData: true } }),
    ).toBe('skip');
  });

  it.each(['slow-2g', '2g'])('skips on an effective type of %s', (type) => {
    expect(
      badgeLoadMode({
        coarsePointer: false,
        connection: { effectiveType: type },
      }),
    ).toBe('skip');
  });

  it.each(['3g', '4g', undefined])(
    'does not skip on an effective type of %s',
    (type) => {
      expect(
        badgeLoadMode({
          coarsePointer: false,
          connection: { effectiveType: type },
        }),
      ).toBe('idle');
    },
  );
});

describe('readLoadEnv', () => {
  const win = (coarse: boolean, connection?: object) => ({
    navigator: { connection },
    matchMedia: (query: string) => ({
      matches: query === '(pointer: coarse)' && coarse,
    }),
  });

  it('reads the connection and the primary pointer', () => {
    const connection = { saveData: true, effectiveType: '2g' };
    expect(readLoadEnv(win(true, connection))).toEqual({
      connection,
      coarsePointer: true,
    });
    expect(readLoadEnv(win(false))).toEqual({
      connection: undefined,
      coarsePointer: false,
    });
  });
});
