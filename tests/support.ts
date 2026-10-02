import type { Page } from '@playwright/test';

export async function hasWebGL(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    return (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) !== null;
  });
}

export const noWebGL = 'WebGL is unavailable in this headless engine';

export async function isNarrow(page: Page): Promise<boolean> {
  return page.evaluate(() => !matchMedia('(min-width: 860px)').matches);
}

export const staticWhenNarrow = 'Narrow viewports keep the phone card';

export interface LoadSample {
  t: number;
  load: string | undefined;
  shown: boolean;
  opacity: number;
  ready: boolean;
  x: number;
  y: number;
}

// Samples the static badge and the 3d readouts every frame from the first
// frame after navigation, before any page script runs.
export async function recordBadgeLoad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const samples: unknown[] = [];
    Object.assign(window, { __badgeLoad: samples });
    const start = performance.now();
    const step = () => {
      const badge = document.querySelector('[data-badge]');
      const hit = document.querySelector<HTMLElement>('#badge-slot .badge-hit');
      if (badge) {
        const style = getComputedStyle(badge);
        samples.push({
          t: performance.now() - start,
          load: document.documentElement.dataset.badgeLoad,
          shown: style.visibility !== 'hidden' && Number(style.opacity) > 0,
          opacity: Number(style.opacity),
          ready:
            document
              .querySelector('#badge-slot')
              ?.getAttribute('data-badge-3d') === 'ready',
          x: hit ? Number(hit.dataset.x) : NaN,
          y: hit ? Number(hit.dataset.y) : NaN,
        });
      }
      if (performance.now() - start < 20_000) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

export async function badgeLoadSamples(page: Page): Promise<LoadSample[]> {
  return page.evaluate(
    () => (window as unknown as { __badgeLoad: LoadSample[] }).__badgeLoad,
  );
}

export const sceneChunk = /\/_astro\/(Scene|rapier)[.-]/;
