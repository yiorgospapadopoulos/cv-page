import { stat } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { profile } from '../src/content/profile';

const { footer, links, meta } = profile;
const cvFile = footer.cvPath.slice(1);

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
});

test.describe('footer', () => {
  test('shows the closing heading, sentence, and bottom line', async ({
    page,
  }) => {
    const footerEl = page.locator('footer');
    const heading = footerEl.getByRole('heading', { level: 2 });
    await heading.scrollIntoViewIfNeeded();
    await expect(heading).toHaveText(footer.closing);
    await expect(heading).toBeVisible();
    await expect(footerEl.locator('.text')).toHaveText(
      "I'd love to hear from you. Connect on LinkedIn, see my code on GitHub, or send me an email.",
    );
    await expect(footerEl.getByText(footer.copyright)).toBeVisible();
    await expect(footerEl.getByText(/built with/i)).toHaveCount(0);
  });

  test('has pill links with the right href, target, and rel', async ({
    page,
  }) => {
    const footerEl = page.locator('footer');
    const external = [
      ['LinkedIn', links.linkedinUrl],
      ['GitHub', links.githubUrl],
    ] as const;
    for (const [name, href] of external) {
      const pill = footerEl.getByRole('link', { name, exact: true });
      await expect(pill).toHaveAttribute('href', href);
      await expect(pill).toHaveAttribute('target', '_blank');
      await expect(pill).toHaveAttribute('rel', 'noopener noreferrer');
    }
    const email = footerEl.getByRole('link', { name: 'email', exact: true });
    await expect(email).toHaveAttribute('href', `mailto:${links.email}`);
    await expect(email).not.toHaveAttribute('target', /.+/);
  });

  test('colours the pills with the link tokens and white text', async ({
    page,
  }) => {
    const colours = await page.evaluate(() => {
      const read = (selector: string) => {
        const style = getComputedStyle(document.querySelector(selector)!);
        return [style.backgroundColor, style.color];
      };
      return {
        linkedin: read('footer .pill.linkedin'),
        github: read('footer .pill.github'),
        email: read('footer .pill.email'),
      };
    });
    expect(colours).toEqual({
      linkedin: ['rgb(10, 102, 194)', 'rgb(255, 255, 255)'],
      github: ['rgb(17, 17, 17)', 'rgb(255, 255, 255)'],
      email: ['rgb(194, 65, 12)', 'rgb(255, 255, 255)'],
    });
  });

  test('downloads the CV as a non-empty PDF', async ({ page }) => {
    const link = page.locator('footer').getByRole('link', {
      name: footer.cvLabel,
    });
    await expect(link).toHaveAttribute('href', footer.cvPath);
    await expect(link).toHaveAttribute('download', '');
    const downloadPromise = page.waitForEvent('download');
    await link.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(cvFile);
    const path = await download.path();
    const { size } = await stat(path);
    expect(size).toBeGreaterThan(0);
    expect(await download.failure()).toBeNull();
  });

  test('serves the PDF with the right type', async ({ request }) => {
    const response = await request.get(footer.cvPath);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
    expect((await response.body()).subarray(0, 4).toString()).toBe('%PDF');
  });
});

test.describe('metadata', () => {
  test('has a description, social tags, theme color, and favicon', async ({
    page,
  }) => {
    const content = (selector: string) =>
      page.locator(selector).getAttribute('content');
    await expect(page).toHaveTitle(meta.title);
    expect(await content('meta[name="description"]')).toBe(meta.description);
    expect(await content('meta[property="og:title"]')).toBe(meta.title);
    expect(await content('meta[property="og:description"]')).toBe(
      meta.description,
    );
    expect(await content('meta[property="og:type"]')).toBe('website');
    expect(await content('meta[property="og:image"]')).toBe(
      'https://yiorgospapadopoulos.dev/og.png',
    );
    expect(await content('meta[property="og:url"]')).toBe(
      'https://yiorgospapadopoulos.dev/',
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://yiorgospapadopoulos.dev/',
    );
    expect(await content('meta[name="twitter:card"]')).toBe(
      'summary_large_image',
    );
    expect(await content('meta[name="twitter:title"]')).toBe(meta.title);
    expect(await content('meta[name="twitter:image"]')).toBe(
      'https://yiorgospapadopoulos.dev/og.png',
    );
    expect(await content('meta[name="theme-color"]')).toBeTruthy();
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
      'href',
      '/favicon.svg',
    );
  });

  test('serves the favicon and the preview image', async ({ request }) => {
    const favicon = await request.get('/favicon.svg');
    expect(favicon.status()).toBe(200);
    expect(favicon.headers()['content-type']).toContain('image/svg+xml');
    const og = await request.get('/og.png');
    expect(og.status()).toBe(200);
    expect(og.headers()['content-type']).toContain('image/png');
  });
});

test.describe('layout', () => {
  for (const width of [375, 1440]) {
    test(`has no horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('footer').scrollIntoViewIfNeeded();
      const result = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(result.scrollWidth).toBeLessThanOrEqual(result.innerWidth);
    });
  }

  for (const width of [375, 1440]) {
    test(`left-aligns the copyright alone at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const copyright = page.locator('footer .base');
      await expect(copyright).toHaveText(footer.copyright);
      await expect(page.locator('footer .base ~ *')).toHaveCount(0);
      const left = await page.locator('footer .inner').evaluate((el) => {
        const { left } = el.getBoundingClientRect();
        return left + parseFloat(getComputedStyle(el).paddingLeft);
      });
      const box = await copyright.boundingBox();
      expect(box!.x).toBeCloseTo(left, 0);
    });
  }
});
