import { chromium } from 'playwright';

const breakpoints = [
  { name: 'mobile-small', width: 390, height: 844 },
  { name: 'mobile-large', width: 425, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1024, height: 768 },
];

async function mockWorkspace(page) {
  await page.addInitScript(() => {
    localStorage.setItem('knoprix_access_token', 'mock-qa-token');
    localStorage.setItem('knoprix_refresh_token', 'mock-qa-refresh');
  });

  await page.route('**/api/auth/refresh', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      user: { id: 'u1', email: 'test@knoprix.dev', full_name: 'Test Boss' },
      tokens: { accessToken: 'mock-qa-token' },
    }),
  }));
  await page.route('**/api/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user: { id: 'u1', email: 'test@knoprix.dev', full_name: 'Test Boss' } }),
  }));
  await page.route('**/api/projects', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ projects: [{ id: 'p1', name: 'Quantum Research', file_count: 1 }] }),
  }));
  await page.route('**/api/projects/p1/documents', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      documents: [{
        id: 'd1',
        project_id: 'p1',
        file_name: 'quantum_paper.pdf',
        file_type: 'pdf',
        page_count: 12,
      }],
    }),
  }));
  await page.route('**/api/projects/p1/bookmarks', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ bookmarks: [] }),
  }));
  await page.route('**/api/providers/allowlist', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      providers: [{
        id: 'zai-glm-free',
        name: 'Z.AI GLM',
        hasServerKey: true,
        models: [{ id: 'glm-4.5-flash', name: 'GLM 4.5 Flash' }],
      }],
    }),
  }));
  await page.route('**/api/documents/d1/stream', (route) => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'QA does not need document bytes.' }),
  }));
}

async function run() {
  const browser = await chromium.launch({ headless: true });

  for (const bp of breakpoints) {
    const page = await browser.newPage({ viewport: { width: bp.width, height: bp.height } });
    await mockWorkspace(page);
    await page.goto('http://localhost:4173/');
    await page.waitForLoadState('networkidle');

    const openDocumentButton = page.getByRole('button', { name: 'Open quantum_paper.pdf' }).first();
    await openDocumentButton.waitFor({ state: 'visible' });
    await openDocumentButton.click();

    const chatButton = page.locator('button[title="Chat with your documents"]');
    await chatButton.waitFor({ state: 'visible' });
    await chatButton.click();

    const compactChat = page.getByRole('dialog', { name: 'Document chat' });
    await compactChat.waitFor({ state: 'visible' });
    if (await page.getByText('Document Grants', { exact: true }).isVisible()) {
      throw new Error(`[${bp.name}] Reading Desk chat redirected to AI Wing.`);
    }
    await compactChat.getByRole('button', { name: 'Close chat' }).click();
    await compactChat.waitFor({ state: 'hidden' });
    console.log(`[PASS] ${bp.name} (${bp.width}px): compact chat opened in Reading Desk`);
    await page.close();
  }

  await browser.close();
  console.log('ALL READING DESK CHAT CHECKS PASSED: 390px, 425px, 768px, 1024px');
}

run().catch((error) => {
  console.error('TEST FAILED:', error);
  process.exit(1);
});
