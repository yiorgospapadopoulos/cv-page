import { describe, expect, it, vi } from 'vitest';
import {
  createScrollTilt,
  maxAngle,
  minAngle,
  tiltForScroll,
  type TiltDeps,
} from './scrollTilt';

describe('tiltForScroll', () => {
  it('rests at 7 degrees at the top of the page', () => {
    expect(maxAngle).toBe(7);
    expect(tiltForScroll(0)).toBe(7);
  });

  it('turns about one degree per 55 pixels', () => {
    expect(tiltForScroll(300)).toBeCloseTo(1.58, 2);
    expect(tiltForScroll(400)).toBeCloseTo(-0.23, 2);
    expect(tiltForScroll(600)).toBeCloseTo(-3.84, 2);
    expect(tiltForScroll(55)).toBeCloseTo(6, 1);
  });

  it('depends only on the position, so scrolling back up undoes the tilt', () => {
    const down = [0, 120, 300, 480].map(tiltForScroll);
    const up = [480, 300, 120, 0].map(tiltForScroll);
    expect(up).toEqual([...down].reverse());
    expect(down).toEqual([...down].sort((a, b) => b - a));
  });

  it('never tilts past 7 degrees, even when overscrolling above the top', () => {
    expect(tiltForScroll(-80)).toBe(7);
  });

  it('stops at -12 degrees', () => {
    expect(minAngle).toBe(-12);
    expect(tiltForScroll(1100)).toBe(-12);
    expect(tiltForScroll(100_000)).toBe(-12);
  });
});

function harness(initialY = 0) {
  let y = initialY;
  let onScroll: (() => void) | null = null;
  const frames = new Map<number, () => void>();
  let nextHandle = 1;
  const unlisten = vi.fn(() => {
    onScroll = null;
  });
  const deps: TiltDeps = {
    scrollY: () => y,
    listen: vi.fn((handler: () => void) => {
      onScroll = handler;
      return unlisten;
    }),
    requestFrame: vi.fn((callback: () => void) => {
      const handle = nextHandle++;
      frames.set(handle, callback);
      return handle;
    }),
    cancelFrame: vi.fn((handle: number) => {
      frames.delete(handle);
    }),
    apply: vi.fn(),
  };
  return {
    deps,
    unlisten,
    scrollTo(next: number) {
      y = next;
      onScroll?.();
    },
    listening: () => onScroll !== null,
    pending: () => frames.size,
    flush() {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

describe('createScrollTilt', () => {
  it('does nothing until it is activated', () => {
    const h = harness();
    createScrollTilt(h.deps);
    expect(h.deps.listen).not.toHaveBeenCalled();
    expect(h.deps.requestFrame).not.toHaveBeenCalled();
  });

  it('applies the current angle on the next frame after activation', () => {
    const h = harness(300);
    createScrollTilt(h.deps).setActive(true);
    expect(h.listening()).toBe(true);
    expect(h.deps.apply).not.toHaveBeenCalled();
    h.flush();
    expect(h.deps.apply).toHaveBeenCalledOnce();
    expect(vi.mocked(h.deps.apply).mock.calls[0]![0]).toBeCloseTo(1.58, 2);
  });

  it('follows the scroll position in both directions', () => {
    const h = harness();
    createScrollTilt(h.deps).setActive(true);
    h.flush();
    h.scrollTo(600);
    h.flush();
    h.scrollTo(0);
    h.flush();
    const angles = vi.mocked(h.deps.apply).mock.calls.map(([angle]) => angle);
    expect(angles[0]).toBe(7);
    expect(angles[1]).toBeCloseTo(-3.84, 2);
    expect(angles[2]).toBe(7);
  });

  it('updates at most once per frame however many scroll events arrive', () => {
    const h = harness();
    createScrollTilt(h.deps).setActive(true);
    h.flush();
    vi.mocked(h.deps.requestFrame).mockClear();
    h.scrollTo(10);
    h.scrollTo(20);
    h.scrollTo(30);
    expect(h.deps.requestFrame).toHaveBeenCalledOnce();
    h.flush();
    expect(h.deps.apply).toHaveBeenCalledTimes(2);
    expect(vi.mocked(h.deps.apply).mock.calls[1]![0]).toBeCloseTo(
      tiltForScroll(30),
      6,
    );
  });

  it('ignores a repeated activation', () => {
    const h = harness();
    const tilt = createScrollTilt(h.deps);
    tilt.setActive(true);
    tilt.setActive(true);
    expect(h.deps.listen).toHaveBeenCalledOnce();
    expect(h.deps.requestFrame).toHaveBeenCalledOnce();
  });

  it('stops listening and drops the pending frame when deactivated', () => {
    const h = harness();
    const tilt = createScrollTilt(h.deps);
    tilt.setActive(true);
    expect(h.pending()).toBe(1);
    tilt.setActive(false);
    expect(h.unlisten).toHaveBeenCalledOnce();
    expect(h.listening()).toBe(false);
    expect(h.deps.cancelFrame).toHaveBeenCalledOnce();
    expect(h.pending()).toBe(0);
    h.flush();
    expect(h.deps.apply).not.toHaveBeenCalled();
  });

  it('deactivates cleanly when no frame is pending', () => {
    const h = harness();
    const tilt = createScrollTilt(h.deps);
    tilt.setActive(true);
    h.flush();
    tilt.setActive(false);
    expect(h.deps.cancelFrame).not.toHaveBeenCalled();
    tilt.setActive(false);
    expect(h.unlisten).toHaveBeenCalledOnce();
  });

  it('catches up with the scroll position when reactivated', () => {
    const h = harness();
    const tilt = createScrollTilt(h.deps);
    tilt.setActive(true);
    h.flush();
    tilt.setActive(false);
    h.scrollTo(450);
    tilt.setActive(true);
    h.flush();
    const last = vi.mocked(h.deps.apply).mock.calls.at(-1)![0];
    expect(last).toBeCloseTo(tiltForScroll(450), 6);
  });
});
