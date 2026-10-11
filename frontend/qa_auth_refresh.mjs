import assert from 'node:assert/strict';
import { chromium } from 'playwright';

if (process.env.KNOPRIX_AUTH_QA_CONFIRM_DISPOSABLE_DB !== '1') {
  throw new Error(
    'Set KNOPRIX_AUTH_QA_CONFIRM_DISPOSABLE_DB=1 only when the local backend uses a disposable database.',
  );
}

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.locator('#login-email').waitFor({ state: 'visible' });

  const email = `auth-browser-${Date.now()}@example.com`;
  const registrationStatus = await page.evaluate(async (testEmail) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'local-browser-test-pass-2026',
        fullName: 'Browser Test',
      }),
    });
    return response.status;
  }, email);
  assert.ok([200, 201].includes(registrationStatus), `registration returned HTTP ${registrationStatus}`);

  const refreshStatuses = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/api/auth/refresh') {
      refreshStatuses.push(response.status());
    }
  });

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[title="Log out"]').waitFor({ state: 'visible' });
  assert.deepEqual(refreshStatuses, [200], 'session restoration must make one successful refresh request');

  const logoutResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/auth/logout' && response.status() === 200,
  );
  await page.locator('[title="Log out"]').click();
  await logoutResponse;
  await page.locator('#login-email').waitFor({ state: 'visible' });

  console.log('PASS: refresh-cookie restoration makes one request and logout returns to login');
} finally {
  await browser.close();
}
