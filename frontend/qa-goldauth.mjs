/* Black-mirror auth QA: login (new design) + register (gold) at 390/768/1024.
   Saves PNG evidence. Run with dev server on 127.0.0.1:5199. */
import { chromium } from 'playwright';

const SHOTS = new URL('../qa-artifacts/knoprix-gold-auth/', import.meta.url).pathname;
const { mkdirSync } = await import('fs');
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, cond, detail = '') => {
  results.push([name, !!cond]);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const VIEWPORTS = [
  ['390', { width: 390, height: 844 }],
  ['768', { width: 768, height: 1024 }],
  ['1024', { width: 1024, height: 768 }],
];

for (const [tag, vp] of VIEWPORTS) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: vp });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 120)); });
  try {
    await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
    // --- LOGIN (black mirror) ---
    check(`[${tag}] headline`, await page.getByText('Enter quietly.').isVisible());
    check(`[${tag}] wordmark + edition`, await page.getByText('BLACK MIRROR / 04').isVisible());
    check(`[${tag}] email field`, await page.getByLabel('EMAIL ADDRESS').isVisible());
    check(`[${tag}] password field`, await page.getByLabel('PASSWORD').isVisible());
    check(`[${tag}] sign-in button`, await page.getByRole('button', { name: /SIGN IN/ }).isVisible());
    check(`[${tag}] mirror visual`, await page.getByTestId('black-mirror').isVisible());
    check(`[${tag}] no demo-fill (removed)`, (await page.getByRole('button', { name: /Fill demo credentials/ }).count()) === 0);
    check(`[${tag}] no passkey (removed)`, (await page.getByText('passkey', { exact: false }).count()) === 0);
    check(`[${tag}] footer strip`, await page.getByText('04 / BLACK MIRROR').isVisible());
    check(`[${tag}] no h-overflow (login)`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: `${SHOTS}login-${tag}.png` });
    // --- REGISTER (gold, unchanged) ---
    await page.getByRole('button', { name: /Create an account/ }).click();
    check(`[${tag}] register heading`, await page.getByText('REGISTER', { exact: true }).isVisible());
    check(`[${tag}] register name field`, await page.getByLabel('Full name').isVisible());
    check(`[${tag}] register create button`, await page.getByRole('button', { name: /CREATE ACCOUNT/ }).isVisible());
    check(`[${tag}] no h-overflow (register)`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: `${SHOTS}register-${tag}.png` });
    check(`[${tag}] zero JS errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (e) {
    check(`[${tag}] no crash`, false, e.message.slice(0, 120));
  }
  await browser.close();
}

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
