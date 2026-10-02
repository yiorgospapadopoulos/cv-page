import { describe, expect, it, vi } from 'vitest';
import {
  createScrollSway,
  impulse,
  isSettled,
  restState,
  scrollVelocity,
  stepSway,
  swayParams,
  swayTransform,
  type SwayDeps,
} from './scrollSway';

const params = swayParams;

function simulate(from = restState(), ms = 4000, frame = 16) {
  const peaks = { angle: 0, lag: 0 };
  let state = from;
  let settledAt: number | null = null;
  for (let t = frame; t <= ms; t += frame) {
    state = stepSway(state, frame, params);
    peaks.angle = Math.max(peaks.angle, Math.abs(state.angle));
    peaks.lag = Math.max(peaks.lag, Math.abs(state.lag));
    if (settledAt === null && isSettled(state, params)) settledAt = t;
  }
  return { state, peaks, settledAt };
}

describe('swayParams', () => {
  it('has a natural period between 1.2 and 1.6 seconds', () => {
    expect(params.periodMs).toBeGreaterThanOrEqual(1200);
    expect(params.periodMs).toBeLessThanOrEqual(1600);
  });

  it('keeps the angle within about six degrees and the lag within a few pixels', () => {
    expect(params.maxAngle).toBeLessThanOrEqual(6);
    expect(params.maxLag).toBeLessThanOrEqual(5);
  });
});

describe('scrollVelocity', () => {
  it('is the distance over the time in pixels per millisecond', () => {
    expect(scrollVelocity(50, 25, 3)).toBe(2);
    expect(scrollVelocity(-30, 30, 3)).toBe(-1);
  });

  it('is clamped to the maximum in both directions', () => {
    expect(scrollVelocity(500, 10, 3)).toBe(3);
    expect(scrollVelocity(-500, 10, 3)).toBe(-3);
  });

  it('is zero without elapsed time', () => {
    expect(scrollVelocity(40, 0, 3)).toBe(0);
    expect(scrollVelocity(40, -5, 3)).toBe(0);
  });
});

describe('impulse', () => {
  it('swings against the scroll direction and lags behind it', () => {
    const down = impulse(restState(), 2, params);
    expect(down.spin).toBeLessThan(0);
    expect(down.lagSpeed).toBeGreaterThan(0);
    const up = impulse(restState(), -2, params);
    expect(up.spin).toBeGreaterThan(0);
    expect(up.lagSpeed).toBeLessThan(0);
  });

  it('scales with the change in velocity', () => {
    const small = impulse(restState(), 0.5, params);
    const large = impulse(restState(), 2, params);
    expect(Math.abs(large.spin)).toBeCloseTo(Math.abs(small.spin) * 4);
  });

  it('keeps the position and adds to the existing speed', () => {
    const start = { angle: 1, spin: 5, lag: 2, lagSpeed: 3 };
    const next = impulse(start, 1, params);
    expect(next.angle).toBe(1);
    expect(next.lag).toBe(2);
    expect(next.spin).toBeCloseTo(5 - params.spinGain);
    expect(next.lagSpeed).toBeCloseTo(3 + params.lagGain);
  });
});

