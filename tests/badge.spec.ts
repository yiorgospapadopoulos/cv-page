import { expect, test, type Page } from '@playwright/test';
import { profile } from '../src/content/profile';
import { revealAfterMs } from '../src/lib/badge/entrance';
import {
  badgeLoadSamples,
  hasWebGL,
  isNarrow,
  noWebGL,
  recordBadgeLoad,
  sceneChunk,
  staticWhenNarrow,
  type LoadSample,
} from './support';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function waitForBadge(page: Page) {
  test.skip(await isNarrow(page), staticWhenNarrow);
  test.skip(!(await hasWebGL(page)), noWebGL);
  // Software WebGL is slow and the card first drops in before it rests.
  test.setTimeout(60_000);
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
  yaw: number;
  pitch: number;
}

async function pose(page: Page): Promise<Pose> {
  const hero = await page.locator('header.hero').boundingBox();
  const local = await page
    .locator('#badge-slot .badge-hit')
    .evaluate((el: HTMLElement) => ({
      x: Number(el.dataset.x),
      y: Number(el.dataset.y),
      angle: Number(el.dataset.angle),
      yaw: Number(el.dataset.yaw),
      pitch: Number(el.dataset.pitch),
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
  yaw: number;
  pitch: number;
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
          samples.push({
            t,
            x: Number(el.dataset.x),
            y: Number(el.dataset.y),
            yaw: Number(el.dataset.yaw),
            pitch: Number(el.dataset.pitch),
          });
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
    expect(Math.abs(settled.yaw)).toBeLessThan(3);
    expect(Math.abs(settled.pitch)).toBeLessThan(3);
  });

  test('twists and tilts in depth after a high drop, then faces forward', async ({
    page,
    browserName,
    isMobile,
  }) => {
    chromiumDesktop(browserName, isMobile);
    const errors = collectErrors(page);
    await page.goto('/');
    await waitForBadge(page);
    const rest = await atRest(page);
    expect(Math.abs(rest.yaw)).toBeLessThan(3);
    expect(Math.abs(rest.pitch)).toBeLessThan(3);

    await page.mouse.move(rest.x - 40, rest.y - 40);
    await page.mouse.down();
    await moveTo(page, rest.x - 30, rest.y - 340, 15);
    const recording = track(page, 7000);
    await page.mouse.up();
    const samples = await recording;

    const turn = (s: Sample) => Math.max(Math.abs(s.yaw), Math.abs(s.pitch));
    const peak = samples.reduce(
      (i, s, j) => (turn(s) > turn(samples[i]!) ? j : i),
      0,
    );
    expect(turn(samples[peak]!)).toBeGreaterThan(8);
    const back = samples.findIndex((s, i) => i > peak && turn(s) < 3);
    expect(back).toBeGreaterThan(peak);
    const last = samples.at(-1)!;
    expect(Math.abs(last.yaw)).toBeLessThan(3);
    expect(Math.abs(last.pitch)).toBeLessThan(3);
    expect(errors).toEqual([]);
  });

  test('stays facing forward after a quick tap', async ({
    page,
    browserName,
    isMobile,
  }) => {
    chromiumDesktop(browserName, isMobile);
    await page.goto('/');
    await waitForBadge(page);
    const rest = await atRest(page);

    await page.mouse.move(rest.x, rest.y);
    const recording = track(page, 2000);
    await page.mouse.down();
    await page.mouse.up();
    const samples = await recording;
    for (const s of samples) {
      expect(Math.abs(s.yaw)).toBeLessThan(3);
      expect(Math.abs(s.pitch)).toBeLessThan(3);
    }
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

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('keeps the placeholder and creates no canvas', async ({ page }) => {
      await recordBadgeLoad(page);
      await page.goto('/');
      await page.waitForTimeout(1500);
      const samples = await badgeLoadSamples(page);
      expect(samples.every((s) => s.shown && s.load !== 'pending')).toBe(true);
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
    await expect(page.locator('[data-badge]')).toHaveCSS('opacity', '1');
    if (!(await isNarrow(page))) {
      await expect(page.locator('html')).toHaveAttribute(
        'data-badge-load',
        'static',
      );
    }
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
    await expect(page.locator('[data-badge]')).toHaveCSS('opacity', '1');
    await expect(page.locator('#badge-slot')).not.toHaveAttribute(
      'data-badge-3d',
    );
    expect(errors).toEqual([]);
  });
});

function firstShown(samples: LoadSample[]): LoadSample | undefined {
  return samples.find((s) => s.shown);
}

test.describe('badge load sequence', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('drops the card in from above the view and swings it to rest', async ({
    page,
    browserName,
    isMobile,
  }) => {
    chromiumDesktop(browserName, isMobile);
    const errors = collectErrors(page);
    await recordBadgeLoad(page);
    await page.goto('/');
    await waitForBadge(page);
    const rest = await atRest(page);
    const origin = await heroOrigin(page);
    const restX = rest.x - origin.x;
    const restY = rest.y - origin.y;

    const samples = await badgeLoadSamples(page);
    expect(samples.filter((s) => s.shown)).toEqual([]);
    const moving = samples.filter((s) => !Number.isNaN(s.y));
    expect(moving[0]!.y).toBeLessThan(0);
    expect(moving[0]!.y).toBeLessThan(restY - 300);
    const arrived = moving.findIndex((s) => s.y > restY - 20);
    expect(arrived).toBeGreaterThan(0);
    const landing = moving.slice(arrived);
    expect(landing[0]!.t - moving[0]!.t).toBeLessThan(5000);
    expect(Math.max(...landing.map((s) => s.y)) - restY).toBeLessThan(60);
    expect(restY - Math.min(...landing.map((s) => s.y))).toBeLessThan(60);
    const swing = landing.map((s) => s.x - restX);
    expect(Math.max(...swing) - Math.min(...swing)).toBeGreaterThan(30);
    expect(Math.max(...swing.map(Math.abs))).toBeLessThan(200);
    expect(Math.abs(rest.yaw)).toBeLessThan(3);
    expect(Math.abs(rest.pitch)).toBeLessThan(3);
    expect(errors).toEqual([]);
  });

  test('reveals the static badge if the 3d scene never arrives', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.route(sceneChunk, () => {});
    await recordBadgeLoad(page);
    await page.goto('/');
    test.skip(await isNarrow(page), staticWhenNarrow);
    test.skip(!(await hasWebGL(page)), noWebGL);
    await expect(page.locator('html')).toHaveAttribute(
      'data-badge-load',
      'static',
      { timeout: revealAfterMs + 4000 },
    );
    await expect(page.locator('[data-badge]')).toHaveCSS('opacity', '1');
    const samples = await badgeLoadSamples(page);
    const shown = firstShown(samples);
    expect(shown!.t).toBeGreaterThan(revealAfterMs - 500);
    expect(samples.some((s) => s.opacity > 0 && s.opacity < 1)).toBe(true);
    await expect(page.locator('#badge-slot canvas')).toHaveCount(0);
  });

  test('reveals the static badge when the 3d scene fails to download', async ({
    page,
  }) => {
    await page.route(sceneChunk, (route) => route.abort());
    await page.goto('/');
    test.skip(await isNarrow(page), staticWhenNarrow);
    test.skip(!(await hasWebGL(page)), noWebGL);
    await expect(page.locator('html')).toHaveAttribute(
      'data-badge-load',
      'static',
      { timeout: revealAfterMs + 2000 },
    );
    await expect(page.locator('[data-badge]')).toBeVisible();
    await expect(page.locator('[data-badge]')).toHaveCSS('opacity', '1');
    await expect(page.locator('#badge-slot canvas')).toHaveCount(0);
  });

  test('crossfades to a resting 3d badge that arrives after the reveal', async ({
    page,
    browserName,
    isMobile,
  }) => {
    chromiumDesktop(browserName, isMobile);
    test.setTimeout(60_000);
    await page.route(/\/_astro\/Scene[.-]/, async (route) => {
      await new Promise((done) => setTimeout(done, revealAfterMs + 1500));
      await route.continue().catch(() => {});
    });
    await recordBadgeLoad(page);
    await page.goto('/');
    await waitForBadge(page);
    await expect(page.locator('[data-badge]')).toBeHidden();
    const rest = await atRest(page);
    const origin = await heroOrigin(page);

    const samples = await badgeLoadSamples(page);
    const shown = firstShown(samples);
    expect(shown!.t).toBeGreaterThan(revealAfterMs - 500);
    expect(shown!.ready).toBe(false);
    const first = samples.find((s) => !Number.isNaN(s.y))!;
    expect(Math.abs(first.y - (rest.y - origin.y))).toBeLessThan(40);
  });
});

