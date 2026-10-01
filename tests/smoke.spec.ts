import { expect, test } from '@playwright/test';

test('home page loads and renders the name', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  const response = await page.goto('/');
  expect(response?.status()).toBe(200);

  await expect(page).toHaveTitle(
    'Yiorgos Papadopoulos | ML & LLM Systems Engineer',
  );
  await expect(
    page.getByRole('heading', { level: 1, name: 'Yiorgos Papadopoulos' }),
  ).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test('page does not scroll horizontally', async ({ page }) => {
  await page.goto('/');
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});
