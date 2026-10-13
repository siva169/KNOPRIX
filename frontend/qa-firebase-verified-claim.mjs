import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = 'http://127.0.0.1:5173';
const verified = (value) => {
  const payload = Buffer.from(
    JSON.stringify({
      aud: 'knoprix-a64b7',
      auth_time: Math.floor(Date.now() / 1000),
      email: 'preview@example.invalid',
      email_verified: value,
      exp: Math.floor(Date.now() / 1000) + 3600,
      firebase: {
        identities: { email: ['preview@example.invalid'] },
        sign_in_provider: 'password',
      },
      iat: Math.floor(Date.now() / 1000),
      iss: 'https://securetoken.google.com/knoprix-a64b7',
      sub: 'preview-user',
      user_id: 'preview-user',
    }),
  ).toString('base64url');
  return `e30.${payload}.signature`;
};

const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const sessionClaims = [];
  const pageErrors = [];
  let refreshCount = 0;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    if (request.url().includes('identitytoolkit.googleapis.com')) {
      pageErrors.push(`request failed: ${request.url()} (${request.failure()?.errorText})`);
    }
  });

  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === baseUrl) {
      if (url.pathname === '/api/auth/refresh') {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'No preview session' }),
        });
      } else if (url.pathname === '/api/auth/firebase/session') {
        const authorization = route.request().headers().authorization || '';
        const tokenPayload = authorization.split('.')[1];
        sessionClaims.push(
          tokenPayload
            ? JSON.parse(Buffer.from(tokenPayload, 'base64url').toString())
                .email_verified
            : undefined,
        );
        if (sessionClaims.at(-1) !== true) {
          await route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({
              detail: 'Verify your email before linking this existing Knoprix account',
            }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'knoprix-preview-user',
              email: 'preview@example.invalid',
              full_name: 'Preview',
            }),
          });
        }
      } else {
        await route.continue();
      }
      return;
    }

    if (
      url.hostname === 'identitytoolkit.googleapis.com' &&
      url.pathname.endsWith('/accounts:signInWithPassword')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          localId: 'preview-user',
          email: 'preview@example.invalid',
          displayName: '',
          idToken: verified(false),
          registered: true,
          refreshToken: 'preview-refresh-token',
          expiresIn: '3600',
        }),
      });
      return;
    }

    if (
      url.hostname === 'securetoken.googleapis.com' &&
      url.pathname.endsWith('/token')
    ) {
      refreshCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: verified(true),
          expires_in: '3600',
          token_type: 'Bearer',
          refresh_token: 'preview-refresh-token',
          id_token: verified(true),
          user_id: 'preview-user',
          project_id: 'knoprix-a64b7',
        }),
      });
      return;
    }

    if (
      url.hostname === 'identitytoolkit.googleapis.com' &&
      url.pathname.endsWith('/accounts:lookup')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          users: [
            {
              localId: 'preview-user',
              email: 'preview@example.invalid',
              emailVerified: true,
              displayName: '',
              lastLoginAt: String(Date.now()),
              createdAt: String(Date.now()),
              providerUserInfo: [],
            },
          ],
        }),
      });
      return;
    }

    if (url.hostname === 'fonts.googleapis.com') {
      await route.abort();
      return;
    }

    await route.abort();
  });

  await page.goto(baseUrl);
  const sessionSyncResponse = page.waitForResponse((response) =>
    response.url().includes('/api/auth/firebase/session'),
  );
  await page.getByLabel('Email address').fill('preview@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('preview-password');
  await page.getByRole('button', { name: /sign in/i }).click();
  await sessionSyncResponse;

  assert.ok(
    sessionClaims.length > 0,
    `Firebase session sync should be attempted; errors=${JSON.stringify(pageErrors)}; alerts=${JSON.stringify(await page.getByRole('alert').allTextContents())}`,
  );
  assert.ok(
    sessionClaims.every((claim) => claim === true),
    `session sync must use verified ID tokens; received ${JSON.stringify(sessionClaims)}`,
  );
  assert.ok(refreshCount > 0, 'login must force-refresh the Firebase ID token');
  console.log('PASS: verified Firebase claims reach the Knoprix session endpoint');
} finally {
  await browser.close();
}
