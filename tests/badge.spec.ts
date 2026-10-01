import { expect, test, type Page } from '@playwright/test';
import { profile } from '../src/content/profile';
import { hasWebGL, noWebGL } from './support';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function waitForBadge(page: Page) {
  test.skip(!(await hasWebGL(page)), noWebGL);
  await expect(page.locator('#badge-slot')).toHaveAttribute(
    'data-badge-3d',
    'ready',
    { timeout: 20_000 },
  );
}

async function settle(page: Page) {
  await page.waitForTimeout(2500);
}

test.describe('3d badge', () => {
  test('replaces the placeholder with a canvas', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await waitForBadge(page);
    await expect(page.locator('#badge-slot canvas')).toHaveCount(1);
    await expect(page.locator('#badge-slot .badge-3d')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    await expect(page.locator('[data-badge]')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('can be dragged and released', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await waitForBadge(page);
    await settle(page);

    const frame = page.locator('#badge-slot .badge-frame');
    const before = await frame.screenshot();
    const hit = await page.locator('#badge-slot .badge-hit').boundingBox();
    expect(hit).not.toBeNull();
    const x = hit!.x + hit!.width / 2;
    const y = hit!.y + hit!.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let step = 1; step <= 10; step++) {
      await page.mouse.move(x + step * 4, y + step * 8);
    }
    await page.waitForTimeout(200);
    const during = await frame.screenshot();
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await frame.screenshot();

    expect(during.equals(before)).toBe(false);
    expect(after.equals(during)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('keeps the corner text clickable', async ({ page }) => {
    await page.goto('/');
    await waitForBadge(page);
    await page.getByRole('button', { name: profile.hero.moreLabel }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('keeps the placeholder and creates no canvas', async ({ page }) => {
      await page.goto('/');
      await page.waitForTimeout(1500);
      await expect(page.locator('#badge-slot canvas')).toHaveCount(0);
      await expect(page.locator('[data-badge]')).toBeVisible();
      await expect(page.locator('#badge-slot')).not.toHaveAttribute(
        'data-badge-3d',
      );
    });
  });

  test('keeps the placeholder without webgl', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        kind: string,
        ...args: unknown[]
      ) {
        if (kind.includes('webgl')) return null;
        return (original as (...a: unknown[]) => unknown).call(
          this,
          kind,
          ...args,
        );
      } as typeof original;
    });
    await page.goto('/');
    await page.waitForTimeout(1500);
    await expect(page.locator('#badge-slot canvas')).toHaveCount(0);
    await expect(page.locator('[data-badge]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('keeps the placeholder when the scene fails to start', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      let probes = 0;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        kind: string,
        ...args: unknown[]
      ) {
        if (kind.includes('webgl') && probes++ > 0) return null;
        return (original as (...a: unknown[]) => unknown).call(
          this,
          kind,
          ...args,
        );
      } as typeof original;
    });
    await page.goto('/');
    await page.waitForTimeout(4000);
    await expect(page.locator('[data-badge]')).toBeVisible();
    await expect(page.locator('#badge-slot')).not.toHaveAttribute(
      'data-badge-3d',
    );
    expect(errors).toEqual([]);
  });
});
