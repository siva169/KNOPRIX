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
    let providerFileStatus = [];
    let providerUploadCount = 0;
    let providerUploadAttempts = 0;
    const chatRequests = [];
    const providerUploadKeyHeaders = [];
    const providerAuthorizationRequests = [];
    
    // Inject mock auth token to bypass login into authenticated workspace
    await page.addInitScript(() => {
      localStorage.setItem('knoprix_access_token', 'mock-qa-token');
      localStorage.setItem('knoprix_refresh_token', 'mock-qa-refresh');
      localStorage.setItem('knoprix_mr_provider_keys', JSON.stringify({
        'nvidia-nim': 'unused-browser-key',
      }));
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
            { id: 'groq-free', name: 'Groq Cloud', models: [{ id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B' }] },
            {
              id: 'nvidia-nim',
              name: 'NVIDIA NIM (hosted trial)',
              hasServerKey: true,
              browserAvailable: true,
              models: [{
                id: 'nvidia/nemotron-3.5-lightning-30b-a3b',
                name: 'Nemotron 3.5 Lightning',
                fullDocumentChat: true,
              }],
            },
          ]
        }),
      });
    });

    await page.route('**/api/projects/p1/provider-documents**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ documents: providerFileStatus, pendingDeletions: [] }),
      });
    });

    await page.route('**/api/documents/d1/provider-authorization**', async (route) => {
      if (route.request().method() === 'POST') {
        providerUploadAttempts += 1;
        providerUploadKeyHeaders.push(route.request().headers()['x-provider-key'] || null);
        providerAuthorizationRequests.push(route.request().postDataJSON());
        if (providerUploadAttempts === 1) {
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ detail: 'Temporary provider upload failure.' }),
          });
          return;
        }
        providerUploadCount += 1;
        providerFileStatus = [{
          documentId: 'd1',
          fileName: 'Quantum Paper',
          status: 'ready',
          pageCount: 12,
        }];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ready', pageCount: 12 }),
        });
        return;
      }
      providerFileStatus = [{ documentId: 'd1', fileName: 'Quantum Paper', status: 'delete_pending' }];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ deletePending: true }),
      });
    });

    await page.route('**/api/provider-files/d1/retry-delete', async (route) => {
      providerFileStatus = [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ deletePending: false }),
      });
    });

    await page.route('**/api/chat/stream', async (route) => {
      chatRequests.push(route.request().postDataJSON());
      const responseText = `QA response ${chatRequests.length}`;
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          `event: thought\ndata: ${JSON.stringify({ text: 'Reading originals' })}`,
          `event: progress\ndata: ${JSON.stringify({ detail: 'Analyzing documents', current: 1, total: 1 })}`,
          `event: token\ndata: ${JSON.stringify({ text: responseText })}`,
          `event: done\ndata: ${JSON.stringify({ citations: [] })}`,
          '',
        ].join('\n\n'),
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
    const nvidiaOption = page.getByRole('option', { name: /NVIDIA NIM.*server key ready/ });
    if (await nvidiaOption.isDisabled()) {
      throw new Error(`[${bp.name}] NVIDIA provider was disabled despite server-key metadata.`);
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

    // Full-document consent, provider-file lifecycle, and streaming chat.
    const fullDocumentMode = page.getByRole('button', { name: 'Full documents' });
    await fullDocumentMode.waitFor({ state: 'visible' });
    if (await fullDocumentMode.isDisabled()) {
      throw new Error(`[${bp.name}] NVIDIA full-document mode should be available.`);
    }
    await fullDocumentMode.click();
    const questionInput = page.getByPlaceholder('Ask across every AI-enabled original document…');
    await questionInput.fill('Compare the key claims in the authorized originals.');
    await page.getByRole('button', { name: 'Ask AI' }).click();

    const transferDialog = page.getByRole('dialog', { name: 'Confirm document transfer' });
    await transferDialog.waitFor({ state: 'visible' });
    if (!(await transferDialog.getByText('Quantum Paper').isVisible())) {
      throw new Error(`[${bp.name}] Transfer dialog did not list the authorized document.`);
    }
    if (await transferDialog.getByText('Lecture Notes').count()) {
      throw new Error(`[${bp.name}] Transfer dialog included a document without AI authorization.`);
    }
    if (!(await transferDialog.getByText(/server-managed key/i).isVisible())) {
      throw new Error(`[${bp.name}] Transfer dialog omitted the server-managed key disclosure.`);
    }
    if (!(await transferDialog.getByText(/NVIDIA NIM.*Nemotron 3\.5 Lightning/i).isVisible())) {
      throw new Error(`[${bp.name}] Transfer dialog did not name the selected provider and model.`);
    }
    await transferDialog.getByRole('button', { name: 'Cancel' }).click();
    await transferDialog.waitFor({ state: 'hidden' });
    if (providerUploadAttempts !== 0 || chatRequests.length !== 0) {
      throw new Error(`[${bp.name}] Cancelling transfer must not upload or start a chat.`);
    }
    await page.getByRole('button', { name: 'Ask AI' }).click();
    await transferDialog.waitFor({ state: 'visible' });
    if (await questionInput.inputValue() !== 'Compare the key claims in the authorized originals.') {
      throw new Error(`[${bp.name}] Cancelling consent did not preserve the pending question.`);
    }
    await transferDialog.getByRole('button', { name: 'Confirm and upload' }).click();
    await transferDialog.getByRole('alert').getByText(/Temporary provider upload failure/i)
      .waitFor({ state: 'visible' });
    await transferDialog.getByRole('button', { name: 'Confirm and upload' }).click();
    await page.getByText('QA response 1', { exact: true }).waitFor({ state: 'visible' });
    if (chatRequests.length !== 1
      || chatRequests[0].mode !== 'full-document'
      || chatRequests[0].providerId !== 'nvidia-nim'
      || chatRequests[0].model !== 'nvidia/nemotron-3.5-lightning-30b-a3b'
      || chatRequests[0].question !== 'Compare the key claims in the authorized originals.'
      || providerUploadCount !== 1
      || providerUploadAttempts !== 2
      || providerAuthorizationRequests.some((request) =>
        request.providerId !== 'nvidia-nim'
        || request.model !== 'nvidia/nemotron-3.5-lightning-30b-a3b'
        || request.confirmed !== true)
      || providerUploadKeyHeaders.some(Boolean)) {
      throw new Error(`[${bp.name}] Full-document upload/chat request did not preserve the question and mode.`);
    }

    await page.getByRole('button', { name: 'Revoke provider copy for Quantum Paper' }).click();
    const retryInline = page.getByRole('button', { name: 'Retry provider deletion for Quantum Paper' });
    await retryInline.waitFor({ state: 'visible' });
    await questionInput.fill('Check the follow-up after revoking the provider copy.');
    await page.getByRole('button', { name: 'Ask AI' }).click();
    await transferDialog.waitFor({ state: 'visible' });
    await transferDialog.getByRole('button', { name: 'Retry deletion' }).click();
    await transferDialog.getByText('Upload required').waitFor({ state: 'visible' });
    await transferDialog.getByRole('button', { name: 'Confirm and upload' }).click();
    await page.getByText('QA response 2', { exact: true }).waitFor({ state: 'visible' });
    if (chatRequests.length !== 2 || providerUploadCount !== 2
      || providerUploadAttempts !== 3
      || providerUploadKeyHeaders.some(Boolean)
      || chatRequests[1].mode !== 'full-document'
      || chatRequests[1].providerId !== 'nvidia-nim'
      || chatRequests[1].model !== 'nvidia/nemotron-3.5-lightning-30b-a3b'
      || chatRequests[1].question !== 'Check the follow-up after revoking the provider copy.') {
      throw new Error(`[${bp.name}] Retry-delete and re-upload flow did not complete.`);
    }
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    if (dimensions.scrollWidth > dimensions.width + 1) {
      throw new Error(`[${bp.name}] AI Wing caused horizontal page overflow: ${JSON.stringify(dimensions)}.`);
    }
    console.log(`[PASS] ${bp.name} (${bp.width}px): consent, upload retry, full-document SSE, revoke, deletion retry, and no horizontal overflow`);

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
