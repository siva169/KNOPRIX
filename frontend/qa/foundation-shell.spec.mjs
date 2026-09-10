import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://[::1]:5175';       // production preview of the real app
const DEV = 'http://[::1]:5176';        // dev server for the JSX crash harness
const OUT = '../../qa-artifacts/knoprix-foundation-shell';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const results = [];
const record = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ---- Part 1: real app shell at the 4 required widths ----
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(String(e)));

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });

for (const width of [390, 425, 768, 1024]) {
  await page.setViewportSize({ width, height: 844 });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  await page.screenshot({ path: `${OUT}/login-${width}.png`, fullPage: false });
  record(`no horizontal overflow @ ${width}px`, overflow <= 0, `overflow=${overflow}px`);
}

// Head hygiene checks (fix checklist #2 #3)
const title = await page.title();
record('page title set', title.includes('Knoprix'), title);
const desc = await page.$eval('meta[name="description"]', (m) => m.content);
record('meta description present', desc.length > 50, desc.slice(0, 60) + '…');
const faviconStatus = await page.evaluate(async () => {
  const r = await fetch('/favicon.svg');
  return r.status;
});
record('favicon.svg served', faviconStatus === 200, `HTTP ${faviconStatus}`);

// ---- Part 2: crash-fallback proof via harness page ----
const crash = await browser.newPage();
const crashErrors = [];
crash.on('pageerror', (e) => crashErrors.push(String(e)));
await crash.goto(`${DEV}/qa/crash.html`, { waitUntil: 'networkidle', timeout: 30000 });
// Devtools vite serves jsx with esbuild transform on the fly.
await crash.waitForTimeout(1500);
const alertVisible = await crash.$('div[role="alert"]');
record('ErrorBoundary fallback rendered', !!alertVisible);
const fallbackText = alertVisible ? (await alertVisible.innerText()).toLowerCase() : '';
record(
  'fallback copy present',
  fallbackText.includes('something broke') && fallbackText.includes('try again'),
  fallbackText.slice(0, 80)
);
await crash.screenshot({ path: `${OUT}/crash-fallback.png` });

// Harness modules are expected to log the forced crash; anything ELSE
// crashing on the real app page is a failure.
const realPageErrors = consoleErrors.filter(
  (e) => !e.includes('QA-forced')
);
record('no unexpected console errors on real app', realPageErrors.length === 0, realPageErrors.join(' | ').slice(0, 200));

fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await browser.close();
process.exit(failed.length ? 1 : 0);
