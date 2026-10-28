import { chromium } from 'playwright';

const breakpoints = [
  { name: 'mobile-small', width: 390, height: 844 },
  { name: 'mobile-large', width: 425, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1024, height: 768 },
];

const favorite = {
  id: 'favorite-1',
  projectId: 'p1',
  question: 'Explain the indexed lookup.',
  answer: 'The indexed lookup uses the stored index to find the relevant entry quickly.',
  citations: [{ documentId: 'd1', pageNumber: 2, excerpt: 'Indexed lookup' }],
  providerId: 'zai-glm-free',
  modelId: 'glm-4.5-flash',
};

const json = (body) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

async function mockWorkspace(page) {
  await page.addInitScript(() => {
    localStorage.setItem('knoprix_access_token', 'mock-qa-token');
    localStorage.setItem('knoprix_refresh_token', 'mock-qa-refresh');
  });

  let savedFavorites = [];
  await page.route('**/api/auth/refresh', (route) => route.fulfill(json({
    user: { id: 'u1', email: 'test@knoprix.dev', full_name: 'Test Boss' },
    tokens: { accessToken: 'mock-qa-token' },
  })));
  await page.route('**/api/auth/me', (route) => route.fulfill(json({
    user: { id: 'u1', email: 'test@knoprix.dev', full_name: 'Test Boss' },
  })));
  await page.route('**/api/projects', (route) => route.fulfill(json({
    projects: [{ id: 'p1', name: 'Research', file_count: 0 }],
  })));
  await page.route('**/api/projects/p1/documents', (route) => route.fulfill(json({ documents: [] })));
  await page.route('**/api/projects/p1/bookmarks', (route) => route.fulfill(json({ bookmarks: [] })));
  await page.route('**/api/providers/allowlist', (route) => route.fulfill(json({
    providers: [{
      id: 'zai-glm-free',
      name: 'Z.AI GLM',
      hasServerKey: true,
      models: [{ id: 'glm-4.5-flash', name: 'GLM 4.5 Flash' }],
    }],
  })));
  await page.route('**/api/provider-files/status**', (route) => route.fulfill(json({ documents: [] })));
  await page.route('**/api/ai/favorites**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill(json({ favorites: savedFavorites }));
    }
    if (route.request().method() === 'POST') {
      savedFavorites = [{ ...favorite }, ...savedFavorites];
      return route.fulfill(json({ favorite }));
    }
    return route.continue();
  });
  await page.route('**/api/ai/favorites/*', async (route) => {
    if (route.request().method() === 'DELETE') {
      savedFavorites = [];
      return route.fulfill(json({ ok: true }));
    }
    return route.continue();
  });
  await page.route('**/api/chat/conversations', (route) => route.fulfill(json({
    conversation: { id: 'conversation-1', projectId: 'p1', title: 'Explain the indexed lookup.' },
  })));
  await page.route('**/api/chat/stream', (route) => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: [
      'event: token\ndata: {"text":"The indexed lookup uses the stored index to find the relevant entry quickly."}\n\n',
      'event: done\ndata: {"citations":[{"documentId":"d1","pageNumber":2,"excerpt":"Indexed lookup"}]}\n\n',
    ].join(''),
  }));
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
    await page.getByRole('button', { name: 'AI Wing' }).click();
    await page.getByRole('textbox', { name: 'Ask AI anything' }).fill(favorite.question);
    await page.getByRole('button', { name: 'Ask AI' }).click();
    await page.getByRole('button', { name: 'Confirm and send' }).click();
    await page.getByText(favorite.answer).waitFor({ state: 'visible' });

    const saveButton = page.getByRole('button', { name: 'Save response to AI Favorites' });
    await saveButton.click();
    await page.getByRole('button', { name: 'Remove response from AI Favorites' }).waitFor({ state: 'visible' });

    await page.getByTitle('Bookmark collection').click();
    await page.getByRole('button', { name: 'AI Favorites', exact: true }).click();
    await page.getByText('Saved AI responses').waitFor({ state: 'visible' });
    await page.getByText(favorite.question).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: `Remove AI Favorite: ${favorite.question}` }).click();
    await page.getByText('No AI responses saved yet.').waitFor({ state: 'visible' });
    console.log(`[PASS] ${breakpoint.name} (${breakpoint.width}px): AI response favorite round-trip`);
    await page.close();
  }
  await browser.close();
  console.log('ALL AI FAVORITES CHECKS PASSED: 390px, 425px, 768px, 1024px');
}

run().catch((error) => {
  console.error('TEST FAILED:', error);
  process.exit(1);
});
