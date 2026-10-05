import { expect, test, type Page } from '@playwright/test';
import { profile } from '../src/content/profile';
import { panelCommands } from '../src/lib/commands';
import { tryIt, welcomeLines } from '../src/lib/terminal';

const { projects, commands, links } = profile;
const thesis = projects.find((project) => project.slug === 'thesis')!;
const notFound = (name: string) =>
  `command not found: ${name}. Type help to see what I can do.`;

const input = (page: Page) => page.getByLabel('Terminal command');
const log = (page: Page) => page.locator('#try [data-log]');

async function enter(page: Page, text: string) {
  const field = input(page);
  await field.fill(text);
  await field.press('Enter');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('#try').scrollIntoViewIfNeeded();
});

test.describe('the live prompt', () => {
  test('starts with the welcome lines, a prompt, and no focus', async ({
    page,
  }) => {
    for (const line of welcomeLines) {
      await expect(log(page)).toContainText(line);
    }
    await expect(
      page.getByRole('heading', { level: 2, name: 'Try it' }),
    ).toBeVisible();
    await expect(input(page)).toBeVisible();
    await expect(input(page)).not.toBeFocused();
    await expect(input(page)).toHaveAttribute('autocomplete', 'off');
    await expect(input(page)).toHaveAttribute('autocapitalize', 'off');
    await expect(input(page)).toHaveAttribute('spellcheck', 'false');
    await expect(input(page)).toHaveAttribute('enterkeyhint', 'go');
  });

  test('shows a muted placeholder that disappears when typing', async ({
    page,
  }) => {
    await expect(input(page)).toHaveAttribute('placeholder', tryIt.placeholder);
    const state = () =>
      input(page).evaluate((el) => ({
        shown: el.matches(':placeholder-shown'),
        colour: getComputedStyle(el, '::placeholder').color,
      }));
    expect((await state()).shown).toBe(true);
    expect((await state()).colour).toBe('rgb(139, 148, 158)');
    await input(page).focus();
    await page.keyboard.type('h');
    expect((await state()).shown).toBe(false);
  });

  test('clicking the terminal body focuses the input', async ({ page }) => {
    await log(page).getByText(welcomeLines[0]).click();
    await expect(input(page)).toBeFocused();
  });

  test('typing help and pressing Enter lists every command', async ({
    page,
  }) => {
    await enter(page, 'help');
    for (const command of commands) {
      await expect(log(page)).toContainText(command.name);
      await expect(log(page)).toContainText(command.description);
    }
    await expect(log(page)).toContainText('yiorgos@papadopoulos:~$ help');
    await expect(input(page)).toHaveValue('');
  });

  test('cat thesis shows the project title and its repository link', async ({
    page,
  }) => {
    await enter(page, 'cat thesis');
    await expect(log(page)).toContainText(thesis.title);
    await expect(log(page)).toContainText(thesis.summary);
    const link = log(page).getByRole('link', { name: thesis.repoLabel });
    await expect(link).toHaveAttribute('href', thesis.repoUrl!);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('an unknown command shows the not-found message', async ({ page }) => {
    await enter(page, 'frobnicate now');
    await expect(log(page)).toContainText(notFound('frobnicate'));
  });

  test('typing foo by keyboard prints the shell error and the hint', async ({
    page,
  }) => {
    await log(page).getByText(welcomeLines[0]).click();
    await page.keyboard.type('foo');
    await page.keyboard.press('Enter');
    await expect(log(page)).toContainText('yiorgos@papadopoulos:~$ foo');
    await expect(log(page)).toContainText(notFound('foo'));
    await expect(input(page)).toHaveValue('');
    await expect(input(page)).toBeFocused();
  });

  test('typing whoami by keyboard alone runs it', async ({ page }) => {
    await log(page).getByText(welcomeLines[0]).click();
    await page.keyboard.type('whoami');
    await page.keyboard.press('Enter');
    await expect(log(page)).toContainText('yiorgos@papadopoulos:~$ whoami');
    await expect(log(page)).toContainText(profile.hero.intro);
  });

  test('whitespace and case are forgiven', async ({ page }) => {
    await enter(page, '   CAT    Thesis  ');
    await expect(log(page)).toContainText(thesis.title);
  });

  test('ArrowUp and ArrowDown walk through the history', async ({ page }) => {
    await enter(page, 'whoami');
    await enter(page, 'stack');
    await input(page).press('ArrowUp');
    await expect(input(page)).toHaveValue('stack');
    await input(page).press('ArrowUp');
    await expect(input(page)).toHaveValue('whoami');
    await input(page).press('ArrowDown');
    await expect(input(page)).toHaveValue('stack');
    await input(page).press('ArrowDown');
    await expect(input(page)).toHaveValue('');
  });

  test('clear empties the output', async ({ page }) => {
    await enter(page, 'help');
    await expect(log(page).locator('> *')).toHaveCount(2);
    await enter(page, 'clear');
    await expect(log(page).locator('> *')).toHaveCount(0);
    await expect(input(page)).toBeVisible();
  });

  test('the easter eggs answer', async ({ page }) => {
    await enter(page, 'sudo rm -rf /');
    await expect(log(page)).toContainText(
      'Nice try. But you can hire me instead: type email or cv.',
    );
    await enter(page, 'kats');
    await expect(log(page)).toContainText('(o) (o)');
    await enter(page, 'pdl');
    await expect(log(page)).toContainText('(@)');
    await enter(page, 'pap');
    await expect(log(page)).toContainText('>>---->');
    await enter(page, 'pegkas');
    await expect(log(page)).toContainText('@ @ @');
    await enter(page, 'mike');
    await enter(page, 'rest');
    const stripes = log(page).locator('.line').filter({ hasText: '#' });
    const colours = await stripes.evaluateAll((lines) =>
      lines.map((line) => getComputedStyle(line.lastElementChild!).color),
    );
    expect(new Set(colours.slice(-6)).size).toBe(6);
    expect(new Set(colours.slice(0, -6)).size).toBe(1);
    await enter(page, 'hire yiorgos');
    await expect(
      log(page).getByRole('link', { name: links.email }),
    ).toHaveAttribute('href', `mailto:${links.email}`);
  });

  test('the output area scrolls inside a capped terminal on narrow screens and stays at the newest line', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    for (let i = 0; i < 6; i++) await enter(page, 'help');
    const metrics = await page.locator('#try [data-scroll]').evaluate((el) => ({
      client: el.clientHeight,
      scroll: el.scrollHeight,
      top: el.scrollTop,
    }));
    expect(metrics.client).toBeLessThanOrEqual(460);
    expect(metrics.scroll).toBeGreaterThan(metrics.client);
    expect(metrics.top + metrics.client).toBeGreaterThanOrEqual(
      metrics.scroll - 2,
    );
  });

  test('on wide screens the terminal matches the panel height and scrolls inside', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const heights = async () => ({
      term: (await page.locator('#try .term').boundingBox())!.height,
      panel: (await page.locator('#try .panel').boundingBox())!.height,
    });
    const before = await heights();
    expect(Math.abs(before.term - before.panel)).toBeLessThanOrEqual(1);
    expect(before.term).toBeGreaterThan(520);

    for (let i = 0; i < 12; i++) await enter(page, 'help');
    const after = await heights();
    expect(Math.abs(after.term - after.panel)).toBeLessThanOrEqual(1);
    const metrics = await page.locator('#try [data-scroll]').evaluate((el) => ({
      client: el.clientHeight,
      scroll: el.scrollHeight,
      top: el.scrollTop,
    }));
    expect(metrics.scroll).toBeGreaterThan(metrics.client);
    expect(metrics.top + metrics.client).toBeGreaterThanOrEqual(
      metrics.scroll - 2,
    );
  });

  test('focusing the input draws no ring around the terminal window', async ({
    page,
  }) => {
    await input(page).focus();
    const outline = await page
      .locator('#try .term')
      .evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).toBe('none');
  });
});

