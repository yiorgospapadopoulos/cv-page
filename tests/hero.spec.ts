import { expect, test, type Page } from '@playwright/test';
import { profile } from '../src/content/profile';
import { hasWebGL } from './support';

const { hero, about } = profile;

test.describe('hero', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows the intro, current lines and both name lines', async ({
    page,
  }) => {
    await expect(page.getByText(hero.intro)).toBeVisible();
    const introduction = page.getByRole('banner');
    for (const line of hero.current) {
      await expect(introduction.getByText(line, { exact: true })).toBeVisible();
    }
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading.getByText('Yiorgos', { exact: true })).toBeVisible();
    await expect(
      heading.getByText('Papadopoulos', { exact: true }),
    ).toBeVisible();
  });

  test('the h1 reads as the full name', async ({ page }) => {
    await expect(
      page.getByRole('heading', { level: 1, name: 'Yiorgos Papadopoulos' }),
    ).toBeVisible();
  });

  test('the giant name nearly fills the width without scrolling', async ({
    page,
  }) => {
    const { right, scrollWidth, innerWidth } = await page.evaluate(() => {
      const spans = [...document.querySelectorAll('h1 span')];
      const widest = Math.max(
        ...spans.map((span) => {
          const range = document.createRange();
          range.selectNodeContents(span);
          return range.getBoundingClientRect().right;
        }),
      );
      return {
        right: widest,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    });
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
    expect(right).toBeGreaterThan(innerWidth * 0.9);
  });

  test('the hero fills the viewport height', async ({ page }) => {
    const heroHeight = await page
      .locator('header.hero')
      .evaluate((el) => el.getBoundingClientRect().height);
    const viewport = page.viewportSize();
    expect(heroHeight).toBeGreaterThanOrEqual((viewport?.height ?? 0) - 1);
  });
});

test.describe('more dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('opens by click and closes with the close button', async ({ page }) => {
    const trigger = page.getByRole('button', { name: hero.moreLabel });
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeHidden();

    await trigger.click();
    await expect(dialog).toBeVisible();
    for (const paragraph of about.paragraphs) {
      await expect(dialog.getByText(paragraph)).toBeVisible();
    }
    for (const language of about.languages) {
      await expect(dialog.getByText(language.name)).toBeVisible();
      await expect(dialog.getByText(language.level)).toBeVisible();
    }

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('opens by keyboard, traps focus, and closes with Escape', async ({
    page,
  }) => {
    const trigger = page.getByRole('button', { name: hero.moreLabel });
    await trigger.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();

    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const focusInside = await page.evaluate(() =>
      document.querySelector('dialog')?.contains(document.activeElement),
    );
    expect(focusInside).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('closes on a backdrop click and returns focus', async ({ page }) => {
    const trigger = page.getByRole('button', { name: hero.moreLabel });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.mouse.click(2, 2);
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('stays open when the dialog content is clicked', async ({ page }) => {
    await page.getByRole('button', { name: hero.moreLabel }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText(about.paragraphs[0]).click();
    await expect(dialog).toBeVisible();
  });
});

const disableWebGL = () => {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    kind: string,
    ...args: unknown[]
  ) {
    if (kind.includes('webgl')) return null;
    return (original as (...a: unknown[]) => unknown).call(this, kind, ...args);
  } as typeof original;
};

test.describe('badge placeholder', () => {
  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('is visible and clear of the intro block', async ({ page }) => {
      await page.goto('/');
      const card = page.locator('#badge-slot .card');
      await expect(card).toBeVisible();

      const [cardBox, introBox] = await Promise.all([
        card.boundingBox(),
        page.locator('.intro').boundingBox(),
      ]);
      expect(cardBox).not.toBeNull();
      expect(introBox).not.toBeNull();
      expect(intersects(cardBox!, introBox!)).toBe(false);
    });

    test('has no running animation', async ({ page }) => {
      await page.goto('/');
      const running = await page
        .locator('[data-badge]')
        .evaluate((el) => el.getAnimations().length);
      expect(running).toBe(0);
    });
  });

  test('sways when the 3d badge is unavailable', async ({ page }) => {
    await page.addInitScript(disableWebGL);
    await page.goto('/');
    await expect(page.locator('[data-badge]')).toBeVisible();
    const running = await page
      .locator('[data-badge]')
      .evaluate((el) => el.getAnimations().length);
    expect(running).toBeGreaterThan(0);
  });
});

type Box = { x: number; y: number; width: number; height: number };

function intersects(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

async function box(page: Page, selector: string): Promise<Box> {
  const found = await page.locator(selector).first().boundingBox();
  expect(found, selector).not.toBeNull();
  return found!;
}

const sizes = [
  { name: 'native', size: null },
  { name: '375x812', size: { width: 375, height: 812 } },
  { name: '800x600', size: { width: 800, height: 600 } },
  { name: '1440x900', size: { width: 1440, height: 900 } },
] as const;

for (const motion of ['no-preference', 'reduce'] as const) {
  for (const { name, size } of sizes) {
    test(`layout has no overlaps (${name}, motion ${motion})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: motion });
      if (size) await page.setViewportSize(size);
      await page.goto('/');
      const threeD = motion === 'no-preference' && (await hasWebGL(page));
      if (threeD) {
        await expect(page.locator('#badge-slot')).toHaveAttribute(
          'data-badge-3d',
          'ready',
          { timeout: 20_000 },
        );
      }

      const viewportWidth = await page.evaluate(() => window.innerWidth);
      const [intro, current, name1, name2, h1] = await Promise.all([
        box(page, '.intro'),
        box(page, '.current'),
        box(page, 'h1 span:nth-child(1)'),
        box(page, 'h1 span:nth-child(2)'),
        box(page, 'h1'),
      ]);

      if (threeD) {
        const parts = [await box(page, '#badge-slot .badge-frame')];
        if ((await page.locator('#badge-slot .badge-stub').count()) > 0) {
          parts.push(await box(page, '#badge-slot .badge-stub'));
        }
        for (const part of parts) {
          expect(intersects(part, intro)).toBe(false);
          expect(intersects(part, current)).toBe(false);
        }
      } else {
        const [strap, card] = await Promise.all([
          box(page, '#badge-slot .strap'),
          box(page, '#badge-slot .card'),
        ]);
        for (const part of [strap, card]) {
          expect(intersects(part, intro)).toBe(false);
          expect(intersects(part, current)).toBe(false);
        }
        expect(intersects(strap, h1)).toBe(false);
        expect(intersects(card, name2)).toBe(false);
        if (viewportWidth < 860) {
          expect(intersects(card, name1)).toBe(false);
        }
      }
      expect(intersects(intro, current)).toBe(false);

      for (const text of [intro, current]) {
        expect(text.x).toBeGreaterThanOrEqual(0);
        expect(text.x + text.width).toBeLessThanOrEqual(viewportWidth);
      }
    });
  }
}

test('each role line stays on one line on wide screens', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Only wide screens keep each role on one line');
  await page.goto('/');
  const heights = await page
    .locator('.current li')
    .evaluateAll((items) =>
      items.map((li) => Math.round(li.getBoundingClientRect().height)),
    );
  expect(new Set(heights).size).toBe(1);
  expect(heights[0]).toBeLessThan(24);
});

test('the company stays together on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const orgHeights = await page
    .locator('.current .org')
    .evaluateAll((items) => items.map((el) => el.getClientRects().length));
  expect(orgHeights.every((count) => count === 1)).toBe(true);
});
