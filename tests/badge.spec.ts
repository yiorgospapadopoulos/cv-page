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

interface Pose {
  x: number;
  y: number;
  angle: number;
}

async function pose(page: Page): Promise<Pose> {
  const hero = await page.locator('header.hero').boundingBox();
  const local = await page
    .locator('#badge-slot .badge-hit')
    .evaluate((el: HTMLElement) => ({
      x: Number(el.dataset.x),
      y: Number(el.dataset.y),
      angle: Number(el.dataset.angle),
    }));
  return { ...local, x: local.x + hero!.x, y: local.y + hero!.y };
}

async function atRest(page: Page): Promise<Pose> {
  let previous = await pose(page);
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(250);
        const next = await pose(page);
        const moved = Math.hypot(next.x - previous.x, next.y - previous.y);
        previous = next;
        return moved;
      },
      { timeout: 15_000 },
    )
    .toBeLessThan(1);
  return previous;
}

interface Sample {
  t: number;
  x: number;
  y: number;
}

// Records the projected card centre every frame, in hero coordinates.
function track(page: Page, ms: number): Promise<Sample[]> {
  return page.locator('#badge-slot .badge-hit').evaluate(
    (el: HTMLElement, duration) =>
      new Promise<Sample[]>((resolve) => {
        const samples: Sample[] = [];
        const start = performance.now();
        const step = () => {
          const t = performance.now() - start;
          samples.push({ t, x: Number(el.dataset.x), y: Number(el.dataset.y) });
          if (t < duration) requestAnimationFrame(step);
          else resolve(samples);
        };
        requestAnimationFrame(step);
      }),
    ms,
  );
}

function peakSpeed(samples: Sample[]): number {
  let peak = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const dt = (b.t - a.t) / 1000;
    if (dt > 0) peak = Math.max(peak, Math.hypot(b.x - a.x, b.y - a.y) / dt);
  }
  return peak;
}

async function heroOrigin(page: Page) {
  const hero = await page.locator('header.hero').boundingBox();
  return { x: hero!.x, y: hero!.y };
}

async function moveTo(page: Page, x: number, y: number, steps = 20) {
  await page.mouse.move(x, y, { steps });
  await page.waitForTimeout(700);
}

function chromiumDesktop(browserName: string, isMobile: boolean) {
  test.skip(
    browserName !== 'chromium' || isMobile,
    'Pose checks run on desktop Chromium',
  );
}

