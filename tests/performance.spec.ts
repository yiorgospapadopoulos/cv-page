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
