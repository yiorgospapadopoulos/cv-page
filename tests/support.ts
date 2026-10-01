import type { Page } from '@playwright/test';

export async function hasWebGL(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    return (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) !== null;
  });
}

export const noWebGL = 'WebGL is unavailable in this headless engine';
