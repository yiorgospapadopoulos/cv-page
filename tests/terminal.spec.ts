import { expect, test, type Page } from '@playwright/test';
import { profile } from '../src/content/profile';
import { terminalSections } from '../src/lib/terminal';

const { projects, experience, stackGroups } = profile;
const thesis = projects.find((project) => project.slug === 'thesis')!;

async function expectAllContentVisible(page: Page) {
  for (const { id, heading } of terminalSections) {
    const title = page.getByRole('heading', { level: 2, name: heading });
    await title.scrollIntoViewIfNeeded();
    await expect(title).toBeVisible();
    await expect(page.locator(`#${id}`)).toBeVisible();
  }

  for (const project of projects) {
    const article = page.locator(`[data-project="${project.slug}"]`);
    await article.scrollIntoViewIfNeeded();
    await expect(
      article.getByRole('heading', { level: 3, name: project.title }),
    ).toBeVisible();
    for (const metric of project.metrics) {
      await expect(
        article.getByText(`[ ${metric} ]`, { exact: true }),
      ).toBeVisible();
    }
  }

  const experienceSection = page.locator('#experience');
  for (const entry of experience) {
    const role = experienceSection.getByText(entry.role);
    await role.scrollIntoViewIfNeeded();
    await expect(role).toBeVisible();
  }

  const stack = page.locator('#stack');
  for (const group of stackGroups) {
    for (const item of group.items) {
      const found = stack.getByText(item, { exact: true }).first();
      await found.scrollIntoViewIfNeeded();
      await expect(found).toBeVisible();
    }
  }
}

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('shows every section, project, metric, role and stack item', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('html')).not.toHaveClass(/typing/);
    await expectAllContentVisible(page);
  });

  test('shows the full command lines at once', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#projects [data-cmd]').first()).toHaveText(
      'ls projects/',
    );
    await expect(page.locator('#experience [data-cmd]')).toHaveText(
      'git log --author="Yiorgos"',
    );
    await expect(page.locator('.cursor')).toHaveCount(0);
  });
});

test.describe('with motion allowed', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('hides a terminal until it scrolls into view, then types it once', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/typing/);
    await expect(page.locator('#stack [data-block]')).toHaveCSS('opacity', '0');

    await page
      .locator('#projects [data-cmd-line]')
      .first()
      .scrollIntoViewIfNeeded();
    await expect(page.locator('#projects [data-cmd]').first()).toHaveText(
      'ls projects/',
    );
    await expect(
      page.locator(`[data-project="${thesis.slug}"]`).locator('xpath=..'),
    ).toHaveCSS('opacity', '1');
    await expect(
      page.getByRole('heading', { level: 3, name: thesis.title }),
    ).toBeVisible();

    await page.locator('#education [data-cmd-line]').scrollIntoViewIfNeeded();
    await expect(page.locator('#education [data-cmd]')).toHaveText(
      'cat education.md',
    );
    await expect(page.locator('#education .out')).toHaveCSS('opacity', '1');

    await page
      .locator('#projects [data-cmd-line]')
      .first()
      .scrollIntoViewIfNeeded();
    await expect(page.locator('#projects [data-cmd]').first()).toHaveText(
      'ls projects/',
    );
    await expect(
      page.locator(`[data-project="${thesis.slug}"]`).locator('xpath=..'),
    ).toHaveCSS('opacity', '1');
    await expect(page.locator('#projects .cursor')).toHaveCount(0);
  });

  test('types the command character by character with a cursor', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const seen = new Set<string>();
      let cursor = false;
      Object.assign(window, { __seen: seen, __cursor: () => cursor });
      new MutationObserver(() => {
        const command = document.querySelector('#about [data-cmd]');
        if (command) seen.add(command.textContent ?? '');
        if (document.querySelector('#about .cursor')) cursor = true;
      }).observe(document, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    });
    await page.goto('/');
    await page.locator('#about [data-cmd-line]').scrollIntoViewIfNeeded();
    await expect(page.locator('#about .out')).toHaveCSS('opacity', '1');
    await expect(page.locator('#about .cursor')).toHaveCount(0);

    const result = await page.evaluate(() => {
      const w = window as unknown as {
        __seen: Set<string>;
        __cursor: () => boolean;
      };
      return { seen: [...w.__seen], cursor: w.__cursor() };
    });
    expect(result.seen).toEqual(
      expect.arrayContaining(['', 'w', 'who', 'whoami']),
    );
    expect(result.cursor).toBe(true);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('shows all content', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).not.toHaveClass(/typing/);
    await expectAllContentVisible(page);
    await expect(page.locator('#about [data-cmd]')).toHaveText('whoami');
  });
});

test.describe('layout', () => {
  test.use({ reducedMotion: 'reduce' });

  for (const width of [375, 800, 1440]) {
    test(`has no horizontal page scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const result = await page.evaluate(() => {
        const wide = [...document.querySelectorAll('.term *')]
          .filter(
            (el) =>
              el.tagName !== 'PRE' &&
              !el.closest('pre') &&
              !el.classList.contains('sr-only') &&
              el.scrollWidth > el.clientWidth + 1 &&
              el.clientWidth > 0,
          )
          .map((el) => el.tagName.toLowerCase() + '.' + el.className);
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          wide,
        };
      });
      expect(result.scrollWidth).toBeLessThanOrEqual(result.innerWidth);
      expect(result.wide).toEqual([]);
    });
  }

  test('puts the sketch beside the text on wide screens and below on narrow', async ({
    page,
  }) => {
    const sketch = page.locator('[data-project="thesis"] .sketch');
    const text = page.locator('[data-project="thesis"] .text');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const [wideSketch, wideText] = [
      await sketch.boundingBox(),
      await text.boundingBox(),
    ];
    expect(wideSketch!.x).toBeGreaterThanOrEqual(wideText!.x + wideText!.width);

    await page.setViewportSize({ width: 800, height: 900 });
    const [narrowSketch, narrowText] = [
      await sketch.boundingBox(),
      await text.boundingBox(),
    ];
    expect(narrowSketch!.y).toBeGreaterThanOrEqual(
      narrowText!.y + narrowText!.height,
    );
  });
});

test('the thesis repository link opens safely in a new tab', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const link = page.getByRole('link', { name: thesis.repoLabel });
  await expect(link).toHaveAttribute('href', thesis.repoUrl!);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
});
