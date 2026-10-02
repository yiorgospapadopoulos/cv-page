import { describe, expect, it, vi } from 'vitest';
import {
  readBadgeEnv,
  wantsScrollTilt,
  wantsStaticBadge,
  type BadgeEnv,
} from './loadPolicy';

const desktop: BadgeEnv = {
  wide: true,
  saveData: false,
  effectiveType: '4g',
  reducedMotion: false,
  webgl: () => true,
};

describe('wantsStaticBadge', () => {
  it('loads the 3d badge on a desktop with a normal connection', () => {
    expect(wantsStaticBadge(desktop)).toBe(false);
    expect(wantsStaticBadge({ ...desktop, effectiveType: undefined })).toBe(
      false,
    );
  });

  it('stays static below the width breakpoint on any device', () => {
    expect(wantsStaticBadge({ ...desktop, wide: false })).toBe(true);
  });

  it('stays static when the user asks to save data', () => {
    expect(wantsStaticBadge({ ...desktop, saveData: true })).toBe(true);
  });

  it.each(['slow-2g', '2g'])(
    'stays static on an effective type of %s',
    (type) => {
      expect(wantsStaticBadge({ ...desktop, effectiveType: type })).toBe(true);
    },
  );

  it.each(['3g', '4g', undefined])(
    'does not stay static on an effective type of %s',
    (type) => {
      expect(wantsStaticBadge({ ...desktop, effectiveType: type })).toBe(false);
    },
  );

  it('stays static with reduced motion', () => {
    expect(wantsStaticBadge({ ...desktop, reducedMotion: true })).toBe(true);
  });

  it('stays static without webgl', () => {
    expect(wantsStaticBadge({ ...desktop, webgl: () => false })).toBe(true);
  });

  it('only probes webgl when nothing else has decided', () => {
    const webgl = vi.fn(() => true);
    for (const override of [
      { wide: false },
      { saveData: true },
      { effectiveType: '2g' },
      { reducedMotion: true },
    ]) {
      expect(wantsStaticBadge({ ...desktop, ...override, webgl })).toBe(true);
    }
    expect(webgl).not.toHaveBeenCalled();
    wantsStaticBadge({ ...desktop, webgl });
    expect(webgl).toHaveBeenCalledTimes(1);
  });
});

describe('wantsScrollTilt', () => {
  it('tilts below the width breakpoint without reduced motion', () => {
    const narrow = { ...desktop, wide: false };
    expect(wantsScrollTilt(narrow)).toBe(true);
    expect(wantsScrollTilt({ ...narrow, reducedMotion: true })).toBe(false);
    expect(wantsScrollTilt(desktop)).toBe(false);
  });

  it('keeps tilting on a narrow screen that saves data', () => {
    expect(wantsScrollTilt({ ...desktop, wide: false, saveData: true })).toBe(
      true,
    );
  });
});

describe('readBadgeEnv', () => {
  const win = (matching: string[], connection?: object) => ({
    navigator: { connection },
    matchMedia: (query: string) => ({ matches: matching.includes(query) }),
  });
  const webgl = () => true;

  it('reads the connection, width and motion preferences', () => {
    const env = readBadgeEnv(
      win(['(min-width: 860px)', '(prefers-reduced-motion: reduce)'], {
        saveData: true,
        effectiveType: '2g',
      }),
      webgl,
    );
    expect(env).toEqual({
      wide: true,
      saveData: true,
      effectiveType: '2g',
      reducedMotion: true,
      webgl,
    });
  });

  it('reads a narrow viewport without a connection api', () => {
    expect(readBadgeEnv(win([]), webgl)).toEqual({
      wide: false,
      saveData: false,
      effectiveType: undefined,
      reducedMotion: false,
      webgl,
    });
  });
});
