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
  extracted_text: 'Introduction\nExact bookmark target appears here.\nConclusion',
};

const bookmark = {
  id: 'b1',
  project_id: 'p1',
  document_id: 'd1',
  name: 'Exact target',
  highlighted_text: 'Exact bookmark target appears here.',
  notes: '',
  bookmark_type: 'text',
  page_number: 1,
  anchor_start: null,
  anchor_end: null,
};

async function mockWorkspace(page) {
  await page.addInitScript(() => {
    localStorage.setItem('knoprix_access_token', 'mock-qa-token');
    localStorage.setItem('knoprix_refresh_token', 'mock-qa-refresh');
  });

  const json = (body) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
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
  await page.route('**/api/projects/p1/documents', (route) => route.fulfill(json({
    documents: [documentData],
  })));
  await page.route('**/api/projects/p1/bookmarks', (route) => route.fulfill(json({
    bookmarks: [bookmark],
  })));
  await page.route('**/api/documents/d1/highlights', (route) => route.fulfill(json({
    highlights: [],
  })));
  await page.route('**/api/providers/allowlist', (route) => route.fulfill(json({
    providers: [],
  })));
}

async function assertExactBookmarkJump(page, openBookmark) {
  await openBookmark();
  const targetPage = page.locator('[data-page="1"].bookmark-jump-active');
  await targetPage.waitFor({ state: 'visible' });
  const selectedText = await page.evaluate(() => window.getSelection()?.toString());
  if (selectedText !== bookmark.highlighted_text) {
    throw new Error(`Expected exact bookmark selection, received: ${selectedText}`);
  }
}

async function run() {
  const browser = await chromium.launch({ headless: true });

  for (const breakpoint of breakpoints) {
    const page = await browser.newPage({
      viewport: { width: breakpoint.width, height: breakpoint.height },
      reducedMotion: 'reduce',
    });
    await mockWorkspace(page);
    await page.goto('http://localhost:4173/');
    await page.getByRole('button', { name: 'Open notes.txt' }).click();

    await page.locator('button[title="Bookmark collection"]').click();
    await page.getByRole('button', { name: 'View bookmarks for notes.txt: 1 bookmarks' }).click();
    await assertExactBookmarkJump(page, () => page.getByRole('button', { name: 'Open bookmark: Exact target' }).click());

    if (breakpoint.width >= 1024) {
      await page.getByRole('button', {
        name: 'Show saved items for notes.txt: 1 bookmarks and 0 highlights',
      }).click();
      await assertExactBookmarkJump(page, () => page.getByRole('button', {
        name: 'Open bookmark: Exact target in notes.txt, page 1',
      }).click());
    }

    console.log(`[PASS] ${breakpoint.name} (${breakpoint.width}px): organizer exact jump${breakpoint.width >= 1024 ? ' and sidebar exact jump' : ''}`);
    await page.close();
  }

  await browser.close();
  console.log('ALL BOOKMARK NAVIGATION CHECKS PASSED: 390px, 425px, 768px, 1024px');
}

run().catch((error) => {
  console.error('TEST FAILED:', error);
  process.exit(1);
});
