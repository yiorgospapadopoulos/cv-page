import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { profile } from '../src/content/profile';
import { terminalSections } from '../src/lib/terminal';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const blocking = new Set(['serious', 'critical']);

async function scan(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags([...tags, 'best-practice'])
    .analyze();
  const summary = results.violations
    .filter((violation) => blocking.has(violation.impact ?? ''))
    .map((violation) => ({
      rule: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target.join(' ')),
    }));
  expect(summary).toEqual([]);
  const remaining = results.violations.map((violation) => violation.id);
  expect(remaining).toEqual([]);
}

async function finishTyping(page: Page) {
  for (const { id } of terminalSections) {
    const terminal = page.locator(`#${id} [data-terminal]`);
    await terminal.locator('[data-cmd-line]').first().scrollIntoViewIfNeeded();
    await expect(terminal.locator('[data-block]:not(.is-out)')).toHaveCount(0, {
      timeout: 30_000,
    });
  }
  await expect(page.locator('.cursor')).toHaveCount(0);
}

test.describe('axe scans', () => {
  test('full page with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await scan(page);
  });

  test('full page after the terminals have typed', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/typing/);
    await finishTyping(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await scan(page);
  });

  test('page with the dialog open', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('button', { name: profile.hero.moreLabel }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await scan(page);
  });

  test('prompt after running a command', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const input = page.getByLabel('Terminal command');
    await input.fill('cat thesis');
    await input.press('Enter');
    await expect(page.locator('#try [data-log]')).toContainText(
      profile.projects[0].title,
    );
    await scan(page);
  });
});

test.describe('terminal text for assistive technology', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('every window is exposed before it types', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/typing/);

    const projects = page.locator('#projects');
    await expect(projects.locator('[data-block]').first()).toHaveCSS(
      'opacity',
      '0',
    );
    const snapshot = await projects.ariaSnapshot();
    for (const project of profile.projects) {
      expect(snapshot).toContain(project.title);
      expect(snapshot).toContain(project.summary);
      for (const metric of project.metrics) expect(snapshot).toContain(metric);
    }
    expect(snapshot).toContain('ls projects/');
    expect(snapshot).toContain(`cat projects/${profile.projects[0].slug}.md`);

    await expect(
      projects.getByRole('heading', {
        level: 3,
        name: profile.projects[0].title,
      }),
    ).toHaveCount(1);
    await expect(projects.locator('[data-block].is-live')).toHaveCount(0);
  });

  test('every other window is exposed before it types', async ({ page }) => {
    await page.goto('/');
    for (const { id, command } of terminalSections) {
      const snapshot = await page.locator(`#${id}`).ariaSnapshot();
      expect(snapshot, id).toContain(command);
    }
    const stack = await page.locator('#stack').ariaSnapshot();
    for (const group of profile.stackGroups) {
      for (const item of group.items) expect(stack).toContain(item);
    }
    const experience = await page.locator('#experience').ariaSnapshot();
    for (const entry of profile.experience) {
      expect(experience).toContain(entry.role);
    }
  });

  test('the command is announced once, in full, while it types', async ({
    page,
  }) => {
    await page.goto('/');
    const command = page.locator('#about [data-cmd]');
    await expect(command).toHaveAttribute('aria-hidden', 'true');
    await page.locator('#about [data-cmd-line]').scrollIntoViewIfNeeded();
    await expect(page.locator('#about .out')).toHaveCSS('opacity', '1');
    const snapshot = await page.locator('#about').ariaSnapshot();
    expect(snapshot.match(/whoami/g)).toHaveLength(1);
  });

  test('a link inside an untyped window is revealed when focused', async ({
    page,
  }) => {
    await page.goto('/');
    const link = page.getByRole('link', {
      name: profile.projects[0].repoLabel,
    });
    await link.focus();
    await expect(link).toBeFocused();
    await expect(page.locator('#projects [data-block]').first()).toHaveCSS(
      'opacity',
      '1',
    );
    await expect(link).toBeInViewport();
  });
});
