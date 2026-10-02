export const maxAngle = 7;
export const minAngle = -12;
const degreesPerPixel = 0.01807;

export function tiltForScroll(scrollY: number): number {
  const angle = maxAngle - scrollY * degreesPerPixel;
  return Math.max(minAngle, Math.min(maxAngle, angle));
}

export interface TiltDeps {
  scrollY(): number;
  listen(handler: () => void): () => void;
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
  apply(angle: number): void;
}

export interface TiltController {
  setActive(active: boolean): void;
}

export function createScrollTilt(deps: TiltDeps): TiltController {
  let unlisten: (() => void) | null = null;
  let handle: number | null = null;

  const update = () => {
    handle = null;
    deps.apply(tiltForScroll(deps.scrollY()));
  };
  const schedule = () => {
    if (handle === null) handle = deps.requestFrame(update);
  };

  return {
    setActive(active) {
      if (active) {
        if (unlisten !== null) return;
        unlisten = deps.listen(schedule);
        schedule();
        return;
      }
      if (unlisten === null) return;
      unlisten();
      unlisten = null;
      if (handle !== null) deps.cancelFrame(handle);
      handle = null;
    },
  };
}
