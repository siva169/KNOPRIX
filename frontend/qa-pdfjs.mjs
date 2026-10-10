import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const server = await createServer({
  configFile: false,
  root: frontendRoot,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});
let browser;

try {
  await server.listen();
  const baseUrl = server.resolvedUrls.local[0];
  browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(new URL('/qa/pdfjs-smoke.html', baseUrl).toString());
  await page.waitForFunction(
    () => ['passed', 'failed'].includes(document.documentElement.dataset.pdfjsStatus),
    null,
    { timeout: 30000 },
  );

  const status = await page.locator('html').getAttribute('data-pdfjs-status');
  const details = await page.locator('body').textContent();
  assert.equal(status, 'passed', details);
  assert.deepEqual(pageErrors, []);
  console.log('PASS  PDF.js loads, renders a page, and extracts selectable text');
} finally {
  await browser?.close();
  await server.close();
}