test.describe('the command panel', () => {
  const button = (page: Page, command: string) =>
    page.locator(`#try [data-command="${command}"]`);

  test('has one button per command', async ({ page }) => {
    await expect(page.locator('#try [data-command]')).toHaveCount(
      panelCommands.length,
    );
    for (const command of panelCommands) {
      await expect(button(page, command)).toBeVisible();
    }
    await expect(
      page.getByRole('heading', { level: 3, name: 'Try a command' }),
    ).toBeVisible();
  });

  test('clicking ls prints all five project slugs', async ({ page }) => {
    await button(page, 'ls').click();
    await expect(log(page)).toContainText('yiorgos@papadopoulos:~$ ls');
    for (const project of projects) {
      await expect(log(page)).toContainText(project.slug);
      await expect(log(page)).toContainText(project.tagline);
    }
    await expect(input(page)).toHaveValue('');
  });

  test('clicking cat thesis types and runs the command', async ({ page }) => {
    await button(page, 'cat thesis').click();
    await expect(log(page)).toContainText(thesis.title);
  });

  test('clicking clear wipes the output', async ({ page }) => {
    await button(page, 'whoami').click();
    await expect(log(page)).toContainText('Yiorgos Papadopoulos');
    await button(page, 'clear').click();
    await expect(log(page).locator('> *')).toHaveCount(0);
  });

  test('focuses the input after a click on a fine pointer only', async ({
    page,
    hasTouch,
  }) => {
    await button(page, 'help').click();
    await expect(log(page)).toContainText('Available commands');
    if (hasTouch) {
      await expect(input(page)).not.toBeFocused();
    } else {
      await expect(input(page)).toBeFocused();
      await page.keyboard.type('whoami');
      await page.keyboard.press('Enter');
      await expect(log(page)).toContainText(profile.hero.intro);
    }
  });

  test('github opens the profile in a new tab', async ({ page, context }) => {
    await context.route('https://github.com/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<p>github</p>' }),
    );
    const popup = context.waitForEvent('page');
    await enter(page, 'github');
    const opened = await popup;
    await opened.waitForLoadState();
    expect(opened.url()).toBe(links.githubUrl);
    await expect(log(page)).toContainText('Opening GitHub...');
  });

  test('linkedin opens from the panel in a new tab', async ({
    page,
    context,
  }) => {
    await context.route('https://www.linkedin.com/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<p>linkedin</p>' }),
    );
    const popup = context.waitForEvent('page');
    await button(page, 'linkedin').click();
    const opened = await popup;
    await opened.waitForLoadState();
    expect(opened.url()).toBe(links.linkedinUrl);
  });

  test('email prints a mailto link', async ({ page }) => {
    await page.route('mailto:**', (route) => route.abort());
    await button(page, 'email').click();
    await expect(
      log(page).getByRole('link', { name: links.email }),
    ).toHaveAttribute('href', `mailto:${links.email}`);
  });

  test('cv downloads the PDF', async ({ page }) => {
    const download = page.waitForEvent('download');
    await enter(page, 'cv');
    const file = await download;
    expect(file.suggestedFilename()).toBe('Yiorgos_Papadopoulos_CV.pdf');
    expect(await file.failure()).toBeNull();
    await expect(log(page)).toContainText('Downloading CV...');
  });
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('a panel button runs its command at once', async ({ page }) => {
    await page.locator('#try [data-command="whoami"]').click();
    await expect(log(page)).toContainText(profile.hero.intro);
    await expect(input(page)).toHaveValue('');
  });
});

