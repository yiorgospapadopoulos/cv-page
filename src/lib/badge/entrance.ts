import { wideQuery } from './loadPolicy';

// State of the desktop badge on <html data-badge-load>: pending hides the static
// card while the 3d badge loads, static shows it, ready means the 3d badge is up.
export type BadgeState = 'pending' | 'static' | 'ready';
export type BadgeSignal = 'ready' | 'static' | 'timeout';

export const revealAfterMs = 6000;

interface Root {
  dataset: Record<string, string | undefined>;
}

// Runs in <head> before the first paint. Mirrors wantsStaticBadge with a cheap
// WebGL check; the island makes the full check and signals static if it fails.
export const badgeHeadScript = `(function () {
  var root = document.documentElement;
  var c = navigator.connection || {};
  if (
    window.matchMedia(${JSON.stringify(wideQuery)}).matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
    !c.saveData &&
    !/^(slow-)?2g$/.test(c.effectiveType) &&
    'WebGLRenderingContext' in window
  ) {
    root.dataset.badgeLoad = 'pending';
    setTimeout(function () {
      if (root.dataset.badgeLoad === 'pending') root.dataset.badgeLoad = 'static';
    }, ${revealAfterMs});
  }
})();`;

export function nextBadgeState(
  state: string | undefined,
  signal: BadgeSignal,
): string | undefined {
  if (signal !== 'timeout') return signal;
  return state === 'pending' ? 'static' : state;
}

export function signalBadge(root: Root, signal: BadgeSignal): void {
  const next = nextBadgeState(root.dataset.badgeLoad, signal);
  if (next !== undefined) root.dataset.badgeLoad = next;
}

export function dropsIn(root: Root): boolean {
  return root.dataset.badgeLoad === 'pending';
}
