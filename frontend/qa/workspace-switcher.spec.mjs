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
    const page = await browser.newPage({
      viewport: { width: bp.width, height: bp.height },
      reducedMotion: bp.width === 390 ? 'reduce' : 'no-preference',
    });
    let providerFileStatus = [{
      documentId: 'd1',
      fileName: 'Quantum Paper',
      status: 'ready',
      pageCount: 12,
    }];
    const chatRequests = [];
    const conversations = new Map();
    const savedMessages = new Map();
    let nextConversationId = 1;
    let delayNextConversationList = false;
    let failNextConversationList = false;
    const providerDeleteRequests = [];
    let providerRetryCount = 0;
    
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
            {
              id: 'zai-glm-free',
              name: 'Z.AI GLM',
              hasServerKey: true,
              models: [{
                id: 'glm-4.5-flash',
                name: 'GLM 4.5 Flash',
              }],
            },
            { id: 'groq-free', name: 'Groq Cloud', models: [{ id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B' }] },
            {
              id: 'nvidia-nim',
              name: 'NVIDIA NIM (hosted trial)',
              hasServerKey: true,
              browserAvailable: true,
              models: [{
                id: 'nvidia/nemotron-3.5-lightning-30b-a3b',
                name: 'Nemotron 3.5 Lightning',
              }],
            },
            {
              id: 'gemini-free',
              name: 'Google Gemini',
              hasServerKey: true,
              models: [{
                id: 'gemini-3.8-flash',
                name: 'Gemini 3.8 Flash',
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
      providerDeleteRequests.push(route.request().method());
      providerFileStatus = [{
        documentId: 'd1',
        fileName: 'Quantum Paper',
        status: 'delete_pending',
        pageCount: 12,
      }];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ deletePending: true }),
      });
    });

    await page.route('**/api/provider-files/d1/retry-delete', async (route) => {
      providerRetryCount += 1;
      providerFileStatus = [{
        documentId: 'd1',
        fileName: 'Quantum Paper',
        status: 'revoked',
        pageCount: 12,
      }];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ deletePending: false }),
      });
    });

    await page.route('**/api/chat/conversations**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace(/\/+$/, '');
      const collectionPath = '/api/chat/conversations';
      const method = request.method();
      const timestamp = new Date().toISOString();

      if (path === collectionPath && method === 'GET') {
        if (delayNextConversationList) {
          delayNextConversationList = false;
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
        if (failNextConversationList) {
          failNextConversationList = false;
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ detail: 'History is temporarily unavailable.' }),
          });
          return;
        }
        const search = (url.searchParams.get('search') || '').toLocaleLowerCase();
        const items = [...conversations.values()]
          .filter((conversation) => conversation.title.toLocaleLowerCase().includes(search))
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        const offset = Number(url.searchParams.get('offset') || 0);
        const limit = Number(url.searchParams.get('limit') || 20);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            conversations: items.slice(offset, offset + limit),
            pagination: { limit, offset, total: items.length },
          }),
        });
        return;
      }

      if (path === collectionPath && method === 'POST') {
        const body = request.postDataJSON();
        const id = `conversation-${nextConversationId++}`;
        const conversation = {
          id,
          title: body.title || 'New chat',
          projectId: body.projectId || null,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        conversations.set(id, conversation);
        savedMessages.set(id, []);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ conversation }),
        });
        return;
      }

      const conversationId = decodeURIComponent(path.slice(`${collectionPath}/`.length));
      const conversation = conversations.get(conversationId);
      if (!conversation) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Conversation not found' }),
        });
        return;
      }

      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            conversation,
            messages: savedMessages.get(conversationId) || [],
          }),
        });
      } else if (method === 'PATCH') {
        const body = request.postDataJSON();
        const updated = { ...conversation, title: body.title, updatedAt: timestamp };
        conversations.set(conversationId, updated);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ conversation: updated }),
        });
      } else if (method === 'DELETE') {
        conversations.delete(conversationId);
        savedMessages.delete(conversationId);
        await route.fulfill({ status: 204, body: '' });
      }
    });

    await page.route('**/api/chat/stream', async (route) => {
      const requestBody = route.request().postDataJSON();
      chatRequests.push(requestBody);
      const responseNumber = chatRequests.length;
      const timestamp = new Date().toISOString();
      const responseText = requestBody.documentIds.length
        ? 'QA document answer. [Quantum Paper, p. 1]'
        : 'QA general answer with a web source.';
      const citations = requestBody.documentIds.length
        ? [{
          sourceType: 'document',
          documentId: 'd1',
          fileName: 'Quantum Paper',
          pageNumber: 1,
          excerpt: 'Document excerpt',
        }]
        : [{
          sourceType: 'web',
          url: 'https://example.com/reference',
          title: 'Reference guide',
          startIndex: 0,
          endIndex: responseText.length,
        }];
      const searchAvailable = requestBody.providerId === 'gemini-free'
        && requestBody.model === 'gemini-3.8-flash';
      const searchUsed = searchAvailable && requestBody.documentIds.length === 0;
      const conversation = conversations.get(requestBody.conversationId);
      if (!conversation) throw new Error('Chat request used an unknown conversation.');
      const messages = savedMessages.get(conversation.id) || [];
      messages.push(
        {
          id: `user-${responseNumber}`,
          role: 'user',
          content: requestBody.question,
          citations: [],
        },
        {
          id: `assistant-${responseNumber}`,
          role: 'assistant',
          content: responseText,
          citations,
        },
      );
      savedMessages.set(conversation.id, messages);
      conversations.set(conversation.id, { ...conversation, updatedAt: timestamp });
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          `event: meta\ndata: ${JSON.stringify({ hasKey: true, searchAvailable })}`,
          `event: thought\ndata: ${JSON.stringify({ text: 'Preparing an answer' })}`,
          `event: token\ndata: ${JSON.stringify({ text: responseText })}`,
          ...citations.map((citation) => `event: citation\ndata: ${JSON.stringify(citation)}`),
          `event: done\ndata: ${JSON.stringify({
            citations,
            searchAvailable,
            searchUsed,
            includedChatMessages: searchAvailable ? 1 : 0,
          })}`,
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
    const aiChatTab = page.getByRole('button', { name: /AI Chat/i });
    const studyArtifactsTab = page.getByRole('button', { name: /Study Artifacts/i });
    const knowledgeMapTab = page.getByRole('button', { name: /Knowledge Map/i });

    const grantsVisible = await docGrantsHeader.isVisible();
    const chatVisible = await aiChatTab.isVisible();
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

    // General AI chat, source context, and account-synced history.
    delayNextConversationList = true;
    failNextConversationList = true;
    await page.getByRole('button', { name: 'Recent chats', exact: true }).click();
    const initialRecentDialog = page.getByRole('dialog', { name: 'Recent chats' });
    await initialRecentDialog.getByText('Loading your chats…').waitFor({ state: 'visible' });
    await initialRecentDialog.getByText(/Couldn’t load saved chats/).waitFor({ state: 'visible' });
    await initialRecentDialog.getByRole('button', { name: 'Retry' }).click();
    await initialRecentDialog.getByText('No saved chats yet').waitFor({ state: 'visible' });
    if (!(await initialRecentDialog.getByRole('textbox', { name: 'Search chat titles' })
      .evaluate((input) => document.activeElement === input))) {
      throw new Error(`[${bp.name}] Retrying history did not restore focus to the search field.`);
    }
    await page.keyboard.press('Escape');
    await initialRecentDialog.waitFor({ state: 'hidden' });
    if (!(await page.getByRole('button', { name: 'Recent chats', exact: true })
      .evaluate((button) => document.activeElement === button))) {
      throw new Error(`[${bp.name}] Closing Recent Chats did not restore focus to its launcher.`);
    }

    const questionInput = page.getByRole('textbox', {
      name: 'Ask AI anything',
    });
    if (await page.getByRole('button', { name: 'Retrieval', exact: true }).count()
      || await page.getByRole('button', { name: 'Document text', exact: true }).count()) {
      throw new Error(`[${bp.name}] The retired chat mode selector is still visible.`);
    }
    const documentContextToggle = page.getByRole('checkbox', {
      name: /Include authorized documents/,
    });
    if (!(await documentContextToggle.isChecked())) {
      throw new Error(`[${bp.name}] Authorized document context should be enabled by default.`);
    }
    await questionInput.fill('Explain the authorized document in detail.');
    await page.getByRole('button', { name: 'Ask AI' }).click();
    const contextDialog = page.getByRole('dialog', { name: 'Review what goes to AI' });
    await contextDialog.waitFor({ state: 'visible' });
    if (!(await contextDialog.getByText('Quantum Paper').isVisible())
      || await contextDialog.getByText('Lecture Notes').count()
      || !(await contextDialog.getByText(/Z\.AI GLM.*GLM 4\.5 Flash/i).isVisible())
      || !(await contextDialog.getByText(/Relevant extracted passages only/i).isVisible())
      || !(await contextDialog.getByText(/Relevant messages from your saved chats may be included/i).isVisible())) {
      throw new Error(`[${bp.name}] Consent dialog omitted provider/model, document scope, or saved-chat disclosure.`);
    }
    await contextDialog.getByRole('button', { name: 'Cancel' }).click();
    await contextDialog.waitFor({ state: 'hidden' });
    if (chatRequests.length !== 0 || conversations.size !== 0
      || await questionInput.inputValue() !== 'Explain the authorized document in detail.') {
      throw new Error(`[${bp.name}] Cancelling consent must preserve the question and create/send nothing.`);
    }

    await page.getByRole('button', { name: 'Ask AI' }).click();
    await contextDialog.waitFor({ state: 'visible' });
    await contextDialog.getByRole('button', { name: 'Confirm and send' }).click();
    await page.getByText(/QA document answer\./).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Quantum Paper, p\. 1/ }).waitFor({ state: 'visible' });
    if (chatRequests.length !== 1
      || chatRequests[0].confirmed !== true
      || chatRequests[0].conversationId !== 'conversation-1'
      || chatRequests[0].projectId !== 'p1'
      || chatRequests[0].providerId !== 'zai-glm-free'
      || chatRequests[0].model !== 'glm-4.5-flash'
      || chatRequests[0].documentIds.join(',') !== 'd1'
      || chatRequests[0].question !== 'Explain the authorized document in detail.'
      || Object.hasOwn(chatRequests[0], 'mode')) {
      throw new Error(`[${bp.name}] Confirmed chat did not preserve its provider, conversation, scope, and question.`);
    }

    await page.getByRole('button', { name: 'Recent chats', exact: true }).click();
    const recentDialog = page.getByRole('dialog', { name: 'Recent chats' });
    await recentDialog.waitFor({ state: 'visible' });
    const firstChatRow = recentDialog.locator('li').filter({
      hasText: 'Explain the authorized document in detail.',
    });
    await firstChatRow.waitFor({ state: 'visible' });
    await firstChatRow.getByRole('button').first().click();
    await page.getByText(/QA document answer\./).waitFor({ state: 'visible' });

    await page.getByRole('button', { name: 'Recent chats', exact: true }).click();
    const loadedRecentDialog = page.getByRole('dialog', { name: 'Recent chats' });
    const loadedChatRow = loadedRecentDialog.locator('li').filter({
      hasText: 'Explain the authorized document in detail.',
    });
    await loadedChatRow.waitFor({ state: 'visible' });
    await loadedChatRow.getByRole('button', {
      name: 'Rename Explain the authorized document in detail.',
    }).click();
    const renameDialog = page.getByRole('dialog', { name: 'Rename chat' });
    await renameDialog.getByRole('textbox', { name: 'Chat title' }).fill('Quantum primer');
    await renameDialog.getByRole('button', { name: 'Save title' }).click();
    await page.getByRole('status').getByText('Chat renamed', { exact: true })
      .waitFor({ state: 'visible' });
    await loadedRecentDialog.getByRole('textbox', { name: 'Search chat titles' }).fill('Quantum');
    const renamedChatRow = loadedRecentDialog.locator('li').filter({
      hasText: 'Quantum primer',
    });
    await renamedChatRow.getByRole('button').first().waitFor({ state: 'visible' });
    await loadedRecentDialog.getByRole('textbox', { name: 'Search chat titles' }).fill('no matching title');
    await loadedRecentDialog.getByText('No matching chat titles').waitFor({ state: 'visible' });
    await loadedRecentDialog.getByRole('textbox', { name: 'Search chat titles' }).fill('Quantum');
    await renamedChatRow.getByRole('button').first().waitFor({ state: 'visible' });
    await loadedRecentDialog.getByRole('textbox', { name: 'Search chat titles' }).fill('');
    await loadedRecentDialog.getByRole('button', { name: 'New chat' }).click();
    await loadedRecentDialog.waitFor({ state: 'hidden' });

    await page.locator('select').first().selectOption('gemini-free');
    await documentContextToggle.uncheck();
    await questionInput.fill('Explain black holes in simple terms.');
    await page.getByRole('button', { name: 'Ask AI' }).click();
    await contextDialog.waitFor({ state: 'visible' });
    if (!(await contextDialog.getByText('No document passages will be sent with this question.').isVisible())
      || !(await contextDialog.getByText(/Gemini may use live web search/i).isVisible())
      || !(await contextDialog.getByText(/may have separate provider charges/i).isVisible())) {
      throw new Error(`[${bp.name}] General-chat consent omitted no-document or live-search billing disclosures.`);
    }
    await contextDialog.getByRole('button', { name: 'Confirm and send' }).click();
    await page.getByText(/QA general answer with a web source\./).waitFor({ state: 'visible' });
    const webCitation = page.getByRole('link', {
      name: 'Web source 1: Reference guide',
    });
    await webCitation.waitFor({ state: 'visible' });
    if (await webCitation.getAttribute('href') !== 'https://example.com/reference'
      || await webCitation.getAttribute('target') !== '_blank'
      || !(await webCitation.getAttribute('rel')).includes('noopener')) {
      throw new Error(`[${bp.name}] Web citation link is not safely configured.`);
    }
    if (chatRequests.length !== 2
      || chatRequests[1].conversationId !== 'conversation-2'
      || chatRequests[1].documentIds.length !== 0
      || Object.hasOwn(chatRequests[1], 'confirmed')
      || Object.hasOwn(chatRequests[1], 'mode')
      || chatRequests[1].providerId !== 'gemini-free'
      || chatRequests[1].model !== 'gemini-3.8-flash') {
      throw new Error(`[${bp.name}] General chat incorrectly required or sent document context.`);
    }
    if (await page.getByText(/Grounded Citations/i).count()) {
      throw new Error(`[${bp.name}] Citations should appear inline, not in a separate citation panel.`);
    }

    await page.getByRole('button', { name: 'Recent chats', exact: true }).click();
    const finalRecentDialog = page.getByRole('dialog', { name: 'Recent chats' });
    const titleSearch = finalRecentDialog.getByRole('textbox', { name: 'Search chat titles' });
    await titleSearch.fill('black holes');
    const secondChatRow = finalRecentDialog.locator('li').filter({ hasText: 'Explain black holes in simple terms.' });
    await secondChatRow.waitFor({ state: 'visible' });
    await titleSearch.fill('Quantum');
    const finalRenamedRow = finalRecentDialog.locator('li').filter({ hasText: 'Quantum primer' });
    await finalRenamedRow.waitFor({ state: 'visible' });
    page.once('dialog', (dialog) => dialog.accept());
    await finalRenamedRow.getByRole('button', {
      name: 'Delete Quantum primer',
    }).click();
    await finalRenamedRow.waitFor({ state: 'detached' });
    await page.getByRole('status').getByText('Chat deleted', { exact: true })
      .waitFor({ state: 'visible' });
    await titleSearch.focus();
    await page.keyboard.press('Escape');
    await finalRecentDialog.waitFor({ state: 'hidden' });

    await page.getByRole('button', { name: 'Revoke provider copy for Quantum Paper' }).click();
    const retryInline = page.getByRole('button', { name: 'Retry provider deletion for Quantum Paper' });
    await retryInline.waitFor({ state: 'visible' });
    await retryInline.click();
    await page.getByText(/Provider copy revoked/i).waitFor({ state: 'visible' });
    if (providerDeleteRequests.join(',') !== 'DELETE' || providerRetryCount !== 1) {
      throw new Error(`[${bp.name}] Provider-copy cleanup did not use the retained revoke route.`);
    }

    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    if (dimensions.scrollWidth > dimensions.width + 1) {
      throw new Error(`[${bp.name}] AI Wing caused horizontal page overflow: ${JSON.stringify(dimensions)}.`);
    }
    console.log(`[PASS] ${bp.name} (${bp.width}px): unified chat, consent/cancel, document/web citations, history search/rename/delete, provider cleanup, and no horizontal overflow`);

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