test.describe('layout', () => {
  for (const width of [375, 1440]) {
    test(`has no horizontal scroll at ${width}px, even with long output`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const command of ['help', 'ls', 'cat model-pipeline', 'stack']) {
        await enter(page, command);
      }
      const result = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        body: (() => {
          const el = document.querySelector('#try [data-scroll]')!;
          return [el.scrollWidth, el.clientWidth];
        })(),
      }));
      expect(result.scrollWidth).toBeLessThanOrEqual(result.innerWidth);
      expect(result.body[0]).toBeLessThanOrEqual(result.body[1]! + 1);
    });
  }

  test('puts the panel to the right of the terminal on wide screens', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const term = await page.locator('#try .term').boundingBox();
    const panel = await page.locator('#try .panel').boundingBox();
    expect(panel!.x).toBeGreaterThanOrEqual(term!.x + term!.width);
    expect(panel!.width).toBeGreaterThan(240);
    expect(panel!.width).toBeLessThan(280);
    await expect(page.locator('#try .desc').first()).toBeVisible();
  });

  test('puts the chip row above the terminal on narrow screens', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    const term = await page.locator('#try .term').boundingBox();
    const panel = await page.locator('#try .panel').boundingBox();
    expect(panel!.y + panel!.height).toBeLessThanOrEqual(term!.y);
    await expect(page.locator('#try .desc').first()).toBeHidden();
  });
});
