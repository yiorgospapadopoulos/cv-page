const idleTimeoutMs = 1500;
const idleFallbackMs = 200;

export interface IdleWindow {
  setTimeout(task: () => void, ms: number): number;
  clearTimeout(handle: number): void;
  requestIdleCallback?(task: () => void, options: { timeout: number }): number;
  cancelIdleCallback?(handle: number): void;
}

export function whenIdle(win: IdleWindow, task: () => void): () => void {
  if (typeof win.requestIdleCallback === 'function') {
    const handle = win.requestIdleCallback(task, { timeout: idleTimeoutMs });
    return () => win.cancelIdleCallback?.(handle);
  }
  const handle = win.setTimeout(task, idleFallbackMs);
  return () => win.clearTimeout(handle);
}
