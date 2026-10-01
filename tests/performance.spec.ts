import { expect, test, type Page } from '@playwright/test';

const sceneChunk = /\/_astro\/(Scene|rapier)[.-]/;

function sceneRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (sceneChunk.test(request.url())) urls.push(request.url());
  });
  return urls;
}

async function hasWebGL(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.createElement('canvas').getContext('webgl2') !== null,
  );
}

const connections = [
  { name: 'save-data', value: { saveData: true, effectiveType: '4g' } },
  { name: 'slow-2g', value: { saveData: false, effectiveType: 'slow-2g' } },
  { name: '2g', value: { saveData: false, effectiveType: '2g' } },
];

test.describe('connection-aware badge', () => {
  for (const { name, value } of connections) {
    test(`does not request the 3d scene on ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const requests = sceneRequests(page);
      await page.addInitScript((connection) => {
        Object.defineProperty(navigator, 'connection', {
          value: connection,
          configurable: true,
        });
      }, value);
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(4000);

      expect(requests).toEqual([]);
      await expect(page.locator('[data-badge]')).toBeVisible();
      await expect(page.locator('#badge-slot canvas')).toHaveCount(0);
      await expect(page.locator('#badge-slot')).not.toHaveAttribute(
        'data-badge-3d',
      );
      expect(errors).toEqual([]);
    });
  }

  test('still requests the 3d scene on a normal connection', async ({
    page,
  }) => {
    await page.goto('/');
    test.skip(!(await hasWebGL(page)), 'WebGL is unavailable in this engine');
    await page.waitForRequest(sceneChunk, { timeout: 20_000 });
  });

  test('streams the physics engine as a separate wasm file', async ({
    page,
  }) => {
    const sizes: number[] = [];
    page.on('response', async (response) => {
      if (/\/_astro\/Scene[.-]/.test(response.url())) {
        sizes.push((await response.body()).length);
      }
    });
    await page.goto('/');
    test.skip(!(await hasWebGL(page)), 'WebGL is unavailable in this engine');
    const wasm = await page.waitForResponse(/\.wasm$/, { timeout: 25_000 });
    expect(wasm.headers()['content-type']).toBe('application/wasm');
    await expect(page.locator('#badge-slot')).toHaveAttribute(
      'data-badge-3d',
      'ready',
      { timeout: 20_000 },
    );
    expect(sizes).toHaveLength(1);
    expect(sizes[0]).toBeLessThan(1_500_000);
  });
});

test.describe('touch devices', () => {
  test('wait for the hero to be visible for a moment before loading the scene', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'Only coarse-pointer devices defer the scene');
    await page.goto('/', { waitUntil: 'load' });
    test.skip(!(await hasWebGL(page)), 'WebGL is unavailable in this engine');
    const loadedAt = Date.now();
    await page.waitForRequest(sceneChunk, { timeout: 20_000 });
    expect(Date.now() - loadedAt).toBeGreaterThanOrEqual(1400);
    await expect(page.locator('#badge-slot')).toHaveAttribute(
      'data-badge-3d',
      'ready',
      { timeout: 20_000 },
    );
  });

  test('do not start the delay while the hero is off screen', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'Only coarse-pointer devices defer the scene');
    const requests = sceneRequests(page);
    await page.goto('/', { waitUntil: 'load' });
    test.skip(!(await hasWebGL(page)), 'WebGL is unavailable in this engine');
    await page.evaluate(() =>
      document.querySelector('#about')?.scrollIntoView(),
    );
    await page.waitForTimeout(250);
    await page.evaluate(() => document.querySelector('#try')?.scrollIntoView());
    await page.waitForTimeout(3000);
    expect(requests).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForRequest(sceneChunk, { timeout: 20_000 });
  });
});

test.describe('largest contentful paint', () => {
  test('is the hero text and never the badge', async ({ page }) => {
    await page.addInitScript(() => {
      const entries: Array<{ time: number; inHero: boolean; tag: string }> = [];
      Object.assign(window, { __lcp: entries });
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const element = (entry as unknown as { element: Element | null })
              .element;
            entries.push({
              time: entry.startTime,
              tag: element?.tagName ?? 'none',
              inHero:
                element?.closest('.hero h1, .hero .intro, .hero .current') !=
                null,
            });
          }
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      } catch {
        Object.assign(window, { __lcpUnsupported: true });
      }
    });
    await page.goto('/');
    await page.waitForLoadState('load');
    await page.waitForTimeout(1500);

    const result = await page.evaluate(() => {
      const w = window as unknown as {
        __lcp: Array<{ time: number; inHero: boolean; tag: string }>;
        __lcpUnsupported?: boolean;
      };
      return { entries: w.__lcp, unsupported: w.__lcpUnsupported === true };
    });
    test.skip(
      result.unsupported || result.entries.length === 0,
      'Largest Contentful Paint is not reported by this engine',
    );
    expect(result.entries.every((entry) => entry.inHero)).toBe(true);
    expect(result.entries.map((entry) => entry.tag)).not.toContain('CANVAS');
  });
});

test.describe('fonts and styles', () => {
  test('preloads the heading font and ships only the latin subsets', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const fonts: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'font') fonts.push(request.url());
    });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForLoadState('networkidle');

    const preload = page.locator('link[rel="preload"][as="font"]');
    await expect(preload).toHaveCount(1);
    await expect(preload).toHaveAttribute('type', 'font/woff2');
    await expect(preload).toHaveAttribute('crossorigin', '');
    expect(await preload.getAttribute('href')).toContain('fraunces-latin-');

    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.length).toBeLessThanOrEqual(2);
    for (const url of fonts) expect(url).toMatch(/-latin-(opsz|wght)-/);

    const displays = await page.evaluate(() =>
      [...document.fonts].map((face) => face.display),
    );
    expect(displays).toHaveLength(2);
    expect(new Set(displays)).toEqual(new Set(['swap']));
  });

  test('inlines the css so no stylesheet blocks the first paint', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="stylesheet"]')).toHaveCount(0);
  });
});
