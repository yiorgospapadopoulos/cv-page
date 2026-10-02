export interface SwayParams {
  periodMs: number;
  damping: number;
  lagPeriodMs: number;
  lagDamping: number;
  maxAngle: number;
  maxLag: number;
  spinGain: number;
  lagGain: number;
  maxVelocity: number;
  minDtMs: number;
  staleMs: number;
  maxFrameMs: number;
  stepMs: number;
  settleAngle: number;
  settleSpin: number;
  settleLag: number;
  settleLagSpeed: number;
}

export const swayParams: SwayParams = {
  periodMs: 1400,
  damping: 0.35,
  lagPeriodMs: 1000,
  lagDamping: 0.5,
  maxAngle: 6,
  maxLag: 4,
  spinGain: 50,
  lagGain: 60,
  maxVelocity: 3,
  minDtMs: 4,
  staleMs: 100,
  maxFrameMs: 50,
  stepMs: 4,
  settleAngle: 0.1,
  settleSpin: 0.5,
  settleLag: 0.1,
  settleLagSpeed: 0.5,
};

export interface SwayState {
  angle: number;
  spin: number;
  lag: number;
  lagSpeed: number;
}

export function restState(): SwayState {
  return { angle: 0, spin: 0, lag: 0, lagSpeed: 0 };
}

export function scrollVelocity(
  distance: number,
  elapsedMs: number,
  maxVelocity: number,
): number {
  if (elapsedMs <= 0) return 0;
  return Math.max(-maxVelocity, Math.min(maxVelocity, distance / elapsedMs));
}

export function impulse(
  state: SwayState,
  velocityChange: number,
  params: SwayParams,
): SwayState {
  return {
    ...state,
    spin: state.spin - velocityChange * params.spinGain,
    lagSpeed: state.lagSpeed + velocityChange * params.lagGain,
  };
}

function springStep(
  position: number,
  speed: number,
  seconds: number,
  periodMs: number,
  damping: number,
  limit: number,
): [number, number] {
  const omega = (2 * Math.PI * 1000) / periodMs;
  const nextSpeed =
    speed + (-omega * omega * position - 2 * damping * omega * speed) * seconds;
  const nextPosition = position + nextSpeed * seconds;
  if (Math.abs(nextPosition) <= limit) return [nextPosition, nextSpeed];
  return [Math.sign(nextPosition) * limit, 0];
}

export function stepSway(
  state: SwayState,
  dtMs: number,
  params: SwayParams,
): SwayState {
  if (dtMs <= 0) return state;
  const total = Math.min(dtMs, params.maxFrameMs);
  const steps = Math.ceil(total / params.stepMs);
  const seconds = total / steps / 1000;
  let { angle, spin, lag, lagSpeed } = state;
  for (let i = 0; i < steps; i++) {
    [angle, spin] = springStep(
      angle,
      spin,
      seconds,
      params.periodMs,
      params.damping,
      params.maxAngle,
    );
    [lag, lagSpeed] = springStep(
      lag,
      lagSpeed,
      seconds,
      params.lagPeriodMs,
      params.lagDamping,
      params.maxLag,
    );
  }
  return { angle, spin, lag, lagSpeed };
}

export function isSettled(state: SwayState, params: SwayParams): boolean {
  return (
    Math.abs(state.angle) < params.settleAngle &&
    Math.abs(state.spin) < params.settleSpin &&
    Math.abs(state.lag) < params.settleLag &&
    Math.abs(state.lagSpeed) < params.settleLagSpeed
  );
}

export function swayTransform(angle: number, lag: number): string {
  if (Math.abs(angle) < 0.005 && Math.abs(lag) < 0.005) return '';
  return `translateY(${+lag.toFixed(2)}px) rotate(${+angle.toFixed(2)}deg)`;
}

export interface SwayDeps {
  now(): number;
  scrollY(): number;
  requestFrame(callback: (time: number) => void): number;
  cancelFrame(handle: number): void;
  apply(angle: number, lag: number): void;
}

export interface SwayController {
  onScroll(): void;
  setActive(active: boolean): void;
  stop(): void;
}

export function createScrollSway(
  deps: SwayDeps,
  params: SwayParams = swayParams,
): SwayController {
  let state = restState();
  let active = true;
  let handle: number | null = null;
  let frameTime = 0;
  let lastY = deps.scrollY();
  let lastTime = deps.now();
  let lastVelocity = 0;

  const rebase = (time: number, y: number) => {
    lastTime = time;
    lastY = y;
    lastVelocity = 0;
  };

  const frame = (time: number) => {
    handle = null;
    state = stepSway(state, time - frameTime, params);
    frameTime = time;
    if (isSettled(state, params)) {
      state = restState();
      deps.apply(0, 0);
      return;
    }
    deps.apply(state.angle, state.lag);
    handle = deps.requestFrame(frame);
  };

  return {
    onScroll() {
      if (!active) return;
      const time = deps.now();
      const elapsed = time - lastTime;
      if (elapsed < params.minDtMs) return;
      const y = deps.scrollY();
      if (elapsed > params.staleMs) {
        rebase(time, y);
        return;
      }
      const velocity = scrollVelocity(y - lastY, elapsed, params.maxVelocity);
      state = impulse(state, velocity - lastVelocity, params);
      lastY = y;
      lastTime = time;
      lastVelocity = velocity;
      if (handle === null) {
        frameTime = time;
        handle = deps.requestFrame(frame);
      }
    },
    setActive(next) {
      if (next === active) return;
      active = next;
      if (next) {
        rebase(deps.now(), deps.scrollY());
        return;
      }
      if (handle !== null) deps.cancelFrame(handle);
      handle = null;
      state = restState();
      deps.apply(0, 0);
    },
    stop() {
      this.setActive(false);
    },
  };
}
