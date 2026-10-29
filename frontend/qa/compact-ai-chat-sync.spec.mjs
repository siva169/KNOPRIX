import { chromium } from 'playwright';

const breakpoints = [
  { name: 'mobile-small', width: 390, height: 844 },
  { name: 'mobile-large', width: 425, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1024, height: 768 },
];

async function mockWorkspace(page, state) {
  await page.addInitScript(() => {
    localStorage.setItem('knoprix_access_token', 'mock-qa-token');
    localStorage.setItem('knoprix_refresh_token', 'mock-qa-refresh');
    localStorage.setItem('knoprix_mr_key_notice_seen', '1');
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
        ai_granted: true,
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
  await page.route('**/api/ai/favorites*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ favorites: [] }),
  }));
  await page.route('**/api/documents/d1/stream', (route) => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'QA does not need document bytes.' }),
  }));
  await page.route('**/api/chat/conversations**', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      state.createdConversation = body;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          conversation: {
            id: 'compact-conversation',
            projectId: body.projectId,
            title: body.title,
            updatedAt: '2026-10-29T10:00:00Z',
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        conversations: [{
          id: 'compact-conversation',
          projectId: 'p1',
          title: 'Explain the document',
          updatedAt: '2026-10-29T10:00:00Z',
        }],
        pagination: { total: 1, limit: 20, offset: 0 },
      }),
    });
  });
  await page.route('**/api/chat/stream', async (route) => {
    state.streamRequest = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        'event: meta',
        'data: {"provider":"zai-glm-free","model":"glm-4.5-flash","searchAvailable":false}',
        '',
        'event: token',
        'data: {"text":"Compact stream answer"}',
        '',
        'event: done',
        'data: {"citations":[],"done":true}',
        '',
      ].join('\n'),
    });
  });
}

async function run() {
  const browser = await chromium.launch({ headless: true });

  for (const breakpoint of breakpoints) {
    const state = {};
    const page = await browser.newPage({ viewport: { width: breakpoint.width, height: breakpoint.height } });
    await mockWorkspace(page, state);
    await page.goto('http://localhost:4173/');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Open quantum_paper.pdf' }).first().click();
    await page.locator('button[title="Chat with your documents"]').click();

    const compactChat = page.getByRole('dialog', { name: 'Document chat' });
    await compactChat.waitFor({ state: 'visible' });
    if (await compactChat.getByRole('button', { name: 'Recent chats' }).count()) {
      throw new Error(`[${breakpoint.name}] Compact chat exposed a previous-chat browser.`);
    }

    await compactChat.getByLabel('Chat question').fill('Explain the document');
    await compactChat.getByTitle('Ask').click();
    const consent = page.getByRole('dialog', { name: 'Review what goes to AI' });
    await consent.getByRole('button', { name: 'Confirm and send' }).click();
    await compactChat.getByText('Compact stream answer', { exact: true }).waitFor({ state: 'visible' });

    if (state.createdConversation?.projectId !== 'p1') {
      throw new Error(`[${breakpoint.name}] Compact chat did not create a project-scoped conversation.`);
    }
    if (state.streamRequest?.conversationId !== 'compact-conversation') {
      throw new Error(`[${breakpoint.name}] Compact chat did not use the saved conversation stream.`);
    }
    if (state.streamRequest?.documentIds?.join(',') !== 'd1' || state.streamRequest?.confirmed !== true) {
      throw new Error(`[${breakpoint.name}] Compact chat did not send the authorized document context contract.`);
    }

    await compactChat.getByRole('button', { name: 'Close chat' }).click();
    await page.getByRole('button', { name: 'AI Wing' }).click();
    await page.getByRole('button', { name: 'Recent chats' }).click();
    const recentChats = page.getByRole('dialog', { name: 'Recent chats' });
    await recentChats.getByText('Explain the document', { exact: true }).waitFor({ state: 'visible' });
    console.log(`[PASS] ${breakpoint.name} (${breakpoint.width}px): compact and AI Wing share chat history`);
    await page.close();
  }

  await browser.close();
  console.log('ALL COMPACT AI CHAT SYNC CHECKS PASSED: 390px, 425px, 768px, 1024px');
}

run().catch((error) => {
  console.error('TEST FAILED:', error);
  process.exit(1);
});
