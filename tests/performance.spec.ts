import { expect, test, type Page } from '@playwright/test';
import { hasWebGL, isNarrow, noWebGL, staticWhenNarrow } from './support';

const sceneChunk = /\/_astro\/(Scene|rapier)[.-]/;

function sceneRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (sceneChunk.test(request.url())) urls.push(request.url());
  });
  return urls;
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
      await expect(page.locator('[data-badge]')).toHaveCSS('opacity', '1');
      await expect(page.locator('html')).not.toHaveAttribute(
        'data-badge-load',
        'pending',
      );
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
    test.skip(await isNarrow(page), staticWhenNarrow);
    test.skip(!(await hasWebGL(page)), noWebGL);
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
    test.skip(await isNarrow(page), staticWhenNarrow);
    test.skip(!(await hasWebGL(page)), noWebGL);
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

async function expectNoScene(page: Page, requests: string[], wasm: string[]) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(4000);
  expect(requests).toEqual([]);
  expect(wasm).toEqual([]);
  await expect(page.locator('#badge-slot canvas')).toHaveCount(0);
  await expect(page.locator('#badge-slot')).not.toHaveAttribute(
    'data-badge-3d',
  );
}

function watchScene(page: Page) {
  const requests = sceneRequests(page);
  const wasm: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('.wasm')) wasm.push(request.url());
  });
  return { requests, wasm };
}

test.describe('narrow viewports', () => {
  test('never load the 3d scene or the physics engine', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const { requests, wasm } = watchScene(page);
    await page.goto('/');
    test.skip(!(await isNarrow(page)), 'Only narrow viewports');
    await expectNoScene(page, requests, wasm);
    expect(errors).toEqual([]);
  });

  test.describe('on a narrow desktop window', () => {
    test.use({ viewport: { width: 600, height: 900 } });

    test('never load the 3d scene or the physics engine', async ({
      page,
      browserName,
      isMobile,
    }) => {
      test.skip(browserName !== 'chromium' || isMobile, 'Desktop Chromium');
      const { requests, wasm } = watchScene(page);
      await page.goto('/');
      await expectNoScene(page, requests, wasm);
    });

    test('load the scene only after widening past the breakpoint', async ({
      page,
      browserName,
      isMobile,
    }) => {
      test.skip(browserName !== 'chromium' || isMobile, 'Desktop Chromium');
      const { requests, wasm } = watchScene(page);
      await page.goto('/');
      test.skip(!(await hasWebGL(page)), noWebGL);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      expect(requests).toEqual([]);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.waitForRequest(sceneChunk, { timeout: 20_000 });
      await expect(page.locator('#badge-slot')).toHaveAttribute(
        'data-badge-3d',
        'ready',
        { timeout: 20_000 },
      );
      expect(wasm.length).toBeGreaterThan(0);
    });
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
    const last = result.entries.at(-1)!;
    expect(last.inHero).toBe(true);
    expect(last.tag).not.toBe('CANVAS');
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

    const files = [...new Set(fonts)];
    expect(files.length).toBeGreaterThan(0);
    expect(files.length).toBeLessThanOrEqual(2);
    for (const url of files) expect(url).toMatch(/-latin-(opsz|wght)-/);

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