async function tiltOf(page: Page): Promise<number> {
  return page.locator('[data-badge]').evaluate((el) => {
    const value = getComputedStyle(el).transform;
    const m = value === 'none' ? new DOMMatrix() : new DOMMatrix(value);
    return (Math.atan2(m.b, m.a) * 180) / Math.PI;
  });
}

async function expectTilt(page: Page, y: number, degrees: number) {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await expect.poll(() => tiltOf(page)).toBeCloseTo(degrees, 1);
}

async function swipeUp(page: Page, x: number, y: number, distance = 220) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  });
  const steps = 8;
  for (let step = 1; step <= steps; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y - (distance * step) / steps }],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}

function phoneCardSuite(onlyDesktopChromium: boolean) {
  test.beforeEach(async ({ page, browserName, isMobile }) => {
    test.skip(
      onlyDesktopChromium && (browserName !== 'chromium' || isMobile),
      'Desktop Chromium',
    );
    await page.goto('/');
    test.skip(!(await isNarrow(page)), 'Only narrow viewports');
  });

  test('shows the card and never creates a canvas', async ({ page }) => {
    const errors = collectErrors(page);
    await page.waitForTimeout(2500);
    await expect(page.locator('[data-badge]')).toBeVisible();
    await expect(page.locator('#badge-slot canvas')).toHaveCount(0);
    await expect(page.locator('#badge-slot .badge-hit')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('lets a swipe on the card scroll the page', async ({
    page,
    hasTouch,
  }) => {
    test.skip(!hasTouch, 'Needs a touch screen');
    const card = await page.locator('#badge-slot .card').boundingBox();
    await swipeUp(
      page,
      card!.x + card!.width / 2,
      card!.y + card!.height / 2,
      200,
    );
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(100);
    const style = await page
      .locator('#badge-slot .card')
      .evaluate((el) => getComputedStyle(el).touchAction);
    expect(style).toBe('auto');
    await expect(page.locator('#badge-slot')).toHaveCSS(
      'pointer-events',
      'none',
    );
  });

  test('has no strap, clip or cord', async ({ page }) => {
    await expect(page.locator('#badge-slot .strap')).toBeHidden();
    await expect(page.locator('#badge-slot .clip')).toBeHidden();
    await expect(page.locator('#badge-slot .strap-text')).toBeHidden();
  });

  test('rests tilted 7 degrees clockwise at the top', async ({ page }) => {
    expect(await tiltOf(page)).toBeCloseTo(7, 1);
  });

  test('turns with the scroll position and back again', async ({ page }) => {
    await expectTilt(page, 300, 1.58);
    await expectTilt(page, 600, -3.84);
    await expectTilt(page, 150, 4.29);
    await expectTilt(page, 0, 7);
  });

  test('stays in place while it turns', async ({ page }) => {
    const before = await page.locator('[data-badge]').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 + window.scrollY };
    });
    await expectTilt(page, 300, 1.58);
    const after = await page.locator('[data-badge]').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 + window.scrollY };
    });
    expect(Math.abs(after.x - before.x)).toBeLessThan(1);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  });

  test('has no running animation', async ({ page }) => {
    const running = await page
      .locator('[data-badge]')
      .evaluate((el) => el.getAnimations().length);
    expect(running).toBe(0);
  });

  test('is wide on a phone and horizontally centred', async ({ page }) => {
    const [holder, viewport] = await Promise.all([
      page.locator('[data-badge]').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { width: el.clientWidth, centre: r.x + r.width / 2 };
      }),
      page.evaluate(() => window.innerWidth),
    ]);
    if (viewport < 500) {
      expect(holder.width / viewport).toBeGreaterThan(0.6);
      expect(holder.width / viewport).toBeLessThanOrEqual(0.81);
    }
    expect(Math.abs(holder.centre - viewport / 2)).toBeLessThan(2);
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('keeps the 7 degree tilt and ignores scrolling', async ({ page }) => {
      expect(await tiltOf(page)).toBeCloseTo(7, 1);
      await page.evaluate(() => window.scrollTo(0, 300));
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => window.scrollY)).toBe(300);
      expect(await tiltOf(page)).toBeCloseTo(7, 1);
    });
  });
}

