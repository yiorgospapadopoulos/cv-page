import { describe, expect, it, vi } from 'vitest';
import { whenIdle, type IdleWindow } from './idle';

describe('whenIdle', () => {
  it('uses requestIdleCallback with a timeout when available', () => {
    const task = vi.fn();
    const requestIdleCallback = vi.fn(() => 7);
    const cancelIdleCallback = vi.fn();
    const cancel = whenIdle(
      { requestIdleCallback, cancelIdleCallback } as unknown as IdleWindow,
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
      { setTimeout, clearTimeout } as unknown as IdleWindow,
      task,
    );
    expect(setTimeout).toHaveBeenCalledWith(task, 200);
    cancel();
    expect(clearTimeout).toHaveBeenCalledWith(9);
  });
});