test.describe('3d badge', () => {
  test('replaces the placeholder with a canvas over the whole hero', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await waitForBadge(page);
    await expect(page.locator('#badge-slot canvas')).toHaveCount(1);
    await expect(page.locator('#badge-slot .badge-3d')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    await expect(page.locator('[data-badge]')).toBeHidden();
    const [canvas, hero] = await Promise.all([
      page.locator('#badge-slot canvas').boundingBox(),
      page.locator('header.hero').boundingBox(),
    ]);
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(canvas![key] - hero![key])).toBeLessThan(1);
    }
    const events = await page
      .locator('#badge-slot canvas')
      .evaluate((el) => getComputedStyle(el).pointerEvents);
    expect(events).toBe('none');
    expect(errors).toEqual([]);
  });

  test('can be dragged and released', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await waitForBadge(page);
    const rest = await atRest(page);

    const frame = page.locator('#badge-slot .badge-frame');
    const before = await frame.screenshot();
    await page.mouse.move(rest.x, rest.y);
    await page.mouse.down();
    await moveTo(page, rest.x + 40, rest.y + 60, 10);
    const during = await frame.screenshot();
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await frame.screenshot();

    expect(during.equals(before)).toBe(false);
    expect(after.equals(during)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('follows the pointer to both edges and back', async ({
    page,
    browserName,
    isMobile,
  }) => {
    chromiumDesktop(browserName, isMobile);
    const errors = collectErrors(page);
    await page.goto('/');
    await waitForBadge(page);
    const rest = await atRest(page);
    const width = page.viewportSize()!.width;
    const y = rest.y - 60;

    await page.mouse.move(rest.x, y);
    await page.mouse.down();
    for (const x of [width * 0.05, width * 0.95]) {
      await moveTo(page, x, y);
      const held = await pose(page);
      const away = Math.abs(rest.x - x);
      expect(Math.abs(held.x - rest.x)).toBeGreaterThan(away * 0.4);
      expect(Math.hypot(held.x - x, held.y - y)).toBeLessThan(away * 0.6);
    }
    await moveTo(page, rest.x, y);
    const back = await pose(page);
    expect(Math.hypot(back.x - rest.x, back.y - rest.y)).toBeLessThan(80);
    await page.mouse.up();
    expect(errors).toEqual([]);
  });

  test('swings rather than translating rigidly', async ({
    page,
    browserName,
    isMobile,
  }) => {
    chromiumDesktop(browserName, isMobile);
    await page.goto('/');
    await waitForBadge(page);
    const rest = await atRest(page);
    expect(Math.abs(rest.angle)).toBeLessThan(5);

    await page.mouse.move(rest.x, rest.y - 60);
    await page.mouse.down();
    let widest = 0;
    for (let step = 1; step <= 8; step++) {
      await page.mouse.move(rest.x + step * 45, rest.y - 60);
      widest = Math.max(widest, Math.abs((await pose(page)).angle));
    }
    await page.mouse.up();
    expect(widest).toBeGreaterThan(15);
  });

  test('settles back near its rest position after release', async ({
    page,
    browserName,
    isMobile,
  }) => {
    chromiumDesktop(browserName, isMobile);
    await page.goto('/');
    await waitForBadge(page);
    const rest = await atRest(page);

    await page.mouse.move(rest.x, rest.y);
    await page.mouse.down();
    await moveTo(page, rest.x - 250, rest.y - 40, 15);
    await page.mouse.up();
    const settled = await atRest(page);
    expect(Math.hypot(settled.x - rest.x, settled.y - rest.y)).toBeLessThan(20);
    expect(Math.abs(settled.angle)).toBeLessThan(6);
  });

  test('drops back gently after being pulled straight down', async ({
    page,
    browserName,
    isMobile,
  }) => {
    chromiumDesktop(browserName, isMobile);
    await page.goto('/');
    await waitForBadge(page);
    const rest = await atRest(page);
    const origin = await heroOrigin(page);

    await page.mouse.move(rest.x, rest.y);
    await page.mouse.down();
    await moveTo(page, rest.x, rest.y + 150, 15);
    const held = await pose(page);
    expect(held.y - rest.y).toBeGreaterThan(30);
    const recording = track(page, 3000);
    await page.mouse.up();
    const samples = await recording;

    const restY = rest.y - origin.y;
    const highest = Math.min(...samples.map((s) => s.y));
    expect(restY - highest).toBeLessThan(45);
    expect(peakSpeed(samples)).toBeLessThan(1200);
  });

  test('swings a few times after a sideways fling and stays below the anchor', async ({
    page,
    browserName,
    isMobile,
  }) => {
    chromiumDesktop(browserName, isMobile);
    await page.goto('/');
    await waitForBadge(page);
    const rest = await atRest(page);
    const origin = await heroOrigin(page);

    await page.mouse.move(rest.x, rest.y - 60);
    await page.mouse.down();
    for (let step = 1; step <= 10; step++) {
      await page.mouse.move(rest.x + step * 30, rest.y - 60 - step * 2);
      await page.waitForTimeout(16);
    }
    const recording = track(page, 4000);
    await page.mouse.up();
    const samples = await recording;

    const restX = rest.x - origin.x;
    const right = Math.max(...samples.map((s) => s.x - restX));
    const left = Math.min(...samples.map((s) => s.x - restX));
    expect(right).toBeGreaterThan(60);
    expect(left).toBeLessThan(-20);
    expect(Math.min(...samples.map((s) => s.y))).toBeGreaterThan(0);
    expect(peakSpeed(samples)).toBeLessThan(2500);
  });

  test('shows the whole strap label at rest', async ({ page }) => {
    await page.goto('/');
    await waitForBadge(page);
    await atRest(page);
    const strap = await page
      .locator('#badge-slot .badge-hit')
      .evaluate((el: HTMLElement) => ({
        visible: Number(el.dataset.strap),
        top: Number(el.dataset.labelTop),
        bottom: Number(el.dataset.labelBottom),
      }));
    expect(strap.bottom).toBeGreaterThan(0);
    expect(strap.top).toBeGreaterThan(strap.bottom);
    expect(strap.top).toBeLessThanOrEqual(strap.visible);
  });

  test('shows a grab cursor over the card', async ({
    page,
    browserName,
    isMobile,
  }) => {
    chromiumDesktop(browserName, isMobile);
    await page.goto('/');
    await waitForBadge(page);
    const rest = await atRest(page);
    const cursor = () =>
      page
        .locator('#badge-slot .badge-hit')
        .evaluate((el) => getComputedStyle(el).cursor);
    await page.mouse.move(rest.x, rest.y);
    await expect.poll(cursor).toBe('grab');
    await page.mouse.down();
    await page.mouse.move(rest.x + 20, rest.y + 20);
    await expect.poll(cursor).toBe('grabbing');
    await page.mouse.up();
  });

  test('keeps the corner text clickable', async ({ page }) => {
    await page.goto('/');
    await waitForBadge(page);
    await page.getByRole('button', { name: profile.hero.moreLabel }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('keeps the corner text selectable', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Mouse selection runs on desktop');
    await page.goto('/');
    await waitForBadge(page);
    const box = await page.locator('.current').boundingBox();
    await page.mouse.move(box!.x + 2, box!.y + 4);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width - 2, box!.y + box!.height - 4, {
      steps: 8,
    });
    await page.mouse.up();
    const selected = await page.evaluate(() => String(window.getSelection()));
    expect(selected).toContain(profile.hero.current[0]!.split(' @ ')[0]);
  });

  test('a touch drag on the card does not scroll, a swipe on the name does', async ({
    page,
    browserName,
    isMobile,
  }) => {
    test.skip(
      browserName !== 'chromium' || !isMobile,
      'Touch input runs on the Chromium phone',
    );
    await page.goto('/');
    await waitForBadge(page);
    const rest = await atRest(page);
    const cdp = await page.context().newCDPSession(page);
    const swipe = async (x: number, y: number) => {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y }],
      });
      for (let step = 1; step <= 10; step++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x + step * 6, y: y - step * 20 }],
        });
        await page.waitForTimeout(16);
      }
      await page.waitForTimeout(200);
      const during = await pose(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await page.waitForTimeout(400);
      return during;
    };

    const moved = await swipe(rest.x, rest.y);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(Math.hypot(moved.x - rest.x, moved.y - rest.y)).toBeGreaterThan(40);

    const name = await page.locator('h1').boundingBox();
    await swipe(name!.x + 40, name!.y + name!.height / 2);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(50);
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