describe('stepSway', () => {
  it('stays at rest without an impulse', () => {
    expect(stepSway(restState(), 16, params)).toEqual(restState());
  });

  it('pulls the angle back towards zero', () => {
    const next = stepSway({ ...restState(), angle: 4 }, 16, params);
    expect(next.angle).toBeLessThan(4);
    expect(next.spin).toBeLessThan(0);
  });

  it('swings past zero and back, then settles within three seconds', () => {
    const kicked = impulse(restState(), -3, params);
    let state = kicked;
    let crossings = 0;
    let previous = 0;
    let settledAt: number | null = null;
    for (let t = 16; t <= 4000; t += 16) {
      state = stepSway(state, 16, params);
      if (Math.sign(state.angle) * Math.sign(previous) < 0) crossings += 1;
      if (state.angle !== 0) previous = state.angle;
      if (settledAt === null && isSettled(state, params)) settledAt = t;
    }
    expect(crossings).toBeGreaterThanOrEqual(1);
    expect(settledAt).not.toBeNull();
    expect(settledAt!).toBeGreaterThan(1000);
    expect(settledAt!).toBeLessThanOrEqual(3000);
  });

  it('oscillates at the natural period when damping is removed', () => {
    const free = { ...params, damping: 0 };
    let state = { ...restState(), angle: 3 };
    let t = 0;
    let firstReturn = 0;
    while (t < 3000) {
      state = stepSway(state, 5, free);
      t += 5;
      if (firstReturn === 0 && state.angle > 2.99 && t > 500) firstReturn = t;
    }
    expect(Math.abs(firstReturn - params.periodMs)).toBeLessThan(30);
  });

  it('never exceeds the maximum angle or lag', () => {
    const wild = { angle: 0, spin: 5000, lag: 0, lagSpeed: 5000 };
    const { peaks } = simulate(wild);
    expect(peaks.angle).toBeLessThanOrEqual(params.maxAngle);
    expect(peaks.lag).toBeLessThanOrEqual(params.maxLag);
    const hit = stepSway({ ...wild, angle: params.maxAngle }, 16, params);
    expect(hit.angle).toBeGreaterThan(params.maxAngle - 0.2);
    expect(hit.angle).toBeLessThanOrEqual(params.maxAngle);
    expect(hit.lag).toBeLessThanOrEqual(params.maxLag);
    const negative = stepSway(
      {
        angle: -params.maxAngle,
        spin: -5000,
        lag: -params.maxLag,
        lagSpeed: -5000,
      },
      16,
      params,
    );
    expect(negative.angle).toBeLessThan(-params.maxAngle + 0.2);
    expect(negative.angle).toBeGreaterThanOrEqual(-params.maxAngle);
    expect(negative.lag).toBeLessThan(-params.maxLag + 0.2);
    expect(negative.lag).toBeGreaterThanOrEqual(-params.maxLag);
    expect(negative.spin).toBeGreaterThanOrEqual(0);
    expect(negative.lagSpeed).toBeGreaterThanOrEqual(0);
  });

  it('keeps moving away from a clamped edge', () => {
    const inward = stepSway(
      { angle: params.maxAngle, spin: -20, lag: 0, lagSpeed: 0 },
      16,
      params,
    );
    expect(inward.angle).toBeLessThan(params.maxAngle);
  });

  it('gives the same result for one long frame as for many short ones', () => {
    const start = impulse(restState(), 1.5, params);
    const once = stepSway(start, 40, params);
    let many = start;
    for (let i = 0; i < 4; i++) many = stepSway(many, 10, params);
    expect(once.angle).toBeCloseTo(many.angle, 1);
  });

  it('ignores time that did not pass', () => {
    const start = impulse(restState(), 1, params);
    expect(stepSway(start, 0, params)).toEqual(start);
    expect(stepSway(start, -4, params)).toEqual(start);
  });

  it('caps a very long frame', () => {
    const start = impulse(restState(), 1, params);
    expect(stepSway(start, 10_000, params)).toEqual(
      stepSway(start, params.maxFrameMs, params),
    );
  });
});

describe('isSettled', () => {
  it('is true only when position and speed are both tiny', () => {
    expect(isSettled(restState(), params)).toBe(true);
    expect(isSettled({ ...restState(), angle: 1 }, params)).toBe(false);
    expect(isSettled({ ...restState(), spin: 5 }, params)).toBe(false);
    expect(isSettled({ ...restState(), lag: 1 }, params)).toBe(false);
    expect(isSettled({ ...restState(), lagSpeed: 5 }, params)).toBe(false);
  });
});

describe('swayTransform', () => {
  it('is empty at rest and rotates about the pivot after a vertical shift', () => {
    expect(swayTransform(0, 0)).toBe('');
    expect(swayTransform(2.5, 1.25)).toBe('translateY(1.25px) rotate(2.5deg)');
    expect(swayTransform(-0.0004, 0.0004)).toBe('');
  });
});

function harness(initialY = 0) {
  let now = 1000;
  let y = initialY;
  let next = 1;
  const frames = new Map<number, (time: number) => void>();
  const applied: Array<[number, number]> = [];
  const deps: SwayDeps = {
    now: () => now,
    scrollY: () => y,
    requestFrame: vi.fn((callback) => {
      frames.set(next, callback);
      return next++;
    }),
    cancelFrame: vi.fn((handle) => {
      frames.delete(handle);
    }),
    apply: (angle, lag) => applied.push([angle, lag]),
  };
  return {
    deps,
    applied,
    pending: () => frames.size,
    scrollTo(target: number, after: number) {
      now += after;
      y = target;
    },
    tick(ms: number) {
      now += ms;
      const queued = [...frames.entries()];
      frames.clear();
      for (const [, callback] of queued) callback(now);
    },
    run(ms: number, frame = 16) {
      for (let t = 0; t < ms && frames.size > 0; t += frame) this.tick(frame);
    },
    last: () => applied.at(-1),
  };
}

