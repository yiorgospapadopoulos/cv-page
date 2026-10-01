import { expect, test } from '@playwright/test';
import { profile } from '../src/content/profile';

const { hero, about } = profile;

test.describe('hero', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows the intro, current lines and both name lines', async ({
    page,
  }) => {
    await expect(page.getByText(hero.intro)).toBeVisible();
    for (const line of hero.current) {
      await expect(page.getByText(line, { exact: true })).toBeVisible();
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
      .locator('section.hero')
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

test.describe('badge placeholder', () => {
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
    const a = cardBox!;
    const b = introBox!;
    const overlaps =
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y;
    expect(overlaps).toBe(false);
  });

  test('sways by default', async ({ page }) => {
    await page.goto('/');
    const running = await page
      .locator('[data-badge]')
      .evaluate((el) => el.getAnimations().length);
    expect(running).toBeGreaterThan(0);
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('has no running animation', async ({ page }) => {
      await page.goto('/');
      const running = await page
        .locator('[data-badge]')
        .evaluate((el) => el.getAnimations().length);
      expect(running).toBe(0);
    });
  });
});
