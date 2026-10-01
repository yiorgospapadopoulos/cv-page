// Usage: npm run build && npm run perf [runs]
// Serves dist/ with gzip (like a real static host) and measures a desktop
// profile and a throttled mobile profile (Fast 3G, 4x CPU) in Chromium.
import { chromium, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/ is missing. Run `npm run build` first.');
  process.exit(1);
}

const runs = Number(process.argv[2] ?? 3);
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
};
const compressible = new Set(['.html', '.js', '.css', '.svg', '.wasm']);

const server = createServer(async (req, res) => {
  try {
    let path = normalize(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const ext = extname(path);
    let body = await readFile(join(dist, path));
    const headers = {
      'content-type': types[ext] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    };
    if (compressible.has(ext)) {
      body = gzipSync(body, { level: 9 });
      headers['content-encoding'] = 'gzip';
    }
    headers['content-length'] = body.length;
    res.writeHead(200, headers).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, resolve));
const origin = `http://localhost:${server.address().port}`;

const profiles = {
  desktop: { device: devices['Desktop Chrome'], network: null, cpu: 1 },
  mobile: {
    device: devices['Pixel 7'],
    network: {
      offline: false,
      latency: 562.5,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    },
    cpu: 4,
  },
};

const observe = () => {
  window.__lcp = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__lcp.push({
        time: entry.startTime,
        element: `${entry.element?.parentElement?.className || '?'} > ${entry.element?.tagName}`,
      });
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
};

async function measure({ device, network, cpu }, saveData) {
  const browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext(device);
  const page = await context.newPage();
  if (saveData) {
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'connection', {
        value: { saveData: true, effectiveType: '4g' },
      }),
    );
  }
  await page.addInitScript(observe);
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  if (network) await client.send('Network.emulateNetworkConditions', network);
  if (cpu > 1) {
    await client.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  }

  const requests = new Map();
  client.on('Network.requestWillBeSent', ({ requestId, request, timestamp }) =>
    requests.set(requestId, { url: request.url, start: timestamp, bytes: 0 }),
  );
  client.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
    const entry = requests.get(requestId);
    if (entry) entry.bytes = encodedDataLength;
  });

  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForTimeout(12_000);
  const lcp = (await page.evaluate(() => window.__lcp)).at(-1);
  const state = await page.locator('#badge-slot').getAttribute('data-badge-3d');
  await browser.close();

  const all = [...requests.values()];
  const scene = all.find((entry) => /\/Scene\./.test(entry.url));
  const before = scene ? all.filter((e) => e.start < scene.start) : all;
  const sum = (entries) => entries.reduce((n, e) => n + e.bytes, 0);
  return {
    lcpMs: Math.round(lcp.time),
    lcpElement: lcp.element,
    bytesBeforeScene: sum(before),
    bytesTotal: sum(all),
    sceneRequestedMs: scene
      ? Math.round((scene.start - all[0].start) * 1000)
      : null,
    badge: state ?? 'placeholder',
  };
}

const median = (values) =>
  [...values].sort((a, b) => a - b)[values.length >> 1];

const rows = [];
for (const [name, profile] of Object.entries(profiles)) {
  for (const saveData of [false, true]) {
    const results = [];
    for (let i = 0; i < runs; i++)
      results.push(await measure(profile, saveData));
    rows.push({
      profile: name + (saveData ? ' + save-data' : ''),
      'LCP ms (median)': median(results.map((r) => r.lcpMs)),
      'LCP element': results[0].lcpElement,
      'KB before scene': Math.round(
        median(results.map((r) => r.bytesBeforeScene)) / 1024,
      ),
      'KB total': Math.round(median(results.map((r) => r.bytesTotal)) / 1024),
      'scene requested ms': results[0].sceneRequestedMs ?? 'never',
      badge: results[0].badge,
    });
  }
}
console.table(rows);
server.close();
