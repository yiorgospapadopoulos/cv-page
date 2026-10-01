import { describe, expect, it, vi } from 'vitest';
import {
  browserDeferDeps,
  deferBadgeLoad,
  touchDeferMs,
  whenIdle,
  type DeferDeps,
  type DeferWindow,
} from './deferral';

function fakeDeps() {
  const log: string[] = [];
  let loaded: (() => void) | undefined;
  let visible: ((visible: boolean) => void) | undefined;
  let timer: (() => void) | undefined;
  let idle: (() => void) | undefined;
  const cancels = {
    load: vi.fn(),
    watch: vi.fn(),
    timer: vi.fn(),
    idle: vi.fn(),
  };
  const deps: DeferDeps = {
    afterLoad(run) {
      loaded = run;
      return cancels.load;
    },
    watchVisible(onChange) {
      visible = onChange;
      return cancels.watch;
    },
    startTimer(task, ms) {
      log.push(`timer ${ms}`);
      timer = task;
      return cancels.timer;
    },
    whenIdle(task) {
      log.push('idle');
      idle = task;
      return cancels.idle;
    },
  };
  return {
    deps,
    log,
    cancels,
    fireLoad: () => loaded?.(),
    setVisible: (value: boolean) => visible?.(value),
    fireTimer: () => timer?.(),
    fireIdle: () => idle?.(),
  };
}

