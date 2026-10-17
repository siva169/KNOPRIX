import { chromium } from 'playwright';

const breakpoints = [
  { name: 'mobile-small', width: 390, height: 844 },
  { name: 'mobile-large', width: 425, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1024, height: 768 },
];

async function run() {
  const browser = await chromium.launch({ headless: true });
  console.log('Testing Knoprix Reading Desk & AI Wing Workspace Switcher...');

  for (const bp of breakpoints) {
    const page = await browser.newPage({ viewport: { width: bp.width, height: bp.height } });
    
    // Inject mock auth token to bypass login into authenticated workspace
    await page.addInitScript(() => {
      localStorage.setItem('knoprix_access_token', 'mock-qa-token');
      localStorage.setItem('knoprix_refresh_token', 'mock-qa-refresh');
      if (sessionStorage.getItem('qa-sidebar-state-reset') !== 'true') {
        localStorage.removeItem('knoprix_aiwing_sidebar_collapsed');
        sessionStorage.setItem('qa-sidebar-state-reset', 'true');
      }
      // Mock mock-user
      window.__MOCK_USER = { id: 'u1', email: 'test@knoprix.dev', full_name: 'Test Boss' };
    });

    // Mock API requests so preview is completely deterministic
    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'u1', email: 'test@knoprix.dev', full_name: 'Test Boss' },
          tokens: { accessToken: 'mock-qa-token' }
        }),
      });
    });

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'u1', email: 'test@knoprix.dev', full_name: 'Test Boss' } }),
      });
    });

    await page.route('**/api/projects', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projects: [
            { id: 'p1', name: 'Quantum Research', file_count: 2, created_at: new Date().toISOString() }
          ]
        }),
      });
    });

    await page.route('**/api/projects/p1/documents', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          documents: [
            { id: 'd1', project_id: 'p1', filename: 'quantum_paper.pdf', title: 'Quantum Paper', page_count: 12, ai_granted: true },
            { id: 'd2', project_id: 'p1', filename: 'lecture_notes.docx', title: 'Lecture Notes', page_count: 5, ai_granted: false }
          ]
        }),
      });
    });

    await page.route('**/api/projects/p1/bookmarks', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ bookmarks: [] }),
      });
    });

    await page.route('**/api/providers/allowlist', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          providers: [
            { id: 'groq-free', name: 'Groq Cloud', models: [{ id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B' }] }
          ]
        }),
      });
    });

    await page.route('**/api/artifacts**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ artifacts: [] }),
      });
    });

    await page.goto('http://localhost:4173/');
    await page.waitForLoadState('networkidle');

    // 1. Verify "Reading Desk" button is visible
    const readingDeskBtn = page.getByRole('button', { name: /Reading Desk/i });
    const isReadingDeskVisible = await readingDeskBtn.isVisible();

    // 2. Verify "AI Wing" button is visible
    const aiWingBtn = page.getByRole('button', { name: /AI Wing/i });
    const isAiWingVisible = await aiWingBtn.isVisible();

    if (!isReadingDeskVisible || !isAiWingVisible) {
      throw new Error(`[${bp.name}] Workspace buttons not visible! Reading Desk: ${isReadingDeskVisible}, AI Wing: ${isAiWingVisible}`);
    }

    if (bp.width >= 1024) {
      await page.getByRole('button', { name: 'Collapse workspace navigation' }).click();
      const expandWorkspaceNavigation = page.getByRole('button', { name: 'Expand workspace navigation' });
      if (!(await expandWorkspaceNavigation.isVisible())) {
        throw new Error(`[${bp.name}] Workspace navigation did not collapse.`);
      }
      await expandWorkspaceNavigation.click();
    } else {
      await page.getByTitle('Toggle folders').click();
      const closeWorkspaceNavigation = page.getByRole('button', { name: 'Close navigation' });
      if (!(await closeWorkspaceNavigation.isVisible())) {
        throw new Error(`[${bp.name}] Mobile workspace navigation did not open.`);
      }
      await closeWorkspaceNavigation.click();
      if (await closeWorkspaceNavigation.isVisible()) {
        throw new Error(`[${bp.name}] Mobile workspace navigation did not close.`);
      }
    }

    console.log(`[PASS] ${bp.name} (${bp.width}px): Reading Desk & AI Wing switcher buttons visible`);

    // 3. Click AI Wing
    await aiWingBtn.click();
    await page.waitForTimeout(300);

    // Verify AI Wing view elements: Document Grants and AI Wing tabs
    const docGrantsHeader = page.getByText(/Document Grants/i);
    const groundedChatTab = page.getByRole('button', { name: /Grounded Chat/i });
    const studyArtifactsTab = page.getByRole('button', { name: /Study Artifacts/i });
    const knowledgeMapTab = page.getByRole('button', { name: /Knowledge Map/i });

    const grantsVisible = await docGrantsHeader.isVisible();
    const chatVisible = await groundedChatTab.isVisible();
    const artifactsVisible = await studyArtifactsTab.isVisible();
    const mapVisible = await knowledgeMapTab.isVisible();

    if (!grantsVisible || !chatVisible || !artifactsVisible || !mapVisible) {
      throw new Error(`[${bp.name}] AI Wing content elements missing! Grants: ${grantsVisible}, Chat: ${chatVisible}, Artifacts: ${artifactsVisible}, Map: ${mapVisible}`);
    }

    // Verify the AI Wing sidebar retracts, remembers its state, and reopens.
    const collapseSidebar = page.getByRole('button', { name: 'Collapse AI Wing sidebar' });
    const authorizeButton = page.getByRole('button', { name: 'Authorize', exact: true });
    if (!(await authorizeButton.isVisible())) {
      throw new Error(`[${bp.name}] Document authorization controls are not visible before collapsing.`);
    }
    await collapseSidebar.click();
    const collapsedAuthorizeVisible = await authorizeButton.isVisible();
    const collapsedPreference = await page.evaluate(
      () => localStorage.getItem('knoprix_aiwing_sidebar_collapsed'),
    );
    if (collapsedAuthorizeVisible || collapsedPreference !== 'true') {
      throw new Error(`[${bp.name}] AI Wing sidebar did not collapse or persist its state.`);
    }

    await page.reload();
    await page.waitForLoadState('networkidle');
    await aiWingBtn.click();
    const persistedExpandSidebar = page.getByRole('button', { name: 'Expand AI Wing sidebar' });
    await persistedExpandSidebar.waitFor({ state: 'visible', timeout: 5000 });
    if (!(await persistedExpandSidebar.isVisible())) {
      const restoredPreference = await page.evaluate(
        () => localStorage.getItem('knoprix_aiwing_sidebar_collapsed'),
      );
      throw new Error(`[${bp.name}] AI Wing sidebar state was not restored after reload (stored: ${restoredPreference}).`);
    }
    await persistedExpandSidebar.click();
    if (!(await authorizeButton.isVisible())) {
      throw new Error(`[${bp.name}] AI Wing sidebar did not reopen its document controls.`);
    }

    // 4. Test Study Artifacts tab
    await studyArtifactsTab.click();
    await page.waitForTimeout(200);
    const flashcardsBtn = page.getByRole('button', { name: /Flashcards/i });
    const isFlashcardsVisible = await flashcardsBtn.isVisible();
    if (!isFlashcardsVisible) {
      throw new Error(`[${bp.name}] Study Artifacts Flashcard button missing!`);
    }

    // 5. Click back to Reading Desk
    await readingDeskBtn.click();
    await page.waitForTimeout(200);

    await page.close();
  }

  await browser.close();
  console.log('ALL BREAKPOINT CHECKS PASSED: 390px, 425px, 768px, 1024px');
}

run().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