test.describe('phone card on a touch phone', () => {
  phoneCardSuite(false);
});

test.describe('phone card on a narrow desktop window', () => {
  test.use({ viewport: { width: 600, height: 900 } });
  phoneCardSuite(true);

  test('has the original card style and no holder', async ({
    page,
    browserName,
    isMobile,
  }) => {
    test.skip(browserName !== 'chromium' || isMobile, 'Desktop Chromium');
    await page.goto('/');
    const style = await page.evaluate(() => {
      const badge = document.querySelector<HTMLElement>('[data-badge]')!;
      const card = badge.querySelector<HTMLElement>('.card')!;
      const b = getComputedStyle(badge);
      const c = getComputedStyle(card);
      return {
        holderBorder: b.borderTopWidth,
        holderFill: b.backgroundColor,
        holderShadow: b.boxShadow,
        holderPseudo: [
          getComputedStyle(badge, '::before').content,
          getComputedStyle(badge, '::after').content,
        ],
        radius: parseFloat(c.borderTopLeftRadius) / card.offsetWidth,
        border: c.borderTopWidth,
        fill: c.backgroundColor,
        shadow: c.boxShadow,
      };
    });
    expect(style.holderBorder).toBe('0px');
    expect(style.holderFill).toBe('rgba(0, 0, 0, 0)');
    expect(style.holderShadow).toBe('none');
    expect(style.holderPseudo).toEqual(['none', 'none']);
    expect(style.radius).toBeCloseTo(14 / 220, 3);
    expect(style.border).toBe('1px');
    expect(style.fill).not.toBe('rgb(251, 251, 250)');
    expect(style.shadow).toContain('18px 40px -12px');
  });
});

