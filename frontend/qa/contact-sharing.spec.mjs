import { chromium } from 'playwright';

const breakpoints = [
  { name: 'mobile-small', width: 390, height: 844 },
  { name: 'mobile-large', width: 425, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1024, height: 768 },
];

const documentData = {
  id: 'd1',
  project_id: 'p1',
  file_name: 'notes.txt',
  file_type: 'txt',
  page_count: 1,
  extracted_text: 'Notes for sharing',
};

const json = (body) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

async function mockWorkspace(page, capture) {
  await page.addInitScript(() => {
    localStorage.setItem('knoprix_access_token', 'mock-qa-token');
    localStorage.setItem('knoprix_refresh_token', 'mock-qa-refresh');
  });

  await page.route('**/api/auth/refresh', (route) => route.fulfill(json({
    user: { id: 'u1', email: 'test@knoprix.dev', full_name: 'Test Boss' },
    tokens: { accessToken: 'mock-qa-token' },
  })));
  await page.route('**/api/auth/me', (route) => route.fulfill(json({
    user: { id: 'u1', email: 'test@knoprix.dev', full_name: 'Test Boss' },
  })));
  await page.route('**/api/projects', (route) => route.fulfill(json({
    projects: [{ id: 'p1', name: 'Research', file_count: 1 }],
  })));
  await page.route('**/api/projects/p1/documents', (route) => route.fulfill(json({ documents: [documentData] })));
  await page.route('**/api/projects/p1/bookmarks', (route) => route.fulfill(json({ bookmarks: [{
    id: 'b1', project_id: 'p1', document_id: 'd1', page_number: 1,
    bookmark_type: 'text', highlighted_text: 'Important note', name: 'Important note',
  }] })));
  await page.route('**/api/documents/d1/highlights', (route) => route.fulfill(json({ highlights: [{
    id: 'h1', document_id: 'd1', page_number: 1, text: 'Important note',
  }] })));
  await page.route('**/api/providers/allowlist', (route) => route.fulfill(json({ providers: [] })));
  await page.route('**/api/documents/d1', (route) => route.fulfill(json({ document: documentData })));

  await page.route('**/api/v1/profile', (route) => route.fulfill(json({
    knoprixId: 'KP-OWNER', allowIdLookup: true, allowContactRequests: true, emailNotificationsEnabled: false,
  })));
  await page.route('**/api/v1/contacts', (route) => route.fulfill(json({ contacts: [{
    contactId: 'contact-1', knoprixId: 'KP-RECIPIENT', fullName: 'Recipient Boss',
  }] })));
  await page.route('**/api/v1/inbox', (route) => route.fulfill(json({ contactRequests: [], shareRequests: [] })));
  await page.route('**/api/v1/contact-requests/sent', (route) => route.fulfill(json({ requests: [] })));
  await page.route('**/api/v1/shares/sent', (route) => route.fulfill(json({ shares: [] })));
  await page.route('**/api/v1/shares/received', (route) => route.fulfill(json({ shares: [] })));
  await page.route('**/api/v1/blocks', (route) => route.fulfill(json({ blockedKnoprixIds: [] })));
  await page.route('**/api/v1/shares', async (route) => {
    if (route.request().method() === 'POST') {
      capture.body = route.request().postDataJSON();
      return route.fulfill(json({ shares: [{ knoprixId: 'KP-RECIPIENT', status: 'pending', shareId: 'share-1' }] }));
    }
    return route.continue();
  });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  for (const breakpoint of breakpoints) {
    const page = await browser.newPage({
      viewport: { width: breakpoint.width, height: breakpoint.height },
      reducedMotion: 'reduce',
    });
    const capture = {};
    await mockWorkspace(page, capture);
    await page.goto('http://localhost:4173/');
    await page.getByRole('button', { name: 'Open notes.txt' }).click();
    await page.getByRole('button', { name: 'Contacts and sharing' }).click();
    await page.getByRole('heading', { name: 'Contacts & sharing' }).waitFor({ state: 'visible' });

    await page.locator('label').filter({ hasText: 'Include bookmarks (1)' }).locator('input').check();
    await page.locator('label').filter({ hasText: 'Include highlights (1)' }).locator('input').check();
    await page.locator('label').filter({ hasText: 'KP-RECIPIENT' }).locator('input').check();
    await page.getByRole('button', { name: 'Send share requests' }).click();
    await page.getByText('KP-RECIPIENT — Request sent').waitFor({ state: 'visible' });

    if (!capture.body?.includeBookmarks || !capture.body?.includeHighlights) {
      throw new Error(`Annotation options were not submitted at ${breakpoint.width}px: ${JSON.stringify(capture.body)}`);
    }
    console.log(`[PASS] ${breakpoint.name} (${breakpoint.width}px): bundled bookmark/highlight share request`);
    await page.close();
  }
  await browser.close();
  console.log('ALL CONTACT SHARING CHECKS PASSED: 390px, 425px, 768px, 1024px');
}

run().catch((error) => {
  console.error('TEST FAILED:', error);
  process.exit(1);
});