describe('createScrollSway', () => {
  it('does nothing until the page scrolls', () => {
    const h = harness();
    createScrollSway(h.deps);
    expect(h.pending()).toBe(0);
    expect(h.applied).toEqual([]);
  });

  it('starts a frame loop on a fast scroll and applies the motion', () => {
    const h = harness();
    const sway = createScrollSway(h.deps);
    h.scrollTo(40, 16);
    sway.onScroll();
    expect(h.pending()).toBe(1);
    h.tick(16);
    const [angle, lag] = h.last()!;
    expect(angle).not.toBe(0);
    expect(lag).not.toBe(0);
    expect(angle).toBeLessThan(0);
    expect(lag).toBeGreaterThan(0);
  });

  it('measures velocity between scroll events and sways more for a faster scroll', () => {
    const swing = (distance: number) => {
      const h = harness();
      const sway = createScrollSway(h.deps);
      h.scrollTo(distance, 16);
      sway.onScroll();
      h.run(400);
      return Math.max(...h.applied.map(([angle]) => Math.abs(angle)));
    };
    expect(swing(60)).toBeGreaterThan(swing(10));
  });

  it('swings the other way when scrolling up', () => {
    const h = harness(500);
    const sway = createScrollSway(h.deps);
    h.scrollTo(460, 16);
    sway.onScroll();
    h.tick(16);
    expect(h.last()![0]).toBeGreaterThan(0);
    expect(h.last()![1]).toBeLessThan(0);
  });

  it('swings in proportion to the change in velocity, not the speed alone', () => {
    const steady = harness();
    const sway = createScrollSway(steady.deps);
    steady.scrollTo(30, 16);
    sway.onScroll();
    steady.tick(16);
    const first = Math.abs(steady.last()![0]);
    for (let i = 2; i <= 40; i++) {
      steady.scrollTo(i * 30, 16);
      sway.onScroll();
      steady.tick(16);
    }
    const late = Math.abs(steady.last()![0]);
    expect(late).toBeLessThan(first * 3);
    expect(late).toBeLessThanOrEqual(params.maxAngle);
  });

  it('merges scroll events that arrive within the same instant', () => {
    const h = harness();
    const sway = createScrollSway(h.deps);
    h.scrollTo(20, 1);
    sway.onScroll();
    expect(h.pending()).toBe(0);
    h.scrollTo(40, 15);
    sway.onScroll();
    expect(h.pending()).toBe(1);
  });

  it('treats the first scroll after a pause as a fresh start', () => {
    const h = harness();
    const sway = createScrollSway(h.deps);
    h.scrollTo(400, params.staleMs + 50);
    sway.onScroll();
    expect(h.pending()).toBe(0);
    h.scrollTo(440, 16);
    sway.onScroll();
    expect(h.pending()).toBe(1);
  });

  it('forgets the previous speed after a pause', () => {
    const h = harness();
    const sway = createScrollSway(h.deps);
    h.scrollTo(40, 16);
    sway.onScroll();
    h.run(5000);
    h.scrollTo(80, params.staleMs + 100);
    sway.onScroll();
    h.scrollTo(120, 16);
    sway.onScroll();
    h.tick(16);
    expect(h.last()![0]).toBeLessThan(0);
  });

  it('stops requesting frames once settled and resets to rest', () => {
    const h = harness();
    const sway = createScrollSway(h.deps);
    h.scrollTo(60, 16);
    sway.onScroll();
    h.run(10_000);
    expect(h.pending()).toBe(0);
    expect(h.last()).toEqual([0, 0]);
    const swung = h.applied.filter(([angle]) => Math.abs(angle) > 0.2);
    expect(swung.length).toBeGreaterThan(20);
    const calls = h.applied.length;
    h.tick(16);
    expect(h.applied.length).toBe(calls);
  });

  it('settles within about three seconds of a quick flick', () => {
    const h = harness();
    const sway = createScrollSway(h.deps);
    h.scrollTo(80, 16);
    sway.onScroll();
    let elapsed = 0;
    while (h.pending() > 0 && elapsed < 10_000) {
      h.tick(16);
      elapsed += 16;
    }
    expect(elapsed).toBeLessThanOrEqual(3200);
  });

  it('does not start a second loop while one is running', () => {
    const h = harness();
    const sway = createScrollSway(h.deps);
    h.scrollTo(30, 16);
    sway.onScroll();
    h.scrollTo(60, 16);
    sway.onScroll();
    expect(h.deps.requestFrame).toHaveBeenCalledTimes(1);
  });

  it('ignores scrolling while inactive and rests the card when paused', () => {
    const h = harness();
    const sway = createScrollSway(h.deps);
    h.scrollTo(40, 16);
    sway.onScroll();
    h.tick(16);
    sway.setActive(false);
    expect(h.pending()).toBe(0);
    expect(h.deps.cancelFrame).toHaveBeenCalledTimes(1);
    expect(h.last()).toEqual([0, 0]);

    h.scrollTo(200, 16);
    sway.onScroll();
    expect(h.pending()).toBe(0);

    sway.setActive(true);
    h.scrollTo(260, params.staleMs + 10);
    sway.onScroll();
    h.scrollTo(300, 16);
    sway.onScroll();
    expect(h.pending()).toBe(1);
  });

  it('ignores a repeated activation or pause', () => {
    const h = harness();
    const sway = createScrollSway(h.deps);
    sway.setActive(true);
    sway.setActive(false);
    sway.setActive(false);
    expect(h.applied).toEqual([[0, 0]]);
  });

  it('can be paused and resumed when nothing is running', () => {
    const h = harness();
    const sway = createScrollSway(h.deps);
    sway.setActive(false);
    expect(h.deps.cancelFrame).not.toHaveBeenCalled();
    sway.setActive(true);
    h.scrollTo(30, 16);
    sway.onScroll();
    expect(h.pending()).toBe(1);
  });

  it('stops for good and clears the transform', () => {
    const h = harness();
    const sway = createScrollSway(h.deps);
    h.scrollTo(40, 16);
    sway.onScroll();
    sway.stop();
    expect(h.pending()).toBe(0);
    expect(h.last()).toEqual([0, 0]);
    h.scrollTo(80, 16);
    sway.onScroll();
    expect(h.pending()).toBe(0);
  });
});
