/* Gold-theme auth QA: login + register parity at 390/768/1024.
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
    // --- LOGIN ---
    check(`[${tag}] login heading`, await page.getByText('LOGIN', { exact: true }).isVisible());
    check(`[${tag}] login email field`, await page.getByLabel('Email address').isVisible());
    check(`[${tag}] login password field`, await page.getByLabel('Password').isVisible());
    check(`[${tag}] sign-in button`, await page.getByRole('button', { name: /SIGN IN/ }).isVisible());
    check(`[${tag}] demo-fill button`, await page.getByRole('button', { name: /Fill demo credentials/ }).isVisible());
    check(`[${tag}] no h-overflow (login)`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: `${SHOTS}login-${tag}.png` });
    // --- REGISTER ---
    await page.getByRole('button', { name: /Create an account/ }).click();
    check(`[${tag}] register heading`, await page.getByText('REGISTER', { exact: true }).isVisible());
    check(`[${tag}] register name field`, await page.getByLabel('Full name').isVisible());
    check(`[${tag}] register create button`, await page.getByRole('button', { name: /CREATE ACCOUNT/ }).isVisible());
    check(`[${tag}] register back-link`, await page.getByRole('button', { name: /Sign in/ }).isVisible());
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
