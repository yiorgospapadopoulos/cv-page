import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const font = (name) =>
  readFileSync(new URL(`node_modules/${name}`, root)).toString('base64');

const fraunces = font(
  '@fontsource-variable/fraunces/files/fraunces-latin-opsz-normal.woff2',
);
const mono = font(
  '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
);

const html = `<!doctype html>
<html>
<head>
<style>
@font-face {
  font-family: 'Fraunces Variable';
  font-weight: 100 900;
  src: url(data:font/woff2;base64,${fraunces}) format('woff2');
}
@font-face {
  font-family: 'JetBrains Mono Variable';
  font-weight: 100 800;
  src: url(data:font/woff2;base64,${mono}) format('woff2');
}
* { box-sizing: border-box; margin: 0; }
body {
  width: 1200px;
  height: 630px;
  position: relative;
  background: #ffffff;
  color: #111111;
  font-family: 'Fraunces Variable', Georgia, serif;
}
.prompt {
  position: absolute;
  top: 56px;
  left: 72px;
  color: #6b6b6b;
  font-family: 'JetBrains Mono Variable', monospace;
  font-size: 24px;
}
.prompt i { display: inline-block; width: 13px; height: 27px; margin-left: 4px; vertical-align: text-bottom; background: #111111; }
.name {
  position: absolute;
  left: 66px;
  top: 150px;
  font-size: 190px;
  font-variation-settings: 'opsz' 144;
  font-weight: 450;
  line-height: 0.88;
  letter-spacing: -0.035em;
  white-space: nowrap;
}
.name span { display: block; }
.role {
  position: absolute;
  left: 72px;
  bottom: 56px;
  font-size: 34px;
  font-variation-settings: 'opsz' 36;
  color: #6b6b6b;
}
</style>
</head>
<body>
<p class="prompt">yiorgos@papadopoulos:~$<i></i></p>
<h1 class="name"><span>Yiorgos</span><span>Papadopoulos</span></h1>
<p class="role">ML &amp; LLM Systems Engineer</p>
</body>
</html>`;

const out = fileURLToPath(new URL('public/og.png', root));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${out}`);
