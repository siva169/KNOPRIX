import { chromium } from 'playwright';

const documentData = {
  id: 'd1',
  project_id: 'p1',
  file_name: 'notes.txt',
  file_type: 'txt',
  page_count: 1,
  extracted_text: 'Notes for sharing',
};
const secondDocumentData = {
  ...documentData,
  id: 'd2',
  file_name: 'empty.txt',
  extracted_text: 'No saved annotations',
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
  await page.route('**/api/projects/p1/documents', (route) => route.fulfill(json({ documents: [documentData, secondDocumentData] })));
  await page.route('**/api/projects/p1/bookmarks', (route) => route.fulfill(json({ bookmarks: [{
    id: 'b1', project_id: 'p1', document_id: 'd1', page_number: 1,
    bookmark_type: 'text', highlighted_text: 'Important note', name: 'Important note',
  }] })));
  await page.route('**/api/documents/d1/highlights', (route) => route.fulfill(json({ highlights: [{
    id: 'h1', document_id: 'd1', page_number: 1, text: 'Important note',
  }] })));
  await page.route('**/api/documents/d2/highlights', (route) => route.fulfill(json({ highlights: [] })));
  await page.route('**/api/providers/allowlist', (route) => route.fulfill(json({ providers: [] })));

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
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' });
  const capture = {};
  await mockWorkspace(page, capture);
  await page.goto('http://localhost:4173/');

  // Regression: Contacts & Sharing must work from the dashboard without opening a document first.
  await page.getByRole('button', { name: 'Contacts and sharing' }).click();
  await page.getByRole('heading', { name: 'Contacts & sharing' }).waitFor({ state: 'visible' });

  const resourceSelect = page.locator('label select').nth(1);
  await resourceSelect.locator('option[value="d1"]').waitFor({ state: 'attached' });
  await resourceSelect.selectOption('d2');
  if (!(await page.locator('label').filter({ hasText: 'Include bookmarks (0)' }).locator('input').isDisabled())) {
    throw new Error('Bookmark checkbox should be disabled for a document with no bookmarks');
  }
  if (!(await page.locator('label').filter({ hasText: 'Include highlights (0)' }).locator('input').isDisabled())) {
    throw new Error('Highlight checkbox should be disabled for a document with no highlights');
  }
  await resourceSelect.selectOption('d1');
  await page.locator('label').filter({ hasText: 'Include bookmarks (1)' }).locator('input').check();
  await page.locator('label').filter({ hasText: 'Include highlights (1)' }).locator('input').check();
  await page.locator('label').filter({ hasText: 'KP-RECIPIENT' }).locator('input').check();
  await page.getByRole('button', { name: 'Send share requests' }).click();
  await page.getByText('KP-RECIPIENT — Request sent').waitFor({ state: 'visible' });

  if (capture.body?.resourceId !== 'd1' || !capture.body?.includeBookmarks || !capture.body?.includeHighlights) {
    throw new Error(`Dashboard share did not submit the selected document and annotations: ${JSON.stringify(capture.body)}`);
  }
  console.log('[PASS] Contacts & Sharing lists owned documents and bundles annotations without an open document');
  await browser.close();
}

run().catch((error) => {
  console.error('TEST FAILED:', error);
  process.exit(1);
});