describe('deferBadgeLoad', () => {
  it('uses a delay of about a second and a half', () => {
    expect(touchDeferMs).toBe(1500);
  });

  it('waits for load, visibility, the delay and an idle moment, in order', () => {
    const h = fakeDeps();
    const task = vi.fn();
    deferBadgeLoad(h.deps, task);

    h.setVisible(true);
    expect(h.log).toEqual([]);

    h.fireLoad();
    expect(h.log).toEqual([]);
    h.setVisible(true);
    expect(h.log).toEqual(['timer 1500']);
    expect(task).not.toHaveBeenCalled();

    h.fireTimer();
    expect(h.cancels.watch).toHaveBeenCalledTimes(1);
    expect(h.log).toEqual(['timer 1500', 'idle']);
    expect(task).not.toHaveBeenCalled();

    h.fireIdle();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('accepts a custom delay', () => {
    const h = fakeDeps();
    deferBadgeLoad(h.deps, vi.fn(), 400);
    h.fireLoad();
    h.setVisible(true);
    expect(h.log).toEqual(['timer 400']);
  });

  it('restarts the delay when the hero leaves and re-enters the view', () => {
    const h = fakeDeps();
    deferBadgeLoad(h.deps, vi.fn());
    h.fireLoad();
    h.setVisible(true);
    h.setVisible(false);
    expect(h.cancels.timer).toHaveBeenCalledTimes(1);
    h.setVisible(false);
    h.setVisible(true);
    expect(h.log).toEqual(['timer 1500', 'timer 1500']);
  });

  it('cancels everything that is still pending', () => {
    const h = fakeDeps();
    const cancel = deferBadgeLoad(h.deps, vi.fn());
    h.fireLoad();
    h.setVisible(true);
    h.fireTimer();
    cancel();
    expect(h.cancels.load).toHaveBeenCalledTimes(1);
    expect(h.cancels.watch).toHaveBeenCalledTimes(2);
    expect(h.cancels.timer).toHaveBeenCalledTimes(1);
    expect(h.cancels.idle).toHaveBeenCalledTimes(1);
  });

  it('can be cancelled before the page has loaded', () => {
    const h = fakeDeps();
    const task = vi.fn();
    const cancel = deferBadgeLoad(h.deps, task);
    cancel();
    expect(h.cancels.load).toHaveBeenCalledTimes(1);
    expect(task).not.toHaveBeenCalled();
  });
});

describe('whenIdle', () => {
  it('uses requestIdleCallback with a timeout when available', () => {
    const task = vi.fn();
    const requestIdleCallback = vi.fn(() => 7);
    const cancelIdleCallback = vi.fn();
    const cancel = whenIdle(
      { requestIdleCallback, cancelIdleCallback } as unknown as DeferWindow,
      task,
    );
    expect(requestIdleCallback).toHaveBeenCalledWith(task, { timeout: 1500 });
    cancel();
    expect(cancelIdleCallback).toHaveBeenCalledWith(7);
  });

  it('falls back to a short timer', () => {
    const task = vi.fn();
    const setTimeout = vi.fn(() => 9);
    const clearTimeout = vi.fn();
    const cancel = whenIdle(
      { setTimeout, clearTimeout } as unknown as DeferWindow,
      task,
    );
    expect(setTimeout).toHaveBeenCalledWith(task, 200);
    cancel();
    expect(clearTimeout).toHaveBeenCalledWith(9);
  });
});

describe('browserDeferDeps', () => {
  function fakeWindow(readyState: string) {
    const listeners = new Map<string, () => void>();
    const observers: Array<{
      callback: (entries: Array<{ isIntersecting: boolean }>) => void;
      observe: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    }> = [];
    class Observer {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(
        public callback: (entries: Array<{ isIntersecting: boolean }>) => void,
      ) {
        observers.push(this);
      }
    }
    const win = {
      document: { readyState },
      addEventListener: vi.fn((type: string, listener: () => void) =>
        listeners.set(type, listener),
      ),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
      IntersectionObserver: Observer,
      setTimeout: vi.fn(() => 3),
      clearTimeout: vi.fn(),
    };
    return {
      win: win as unknown as DeferWindow,
      raw: win,
      listeners,
      observers,
    };
  }

  it('runs at once when the page has already loaded', () => {
    const { win, raw } = fakeWindow('complete');
    const run = vi.fn();
    const cancel = browserDeferDeps(win, {} as Element).afterLoad(run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(raw.addEventListener).not.toHaveBeenCalled();
    cancel();
    expect(raw.removeEventListener).not.toHaveBeenCalled();
  });

  it('waits for the load event otherwise, and can stop waiting', () => {
    const { win, raw, listeners } = fakeWindow('loading');
    const run = vi.fn();
    const cancel = browserDeferDeps(win, {} as Element).afterLoad(run);
    expect(run).not.toHaveBeenCalled();
    listeners.get('load')!();
    expect(run).toHaveBeenCalledTimes(1);
    cancel();
    expect(raw.removeEventListener).toHaveBeenCalledWith(
      'load',
      expect.any(Function),
    );
  });

  it('reports hero visibility from an IntersectionObserver', () => {
    const { win, observers } = fakeWindow('complete');
    const hero = {} as Element;
    const seen: boolean[] = [];
    const stop = browserDeferDeps(win, hero).watchVisible((v) => seen.push(v));
    const [observer] = observers;
    expect(observer!.observe).toHaveBeenCalledWith(hero);
    observer!.callback([{ isIntersecting: true }]);
    observer!.callback([{ isIntersecting: false }]);
    observer!.callback([]);
    expect(seen).toEqual([true, false, true]);
    stop();
    expect(observer!.disconnect).toHaveBeenCalledTimes(1);
  });

  it('starts and clears timers', () => {
    const { win, raw } = fakeWindow('complete');
    const task = vi.fn();
    const cancel = browserDeferDeps(win, {} as Element).startTimer(task, 1500);
    expect(raw.setTimeout).toHaveBeenCalledWith(task, 1500);
    cancel();
    expect(raw.clearTimeout).toHaveBeenCalledWith(3);
  });

  it('waits for an idle moment', () => {
    const { win, raw } = fakeWindow('complete');
    const task = vi.fn();
    browserDeferDeps(win, {} as Element).whenIdle(task);
    expect(raw.setTimeout).toHaveBeenCalledWith(task, 200);
  });
});
