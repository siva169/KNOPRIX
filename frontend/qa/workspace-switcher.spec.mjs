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
            { id: 'groq-free', name: 'Groq Cloud', models: [{ id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' }] }
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