test.describe('badge mode follows the viewport width', () => {
  test('swaps between the phone card and the 3d badge on resize', async ({
    page,
    browserName,
    isMobile,
  }) => {
    chromiumDesktop(browserName, isMobile);
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForBadge(page);
    await expect(page.locator('#badge-slot canvas')).toHaveCount(1);

    await page.setViewportSize({ width: 600, height: 900 });
    await expect(page.locator('#badge-slot canvas')).toHaveCount(0);
    await expect(page.locator('#badge-slot')).not.toHaveAttribute(
      'data-badge-3d',
    );
    await expect(page.locator('[data-badge]')).toBeVisible();
    await expect(page.locator('#badge-slot .strap')).toBeHidden();
    await expect.poll(() => tiltOf(page)).toBeCloseTo(7, 1);
    await expectTilt(page, 300, 1.58);
    await page.evaluate(() => window.scrollTo(0, 0));

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('#badge-slot')).toHaveAttribute(
      'data-badge-3d',
      'ready',
      { timeout: 20_000 },
    );
    await expect(page.locator('#badge-slot canvas')).toHaveCount(1);
    await expect(page.locator('[data-badge]')).toBeHidden();
    expect(
      await page.locator('[data-badge]').evaluate((el) => el.style.transform),
    ).toBe('');
    const rest = await atRest(page);
    const before = await page.locator('#badge-slot .badge-frame').screenshot();
    await page.mouse.move(rest.x, rest.y);
    await page.mouse.down();
    await moveTo(page, rest.x + 40, rest.y + 60, 10);
    await page.mouse.up();
    const during = await page.locator('#badge-slot .badge-frame').screenshot();
    expect(during.equals(before)).toBe(false);
    expect(errors).toEqual([]);
  });

  test.describe('on a touch tablet in landscape', () => {
    test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

    test('shows the 3d badge', async ({ page, browserName, isMobile }) => {
      chromiumDesktop(browserName, isMobile);
      const errors = collectErrors(page);
      await page.goto('/');
      await waitForBadge(page);
      await expect(page.locator('#badge-slot canvas')).toHaveCount(1);
      await expect(page.locator('#badge-slot .badge-hit')).toHaveCount(1);
      await expect(page.locator('[data-badge]')).toBeHidden();
      expect(errors).toEqual([]);
    });
  });
});
