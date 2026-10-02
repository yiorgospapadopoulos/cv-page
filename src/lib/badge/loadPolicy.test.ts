import { describe, expect, it, vi } from 'vitest';
import {
  readBadgeEnv,
  wantsScrollSway,
  wantsStaticBadge,
  type BadgeEnv,
} from './loadPolicy';

const desktop: BadgeEnv = {
  coarse: false,
  hoverNone: false,
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

  it('stays static when the primary pointer is coarse and cannot hover', () => {
    expect(
      wantsStaticBadge({ ...desktop, coarse: true, hoverNone: true }),
    ).toBe(true);
  });

  it('keeps the 3d badge when a touch screen also has a mouse', () => {
    expect(wantsStaticBadge({ ...desktop, coarse: true })).toBe(false);
    expect(wantsStaticBadge({ ...desktop, hoverNone: true })).toBe(false);
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
      { coarse: true, hoverNone: true },
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

describe('wantsScrollSway', () => {
  it('sways only on touch-first devices without reduced motion', () => {
    const touch = { ...desktop, coarse: true, hoverNone: true };
    expect(wantsScrollSway(touch)).toBe(true);
    expect(wantsScrollSway({ ...touch, reducedMotion: true })).toBe(false);
    expect(wantsScrollSway(desktop)).toBe(false);
    expect(wantsScrollSway({ ...desktop, coarse: true })).toBe(false);
  });

  it('keeps swaying on a touch device that saves data', () => {
    expect(
      wantsScrollSway({
        ...desktop,
        coarse: true,
        hoverNone: true,
        saveData: true,
      }),
    ).toBe(true);
  });
});

describe('readBadgeEnv', () => {
  const win = (matching: string[], connection?: object) => ({
    navigator: { connection },
    matchMedia: (query: string) => ({ matches: matching.includes(query) }),
  });
  const webgl = () => true;

  it('reads the connection, pointer, hover and motion preferences', () => {
    const env = readBadgeEnv(
      win(
        [
          '(pointer: coarse)',
          '(hover: none)',
          '(prefers-reduced-motion: reduce)',
        ],
        { saveData: true, effectiveType: '2g' },
      ),
      webgl,
    );
    expect(env).toEqual({
      coarse: true,
      hoverNone: true,
      saveData: true,
      effectiveType: '2g',
      reducedMotion: true,
      webgl,
    });
  });

  it('defaults to a desktop without a connection api', () => {
    expect(readBadgeEnv(win([]), webgl)).toEqual({
      coarse: false,
      hoverNone: false,
      saveData: false,
      effectiveType: undefined,
      reducedMotion: false,
      webgl,
    });
  });
});
