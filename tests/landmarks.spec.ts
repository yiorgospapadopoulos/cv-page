import { expect, test, type Page } from '@playwright/test';
import { profile } from '../src/content/profile';
import { skipLink } from '../src/lib/site';

test.use({ reducedMotion: 'reduce' });

// Safari on macOS only tabs to links and buttons with the Option key held.
const tabKey =
  process.platform === 'darwin' ? ['Tab', 'Alt+Tab'] : ['Tab', 'Tab'];

function tab(page: Page, browserName: string): Promise<void> {
  return page.keyboard.press(tabKey[browserName === 'webkit' ? 1 : 0]!);
}

async function headingLevels(page: Page): Promise<number[]> {
  return page
    .locator('h1, h2, h3, h4, h5, h6')
    .evaluateAll((els) => els.map((el) => Number(el.tagName.slice(1))));
}

test.describe('landmarks and headings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('has exactly one banner, main and footer landmark', async ({ page }) => {
    await expect(page.getByRole('banner')).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('contentinfo')).toHaveCount(1);
    await expect(
      page.getByRole('banner').getByRole('heading', { level: 1 }),
    ).toHaveCount(1);
    await expect(
      page.getByRole('main').getByRole('heading', { level: 2 }).first(),
    ).toBeAttached();
  });

  test('has one h1 and never skips a heading level', async ({ page }) => {
    const levels = await headingLevels(page);
    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    expect(levels[0]).toBe(1);
    levels.forEach((level, index) => {
      if (index > 0) expect(level).toBeLessThanOrEqual(levels[index - 1]! + 1);
    });
  });

  test('has a document language and a title', async ({ page }) => {
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle(profile.meta.title);
  });
});

test.describe('skip link', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('is the first focusable element and appears on focus', async ({
    page,
    browserName,
  }) => {
    const link = page.getByRole('link', { name: skipLink.label });
    await expect(link).toHaveAttribute('href', `#${skipLink.target}`);
    await expect(link).not.toBeInViewport();

    await tab(page, browserName);
    await expect(link).toBeFocused();
    await expect(link).toBeInViewport({ ratio: 1 });
  });

  test('moves focus to the main content and the next Tab stays inside it', async ({
    page,
    browserName,
  }) => {
    await tab(page, browserName);
    await page.keyboard.press('Enter');

    const main = page.getByRole('main');
    await expect(main).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`#${skipLink.target}$`));

    await tab(page, browserName);
    const inside = await page.evaluate(() =>
      document.querySelector('main')?.contains(document.activeElement),
    );
    expect(inside).toBe(true);
  });

  test('hides again once focus moves on', async ({ page, browserName }) => {
    await tab(page, browserName);
    await tab(page, browserName);
    await expect(
      page.getByRole('link', { name: skipLink.label }),
    ).not.toBeInViewport();
  });
});

test.describe('keyboard use', () => {
  test('Tab reaches the whole page and every stop shows a focus indicator', async ({
    page,
    browserName,
  }) => {
    await page.goto('/');
    const stops: Array<{ name: string; ok: boolean }> = [];
    for (let i = 0; i < 80; i++) {
      await tab(page, browserName);
      const stop = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const style = getComputedStyle(el);
        return {
          name: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '',
          ok:
            el instanceof HTMLInputElement ||
            (style.outlineStyle !== 'none' &&
              parseFloat(style.outlineWidth) > 0),
        };
      });
      stops.push(stop);
      if (stop.name.includes(profile.footer.cvLabel)) break;
    }
    const names = stops.map((stop) => stop.name);
    expect(names[0]).toBe(skipLink.label);
    expect(names).toContain(profile.hero.moreLabel);
    expect(names).toContain('Terminal command');
    expect(names.at(-1)).toContain(profile.footer.cvLabel);
    expect(stops.filter((stop) => !stop.ok)).toEqual([]);
  });

  test('the prompt works from the keyboard alone', async ({ page }) => {
    await page.goto('/');
    const input = page.getByLabel('Terminal command');
    await input.focus();
    await page.keyboard.type('help');
    await page.keyboard.press('Enter');
    await expect(page.locator('#try [data-log]')).toContainText(
      profile.commands[0].description,
    );

    const button = page.getByRole('button', { name: /^whoami/ });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#try [data-log]')).toContainText(
      `${'yiorgos@papadopoulos:~$'} whoami`,
    );
    await expect(button).toBeFocused();
  });
});
