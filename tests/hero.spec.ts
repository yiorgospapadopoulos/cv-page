import { devices, expect, test, type Page } from '@playwright/test';
import { profile } from '../src/content/profile';
import { grabPadding } from '../src/lib/badge/grab';
import {
  badgeLoadSamples,
  hasWebGL,
  isNarrow,
  recordBadgeLoad,
} from './support';

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
      await expect(
        introduction.locator('ul.current').getByText(line, { exact: true }),
      ).toBeVisible();
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

  for (const width of [375, 390, 800, 1280, 1440]) {
    test(`the giant name stays inside the viewport at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const { box, ink, innerWidth } = await page.evaluate(async () => {
        const spans = [...document.querySelectorAll('h1 span')];
        const last = spans[spans.length - 1]!;
        const style = getComputedStyle(last);
        await document.fonts.load(
          `${style.fontWeight} 100px ${style.fontFamily}`,
        );
        const size = parseFloat(style.fontSize);
        const spacing = parseFloat(style.letterSpacing);

        const box = Math.max(
          ...spans.map((span) => {
            const range = document.createRange();
            range.selectNodeContents(span);
            return range.getBoundingClientRect().right;
          }),
        );

        const reference = 400;
        const context = document.createElement('canvas').getContext('2d')!;
        context.font = `${style.fontWeight} ${reference}px ${style.fontFamily}`;
        const glyph = context.measureText(last.textContent!.slice(-1));
        const overhang =
          ((glyph.actualBoundingBoxRight - glyph.width) / reference) * size;
        const range = document.createRange();
        range.selectNodeContents(last);
        const advanceEnd = range.getBoundingClientRect().right - spacing;
        return {
          box,
          ink: advanceEnd + overhang,
          innerWidth: window.innerWidth,
        };
      });
      expect(box).toBeLessThanOrEqual(innerWidth - 1);
      expect(ink).toBeLessThanOrEqual(innerWidth - 1);
    });
  }

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
      await expect(dialog.getByText(language, { exact: true })).toBeVisible();
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

    test('puts the university on its own line below the degree', async ({
      page,
    }) => {
      await page.goto('/');
      const layout = await page
        .locator('#badge-slot .card')
        .evaluate((card) => {
          card.closest<HTMLElement>('[data-badge]')!.style.transform = 'none';
          (card as HTMLElement).style.rotate = 'none';
          const line = card.querySelector('.card-line')!;
          const org = line.querySelector('.nowrap')!;
          const head = document.createRange();
          head.selectNodeContents(line.firstChild!);
          const top = (el: Element | Range) => el.getBoundingClientRect().top;
          return {
            orgLines: org.getClientRects().length,
            orgBelowHead: top(org) - top(head),
            org: org.textContent,
            chipsGap:
              top(card.querySelector('.chips')!) -
              org.getBoundingClientRect().bottom,
            passGap:
              top(card.querySelector('.card-pass')!) -
              card.querySelector('.chips')!.getBoundingClientRect().bottom,
          };
        });
      expect(layout.org).toBe('@ University of Thessaly');
      expect(layout.orgLines).toBe(1);
      expect(layout.orgBelowHead).toBeGreaterThan(5);
      expect(layout.chipsGap).toBeGreaterThan(5);
      expect(layout.passGap).toBeGreaterThan(20);
    });

    test('has no running animation', async ({ page }) => {
      await page.goto('/');
      const running = await page
        .locator('[data-badge]')
        .evaluate((el) => el.getAnimations().length);
      expect(running).toBe(0);
    });
  });

  test('has no layer hint on wide screens', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('[data-badge]')).toHaveCSS('will-change', 'auto');
  });

  test('stays hidden from the first paint until the 3d badge is ready', async ({
    page,
  }) => {
    await recordBadgeLoad(page);
    await page.goto('/');
    test.skip(await isNarrow(page), 'Narrow viewports show the phone card');
    test.skip(!(await hasWebGL(page)), 'WebGL is unavailable in this engine');
    await expect(page.locator('#badge-slot')).toHaveAttribute(
      'data-badge-3d',
      'ready',
      { timeout: 20_000 },
    );
    const samples = await badgeLoadSamples(page);
    const before = samples.filter((s) => !s.ready);
    expect(before.length).toBeGreaterThan(0);
    expect(before[0]!.load).toBe('pending');
    expect(before.filter((s) => s.shown)).toEqual([]);
    await expect(page.locator('html')).toHaveAttribute(
      'data-badge-load',
      'ready',
    );
    await expect(page.locator('[data-badge]')).toBeHidden();
  });

  test('is visible from the first paint on narrow screens', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 600, height: 900 });
    await recordBadgeLoad(page);
    await page.goto('/');
    await page.waitForTimeout(500);
    const samples = await badgeLoadSamples(page);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every((s) => s.shown && s.opacity === 1)).toBe(true);
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-badge-load',
      'pending',
    );
  });

  test('sways when the 3d badge is unavailable', async ({ page }) => {
    await page.addInitScript(disableWebGL);
    await page.goto('/');
    test.skip(await isNarrow(page), 'Narrow viewports tilt with scroll');
    await expect(page.locator('[data-badge]')).toBeVisible();
    await expect(page.locator('[data-badge]')).toHaveCSS('opacity', '1');
    const running = await page
      .locator('[data-badge]')
      .evaluate(
        (el) =>
          el.getAnimations().filter((a) => a instanceof CSSAnimation).length,
      );
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
  { name: '800x1000', size: { width: 800, height: 1000 } },
  { name: '1280x720', size: { width: 1280, height: 720 } },
  { name: '1280x800', size: { width: 1280, height: 800 } },
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
      const threeD =
        motion === 'no-preference' &&
        !(await isNarrow(page)) &&
        (await hasWebGL(page));
      if (threeD) {
        await expect(page.locator('#badge-slot')).toHaveAttribute(
          'data-badge-3d',
          'ready',
          { timeout: 20_000 },
        );
      }

      const viewportWidth = await page.evaluate(() => window.innerWidth);
      const [intro, current, name2, h1] = await Promise.all([
        box(page, '.intro'),
        box(page, '.current'),
        box(page, 'h1 span:nth-child(2)'),
        box(page, 'h1'),
      ]);

      if (threeD) {
        const [canvas, hero] = await Promise.all([
          box(page, '#badge-slot canvas'),
          box(page, 'header.hero'),
        ]);
        for (const key of ['x', 'y', 'width', 'height'] as const) {
          expect(Math.abs(canvas[key] - hero[key])).toBeLessThan(1);
        }
        await page.waitForTimeout(4000);
        const hit = await box(page, '#badge-slot .badge-hit');
        const card = {
          x: hit.x + grabPadding,
          y: hit.y + grabPadding,
          width: hit.width - 2 * grabPadding,
          height: hit.height - 2 * grabPadding,
        };
        expect(intersects(card, intro)).toBe(false);
        expect(intersects(card, current)).toBe(false);
        expect(intersects(card, name2)).toBe(false);
        const label = await page
          .locator('#badge-slot .badge-hit')
          .evaluate((el: HTMLElement) => ({
            visible: Number(el.dataset.strap),
            top: Number(el.dataset.labelTop),
            bottom: Number(el.dataset.labelBottom),
          }));
        expect(label.bottom).toBeGreaterThan(0);
        expect(label.top).toBeLessThanOrEqual(label.visible);
      } else if (await isNarrow(page)) {
        const [holder, card] = await Promise.all([
          box(page, '#badge-slot [data-badge]'),
          box(page, '#badge-slot .card'),
        ]);
        expect(intersects(holder, intro)).toBe(false);
        expect(intersects(holder, current)).toBe(false);
        expect(intersects(card, name2)).toBe(false);
        expect(holder.x).toBeGreaterThanOrEqual(0);
        expect(holder.x + holder.width).toBeLessThanOrEqual(viewportWidth);
      } else {
        const [strap, text, card] = await Promise.all([
          box(page, '#badge-slot .strap'),
          box(page, '#badge-slot .strap-text'),
          box(page, '#badge-slot .card'),
        ]);
        for (const part of [strap, card]) {
          expect(intersects(part, intro)).toBe(false);
          expect(intersects(part, current)).toBe(false);
        }
        expect(intersects(strap, h1)).toBe(false);
        expect(intersects(card, name2)).toBe(false);
        expect(text.y).toBeGreaterThanOrEqual(Math.max(strap.y, 0));
        expect(text.y + text.height).toBeLessThanOrEqual(
          strap.y + strap.height,
        );
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

test('the corner text sits lower and inward on wide screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const [intro, current] = await Promise.all([
    box(page, '.intro'),
    box(page, '.current'),
  ]);
  expect(intro.y).toBeGreaterThanOrEqual(72);
  expect(intro.x).toBeGreaterThanOrEqual(80);
  expect(1440 - (current.x + current.width)).toBeGreaterThanOrEqual(80);
  const size = await page
    .locator('.intro')
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(15);
});

test('the corner text keeps a side gutter on phones', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  for (const selector of ['.intro', '.current']) {
    const text = await box(page, selector);
    expect(text.x).toBeGreaterThanOrEqual(16);
    expect(320 - (text.x + text.width)).toBeGreaterThanOrEqual(16);
  }
});

test.describe('phone hero while the browser toolbar hides and shows', () => {
  const phones = { chromium: devices['Pixel 7'], webkit: devices['iPhone 13'] };

  async function phoneLayout(page: Page) {
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    return page.evaluate(() => {
      const rect = (selector: string) =>
        document.querySelector(selector)!.getBoundingClientRect();
      const card = rect('#badge-slot .card');
      return {
        cardWidth: card.width,
        cardHeight: card.height,
        nameTop: rect('h1.name').top + window.scrollY,
        heroHeight: rect('header.hero').height,
      };
    });
  }

  test('keeps the card size and the name in place', async ({
    browser,
    browserName,
  }) => {
    const device = phones[browserName as keyof typeof phones] ?? {};
    const width = device.viewport?.width ?? 390;
    const context = await browser.newContext({
      ...device,
      viewport: { width, height: 664 },
    });
    const page = await context.newPage();
    await page.goto('/');
    const before = await phoneLayout(page);
    expect(before.heroHeight).toBeCloseTo(664, 0);

    for (const height of [750, 700, 664, 750]) {
      await page.setViewportSize({ width, height });
      expect(await phoneLayout(page)).toEqual(before);
    }
    await context.close();
  });

  test('measures the height again when the width changes', async ({
    browser,
    browserName,
  }) => {
    const device = phones[browserName as keyof typeof phones] ?? {};
    const width = device.viewport?.width ?? 390;
    const context = await browser.newContext({
      ...device,
      viewport: { width, height: 664 },
    });
    const page = await context.newPage();
    await page.goto('/');
    const before = await phoneLayout(page);

    await page.setViewportSize({ width: width + 40, height: 750 });
    await expect
      .poll(async () => (await phoneLayout(page)).heroHeight)
      .toBeCloseTo(750, 0);
    const after = await phoneLayout(page);
    expect(after.cardWidth).toBeGreaterThan(before.cardWidth + 10);
    await context.close();
  });
});
