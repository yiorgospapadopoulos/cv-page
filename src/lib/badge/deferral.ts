export const touchDeferMs = 1500;

const idleTimeoutMs = 1500;
const idleFallbackMs = 200;

export interface DeferDeps {
  afterLoad(run: () => void): () => void;
  watchVisible(onChange: (visible: boolean) => void): () => void;
  startTimer(task: () => void, ms: number): () => void;
  whenIdle(task: () => void): () => void;
}

export interface DeferWindow {
  document: { readyState: string };
  addEventListener(type: 'load', listener: () => void): void;
  removeEventListener(type: 'load', listener: () => void): void;
  IntersectionObserver: new (
    callback: (entries: Array<{ isIntersecting: boolean }>) => void,
  ) => { observe(target: Element): void; disconnect(): void };
  setTimeout(task: () => void, ms: number): number;
  clearTimeout(handle: number): void;
  requestIdleCallback?(task: () => void, options: { timeout: number }): number;
  cancelIdleCallback?(handle: number): void;
}

export function whenIdle(
  win: Pick<
    DeferWindow,
    'requestIdleCallback' | 'cancelIdleCallback' | 'setTimeout' | 'clearTimeout'
  >,
  task: () => void,
): () => void {
  if (typeof win.requestIdleCallback === 'function') {
    const handle = win.requestIdleCallback(task, { timeout: idleTimeoutMs });
    return () => win.cancelIdleCallback?.(handle);
  }
  const handle = win.setTimeout(task, idleFallbackMs);
  return () => win.clearTimeout(handle);
}

export function browserDeferDeps(win: DeferWindow, hero: Element): DeferDeps {
  return {
    afterLoad(run) {
      if (win.document.readyState === 'complete') {
        run();
        return () => {};
      }
      win.addEventListener('load', run);
      return () => win.removeEventListener('load', run);
    },
    watchVisible(onChange) {
      const observer = new win.IntersectionObserver((entries) =>
        onChange(entries.at(-1)?.isIntersecting ?? true),
      );
      observer.observe(hero);
      return () => observer.disconnect();
    },
    startTimer(task, ms) {
      const handle = win.setTimeout(task, ms);
      return () => win.clearTimeout(handle);
    },
    whenIdle: (task) => whenIdle(win, task),
  };
}

export function deferBadgeLoad(
  deps: DeferDeps,
  task: () => void,
  delayMs: number = touchDeferMs,
): () => void {
  let stopWatching = () => {};
  let cancelTimer = () => {};
  let cancelIdle = () => {};
  const stopLoad = deps.afterLoad(() => {
    stopWatching = deps.watchVisible((visible) => {
      cancelTimer();
      cancelTimer = () => {};
      if (!visible) return;
      cancelTimer = deps.startTimer(() => {
        stopWatching();
        cancelIdle = deps.whenIdle(task);
      }, delayMs);
    });
  });
  return () => {
    stopLoad();
    stopWatching();
    cancelTimer();
    cancelIdle();
  };
}
