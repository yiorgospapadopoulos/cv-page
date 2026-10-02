import { describe, expect, it } from 'vitest';
import {
  badgeHeadScript,
  dropsIn,
  nextBadgeState,
  revealAfterMs,
  signalBadge,
} from './entrance';
import { wantsStaticBadge, type BadgeEnv } from './loadPolicy';

interface Fake {
  wide?: boolean;
  reducedMotion?: boolean;
  connection?: object;
  webgl?: boolean;
}

function runHead(fake: Fake) {
  const root = { dataset: {} as Record<string, string> };
  const timers: Array<{ task: () => void; ms: number }> = [];
  const win: Record<string, unknown> = {
    matchMedia: (query: string) => ({
      matches:
        (query === '(min-width: 860px)' && fake.wide !== false) ||
        (query === '(prefers-reduced-motion: reduce)' &&
          fake.reducedMotion === true),
    }),
  };
  if (fake.webgl !== false) win.WebGLRenderingContext = function () {};
  const run = new Function(
    'window',
    'document',
    'navigator',
    'setTimeout',
    badgeHeadScript,
  ) as (...args: unknown[]) => void;
  run(
    win,
    { documentElement: root },
    { connection: fake.connection },
    (task: () => void, ms: number) => timers.push({ task, ms }),
  );
  return { root, timers };
}

describe('badgeHeadScript', () => {
  it('marks the 3d badge as pending on a capable wide screen', () => {
    const { root, timers } = runHead({});
    expect(root.dataset.badgeLoad).toBe('pending');
    expect(timers).toHaveLength(1);
    expect(timers[0]!.ms).toBe(revealAfterMs);
  });

  it('reveals the static badge when the 3d badge is still pending at the timeout', () => {
    const { root, timers } = runHead({});
    timers[0]!.task();
    expect(root.dataset.badgeLoad).toBe('static');
  });

  it('leaves a ready badge alone at the timeout', () => {
    const { root, timers } = runHead({});
    root.dataset.badgeLoad = 'ready';
    timers[0]!.task();
    expect(root.dataset.badgeLoad).toBe('ready');
  });

  it.each<[string, Fake]>([
    ['narrow', { wide: false }],
    ['reduced motion', { reducedMotion: true }],
    ['save-data', { connection: { saveData: true, effectiveType: '4g' } }],
    ['2g', { connection: { effectiveType: '2g' } }],
    ['slow-2g', { connection: { effectiveType: 'slow-2g' } }],
    ['no webgl', { webgl: false }],
  ])('marks nothing and sets no timer when %s', (_, fake) => {
    const { root, timers } = runHead(fake);
    expect(root.dataset.badgeLoad).toBeUndefined();
    expect(timers).toEqual([]);
  });

  it.each(['3g', '4g', undefined])(
    'still expects the 3d badge on an effective type of %s',
    (effectiveType) => {
      expect(
        runHead({ connection: { effectiveType } }).root.dataset.badgeLoad,
      ).toBe('pending');
    },
  );

  it('agrees with the load policy for every combination', () => {
    for (let bits = 0; bits < 64; bits++) {
      const on = (bit: number) => (bits & (1 << bit)) !== 0;
      const env: BadgeEnv = {
        wide: on(0),
        reducedMotion: on(1),
        saveData: on(2),
        effectiveType: on(3) ? '2g' : on(4) ? 'slow-2g' : '4g',
        webgl: () => on(5),
      };
      const { root } = runHead({
        wide: env.wide,
        reducedMotion: env.reducedMotion,
        connection: {
          saveData: env.saveData,
          effectiveType: env.effectiveType,
        },
        webgl: on(5),
      });
      expect(root.dataset.badgeLoad === 'pending').toBe(!wantsStaticBadge(env));
    }
  });
});

describe('nextBadgeState', () => {
  it('moves to ready or static on those signals from any state', () => {
    for (const state of [undefined, 'pending', 'static', 'ready']) {
      expect(nextBadgeState(state, 'ready')).toBe('ready');
      expect(nextBadgeState(state, 'static')).toBe('static');
    }
  });

  it('only turns a pending badge static on timeout', () => {
    expect(nextBadgeState('pending', 'timeout')).toBe('static');
    expect(nextBadgeState('ready', 'timeout')).toBe('ready');
    expect(nextBadgeState(undefined, 'timeout')).toBeUndefined();
  });
});

describe('signalBadge', () => {
  it('writes the next state to the root element', () => {
    const root = {
      dataset: { badgeLoad: 'pending' } as Record<string, string>,
    };
    signalBadge(root, 'ready');
    expect(root.dataset.badgeLoad).toBe('ready');
    signalBadge(root, 'static');
    expect(root.dataset.badgeLoad).toBe('static');
  });

  it('leaves an unset state unset on timeout', () => {
    const root = { dataset: {} as Record<string, string> };
    signalBadge(root, 'timeout');
    expect(root.dataset).toEqual({});
  });
});

describe('dropsIn', () => {
  it('drops the card in only while the 3d badge is pending', () => {
    expect(dropsIn({ dataset: { badgeLoad: 'pending' } })).toBe(true);
    for (const badge of ['static', 'ready']) {
      expect(dropsIn({ dataset: { badgeLoad: badge } })).toBe(false);
    }
    expect(dropsIn({ dataset: {} })).toBe(false);
  });
});

describe('revealAfterMs', () => {
  it('waits about six seconds before revealing the static badge', () => {
    expect(revealAfterMs).toBe(6000);
  });
});
