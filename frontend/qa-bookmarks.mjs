/* Bookmark regression QA against a mocked API; writes local responsive evidence. */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const evidenceDir = fileURLToPath(new URL('../qa-artifacts/knoprix-bookmarks/', import.meta.url));
mkdirSync(evidenceDir, { recursive: true });

const results = [];
let flowError = '';
const check = (name, passed, detail = '') => {
  results.push([name, Boolean(passed)]);
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const documents = [
  {
    id: 'document-1',
    project_id: 'project-1',
    file_name: 'source.txt',
    file_type: 'txt',
    file_path: 'source.txt',
    file_size: 64,
    page_count: 1,
    extracted_text: 'First duplicate anchor\nSecond duplicate anchor\nAlpha beta gamma delta',
  },
  {
    id: 'document-2',
    project_id: 'project-1',
    file_name: 'other.txt',
    file_type: 'txt',
    file_path: 'other.txt',
    file_size: 24,
    page_count: 1,
    extracted_text: 'A different document',
  },
  {
    id: 'document-3',
    project_id: 'project-1',
    file_name: 'selection-visual.pdf',
    file_type: 'pdf',
    file_path: 'selection-visual.pdf',
    file_size: 23894176,
    page_count: 10,
    extracted_text: '',
  },
  {
    id: 'document-4',
    project_id: 'project-1',
    file_name: 'presentation.pptx',
    file_type: 'pptx',
    file_path: 'presentation.pptx',
    file_size: 128,
    page_count: 1,
    extracted_text: '',
  },
];
const bookmarks = [{
  id: 'legacy-bookmark',
  user_id: 'user-1',
  project_id: 'project-1',
  document_id: 'document-1',
  page_number: 1,
  name: 'Legacy title',
  highlighted_text: 'duplicate anchor',
  notes: '',
  bookmark_type: 'text',
  anchor_start: null,
  anchor_end: null,
  created_at: '2025-01-01T00:00:00.000000+00:00',
}];
let nextBookmarkId = 1;
const highlights = [];
let nextHighlightId = 1;
let presentationPreviewRequests = 0;
let contactsRequests = 0;
let failContactsRequests = true;
let sourceDocumentShareAccepted = false;

const respond = (route, status, data) => route.fulfill({
  status,
  contentType: 'application/json',
  body: data === null ? '' : JSON.stringify(data),
});

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
await page.addInitScript(() => {
  class QaClipboardItem {
    constructor(items) {
      this.items = items;
      this.types = Object.keys(items);
    }

    getType(type) {
      return Promise.resolve(this.items[type]);
    }
  }
  Object.defineProperty(window, 'ClipboardItem', { configurable: true, value: QaClipboardItem });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      async write(items) {
        if (window.__failClipboardWrite) throw new Error('Clipboard permission denied');
        window.__copiedClipboardItems = await Promise.all(items.map(async (item) => ({
          types: item.types,
          pngSize: (await item.getType('image/png')).size,
        })));
      },
    },
  });
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  const expectedMockFailure = /status of (?:404|503)/.test(message.text());
  if (message.type() === 'error' && !expectedMockFailure) {
    errors.push(message.text());
  }
});
await page.route('**/api/**', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;

  if (path === '/api/documents/document-3/stream') {
    return route.fulfill({
      contentType: 'application/pdf',
      path: fileURLToPath(new URL('../backend/uploads/1789381445896-6523eb3b-23AID204_Lecture16-18.pdf', import.meta.url)),
    });
  }
  if (path === '/api/documents/document-4/preview.pdf') {
    presentationPreviewRequests += 1;
    return route.fulfill({
      contentType: 'application/pdf',
      path: fileURLToPath(new URL('../backend/uploads/1789381445896-6523eb3b-23AID204_Lecture16-18.pdf', import.meta.url)),
    });
  }

  if (path === '/api/documents/document-1' && request.method() === 'GET') {
    return sourceDocumentShareAccepted
      ? respond(route, 200, { document: { ...documents[0], readOnly: true } })
      : respond(route, 404, { detail: 'Document not found' });
  }

  if (path === '/api/auth/refresh' && request.method() === 'POST') {
    return respond(route, 200, {
      tokens: { accessToken: 'bookmark-qa-token' },
      user: { id: 'user-1', email: 'qa@example.test', full_name: 'QA User' },
    });
  }
  if (path === '/api/auth/me') {
    return respond(route, 200, { id: 'user-1', email: 'qa@example.test', full_name: 'QA User' });
  }
  if (path === '/api/projects' && request.method() === 'GET') {
    return respond(route, 200, {
      projects: [{ id: 'project-1', name: 'Bookmark QA', file_count: documents.length }],
    });
  }
  if (path === '/api/projects/project-1/documents') {
    return respond(route, 200, {
      documents: documents.map((doc) => ({
        ...doc,
        bookmark_count: bookmarks.filter((bookmark) => bookmark.document_id === doc.id).length,
        highlight_count: highlights.filter((highlight) => highlight.document_id === doc.id).length,
      })),
    });
  }
  if (path === '/api/projects/project-1/bookmarks' && request.method() === 'GET') {
    const query = (url.searchParams.get('q') || '').toLocaleLowerCase();
    const results = [...bookmarks].reverse().filter((bookmark) =>
      [bookmark.name, bookmark.highlighted_text, bookmark.notes]
        .some((value) => (value || '').toLocaleLowerCase().includes(query)),
    );
    return respond(route, 200, { bookmarks: results, bookmarkCollection: { size: results.length } });
  }
  if (path === '/api/bookmarks' && request.method() === 'POST') {
    const body = request.postDataJSON();
    const bookmark = {
      id: `bookmark-${nextBookmarkId++}`,
      user_id: 'user-1',
      project_id: body.projectId,
      document_id: body.documentId,
      page_number: body.pageNumber,
      name: body.name || '',
      highlighted_text: body.highlightedText || '',
      notes: body.notes || '',
      bookmark_type: body.bookmarkType || 'text',
      anchor_start: body.selectionStart ?? null,
      anchor_end: body.selectionEnd ?? null,
      region_x: body.region?.x ?? null,
      region_y: body.region?.y ?? null,
      region_width: body.region?.width ?? null,
      region_height: body.region?.height ?? null,
      created_at: new Date(Date.now() + nextBookmarkId).toISOString(),
    };
    bookmarks.push(bookmark);
    return respond(route, 201, { id: bookmark.id });
  }
  if (path.startsWith('/api/bookmarks/') && request.method() === 'DELETE') {
    const id = path.split('/').at(-1);
    const index = bookmarks.findIndex((bookmark) => bookmark.id === id);
    if (index !== -1) bookmarks.splice(index, 1);
    return respond(route, 204, null);
  }
  if (/^\/api\/documents\/[^/]+\/highlights$/.test(path) && request.method() === 'GET') {
    const documentId = path.split('/').at(-2);
    return respond(route, 200, {
      highlights: highlights.filter((highlight) => highlight.document_id === documentId),
    });
  }
  if (path === '/api/highlights' && request.method() === 'POST') {
    const body = request.postDataJSON();
    const highlight = {
      id: `highlight-${nextHighlightId++}`,
      document_id: body.documentId,
      page_number: body.pageNumber,
      text: body.text,
      color: body.color,
      match_all: body.matchAll ? 1 : 0,
      anchor_start: body.selectionStart ?? null,
      anchor_end: body.selectionEnd ?? null,
      highlight_type: body.highlightType || 'text',
      region_x: body.region?.x ?? null,
      region_y: body.region?.y ?? null,
      region_width: body.region?.width ?? null,
      region_height: body.region?.height ?? null,
    };
    highlights.push(highlight);
    return respond(route, 201, { id: highlight.id });
  }
  if (path.startsWith('/api/highlights/') && request.method() === 'PATCH') {
    const id = path.split('/').at(-1);
    const highlight = highlights.find((item) => item.id === id);
    if (highlight) highlight.color = request.postDataJSON().color;
    return respond(route, highlight ? 200 : 404, highlight ? { id, color: highlight.color } : {});
  }
  if (path.startsWith('/api/highlights/') && request.method() === 'DELETE') {
    const id = path.split('/').at(-1);
    const index = highlights.findIndex((highlight) => highlight.id === id);
    if (index !== -1) highlights.splice(index, 1);
    return respond(route, 204, null);
  }
  if (path === '/api/v1/profile') {
    return respond(route, 200, {
      knoprixId: 'KP-AAAAAAAAAA',
      allowIdLookup: true,
      allowContactRequests: true,
      emailNotificationsEnabled: false,
    });
  }
  if (path === '/api/v1/contacts') {
    contactsRequests += 1;
    if (failContactsRequests) return respond(route, 503, { detail: 'Temporary contacts outage' });
    return respond(route, 200, {
      contacts: [{ contactId: 'contact-1', knoprixId: 'KP-BBBBBBBBBB', fullName: 'Study Partner' }],
    });
  }
  if (path === '/api/v1/inbox') {
    return respond(route, 200, { contactRequests: [], shareRequests: [] });
  }
  if (path === '/api/v1/contact-requests/sent') {
    return respond(route, 200, { requests: [] });
  }
  if (path === '/api/v1/shares/sent') {
    return respond(route, 200, { shares: [] });
  }
  if (path === '/api/v1/shares/received') {
    return respond(route, 200, {
      shares: [{
        shareId: 'share-annotation',
        resourceType: 'highlight',
        status: 'accepted',
        fromKnoprixId: 'KP-BBBBBBBBBB',
      }],
    });
  }
  if (path === '/api/v1/shared-resources/share-annotation') {
    const sharedHighlight = highlights.find((highlight) =>
      highlight.document_id === 'document-1' && highlight.text === 'duplicate anchor',
    );
    return respond(route, 200, {
      shareId: 'share-annotation',
      resourceType: 'highlight',
      resource: {
        ...sharedHighlight,
        document_id: 'document-1',
        page_number: 1,
      },
      readOnly: true,
    });
  }
  if (path === '/api/v1/blocks') {
    return respond(route, 200, { blockedKnoprixIds: [] });
  }
  return respond(route, 200, {});
});

async function clickVisibleText(text) {
  const matches = page.getByText(text, { exact: true });
  for (let index = 0; index < await matches.count(); index += 1) {
    if (await matches.nth(index).isVisible().catch(() => false)) {
      await matches.nth(index).click();
      return true;
    }

  }
  return false;
}

async function openSidebarDocument(fileName) {
  const sidebar = page.locator('aside').first();
  if (!await sidebar.isVisible()) await page.getByTitle('Toggle folders').click();
  const documentButton = page.getByRole('button', { name: `Open document ${fileName}` });
  await documentButton.waitFor({ state: 'visible' });
  await documentButton.click();
}

async function openSidebarSavedItems(fileName) {
  const sidebar = page.locator('aside').first();
  if (!await sidebar.isVisible()) await page.getByTitle('Toggle folders').click();
  const savedItemsButton = page.getByRole('button', {
    name: new RegExp(`Show saved items for ${fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`),
  });
  await savedItemsButton.waitFor({ state: 'visible' });
  await savedItemsButton.click();
}

async function applySelectedHighlight() {
  const response = page.waitForResponse((candidate) =>
    new URL(candidate.url()).pathname === '/api/highlights' &&
    candidate.request().method() === 'POST',
  );
  await page.getByTitle('Apply yellow to this selection').click();
  await response;
  return highlights.at(-1)?.id;
}

async function selectPdfSpan(startOffset = 0, length = 12, targetText = null) {
  return page.evaluate(({ startOffset: selectionStart, length: selectionLength, targetText: expectedText }) => {
    const span = [...document.querySelectorAll('.pdf-text-layer span')]
      .find((candidate) => expectedText
        ? candidate.textContent === expectedText
        : candidate.textContent.trim().length >= 8);
    if (!span) return false;
    const nodes = [];
    const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    const text = nodes.map((textNode) => textNode.textContent).join('');
    if (text.length < (expectedText ? 1 : 8)) return false;
    const pointAt = (offset) => {
      let consumed = 0;
      for (const textNode of nodes) {
        const next = consumed + textNode.textContent.length;
        if (offset <= next) return [textNode, offset - consumed];
        consumed = next;
      }
      return [nodes.at(-1), nodes.at(-1).textContent.length];
    };
    const range = document.createRange();
    const selectedStart = Math.min(selectionStart, text.length - 1);
    const selectedEnd = Math.min(selectedStart + selectionLength, text.length);
    const [startNode, startOffset] = pointAt(selectedStart);
    const [endNode, endOffset] = pointAt(selectedEnd);
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    (range.endContainer.parentElement || span)
      .dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return selection.toString();
  }, { startOffset, length, targetText });
}

async function dragSelectPdfText(text) {
  const geometry = await page.locator('.pdf-text-layer span').evaluateAll((spans, expectedText) => {
    const span = spans.find((candidate) => candidate.textContent === expectedText);
    if (!span) return null;
    const rect = span.getBoundingClientRect();
    return { x: rect.x, y: rect.y + rect.height / 2, width: rect.width, height: rect.height };
  }, text);
  if (!geometry || geometry.width <= 2 || geometry.height <= 2) return null;
  await page.mouse.move(geometry.x + 1, geometry.y);
  await page.mouse.down();
  await page.mouse.move(geometry.x + geometry.width - 1, geometry.y, { steps: 8 });
  await page.mouse.up();
  return page.evaluate(() => {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    return {
      text: selection.toString(),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  });
}

async function dragSelectRegion(pageNumber = 1, offset = 0, input = 'mouse') {
  const pageElement = page.locator(`[data-region-page="${pageNumber}"]`);
  await pageElement.scrollIntoViewIfNeeded();
  const geometry = await pageElement.evaluate((element, delta) => {
    const rect = element.getBoundingClientRect();
    for (
      let y = Math.max(0, rect.top + 8) - delta;
      y + delta + 100 <= Math.min(window.innerHeight, rect.bottom);
      y += 12
    ) {
      for (
        let x = Math.max(0, rect.left + 8) - delta;
        x + delta + 150 <= Math.min(window.innerWidth, rect.right);
        x += 12
      ) {
        const target = document.elementFromPoint(x + delta + 2, y + delta + 2);
        if (target?.closest('[data-region-page]') === element) {
          return { x: x + delta, y: y + delta, width: rect.width, height: rect.height };
        }
      }
    }
    return null;
  }, offset);
  if (!geometry) throw new Error(`No visible, unobstructed region-selection area on page ${pageNumber}`);
  if (input === 'touch') {
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 1,
    });
    try {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: geometry.x, y: geometry.y }],
      });
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: geometry.x + 138, y: geometry.y + 88 }],
      });
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    } finally {
      await session.send('Emulation.setTouchEmulationEnabled', { enabled: false });
      await session.detach();
    }
    await page.getByRole('button', { name: 'Copy selected region as PNG' }).waitFor();
    return;
  }
  await page.mouse.move(geometry.x, geometry.y);
  await page.mouse.down();
  await page.mouse.move(geometry.x + 138, geometry.y + 88, { steps: 6 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Copy selected region as PNG' }).waitFor();
}

async function selectText(phrase, occurrence) {
  return page.evaluate(({ phrase: selected, occurrence: selectedOccurrence }) => {
    const paragraphs = [...document.querySelectorAll('#main-content p')];
    const candidates = paragraphs.filter((paragraph) =>
      paragraph.textContent.includes(selected),
    );
    const paragraph = candidates[selectedOccurrence];
    if (!paragraph) return false;
    const textNodes = [];
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);
    const fullText = textNodes.map((textNode) => textNode.textContent).join('');
    const matchStart = fullText.indexOf(selected);
    if (matchStart === -1) return false;
    const pointAt = (offset) => {
      let consumed = 0;
      for (const textNode of textNodes) {
        const next = consumed + textNode.textContent.length;
        if (offset <= next) return [textNode, offset - consumed];
        consumed = next;
      }
      return [textNodes.at(-1), textNodes.at(-1).textContent.length];
    };
    const range = document.createRange();
    const [startNode, startOffset] = pointAt(matchStart);
    const [endNode, endOffset] = pointAt(matchStart + selected.length);
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    paragraph.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return selection.toString();
  }, { phrase, occurrence });
}

async function selectTextWithInputEvent(phrase, eventName) {
  return page.evaluate(({ selected, inputEvent }) => {
    const paragraph = [...document.querySelectorAll('#main-content p')]
      .find((candidate) => candidate.textContent.includes(selected));
    if (!paragraph) return false;
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const start = node.textContent.indexOf(selected);
      if (start === -1) continue;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + selected.length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      const container = document.querySelector('#main-content');
      if (inputEvent === 'selectionchange') {
        document.dispatchEvent(new Event('selectionchange'));
      } else {
        container.dispatchEvent(new Event(inputEvent, { bubbles: true }));
      }
      return selection.toString();
    }
    return false;
  }, { selected: phrase, inputEvent: eventName });
}

async function selectAcrossParagraphs() {
  return page.evaluate(() => {
    const [startParagraph, endParagraph] = [...document.querySelectorAll('#main-content p')];
    const firstWalker = document.createTreeWalker(startParagraph, NodeFilter.SHOW_TEXT);
    let startNode;
    while ((startNode = firstWalker.nextNode())) {
      const startOffset = startNode.textContent.lastIndexOf('anchor');
      if (startOffset === -1) continue;
      const endWalker = document.createTreeWalker(endParagraph, NodeFilter.SHOW_TEXT);
      let endNode;
      let currentEndNode;
      while ((currentEndNode = endWalker.nextNode())) endNode = currentEndNode;
      if (!endNode) return false;
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endNode.textContent.length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      (range.endContainer.parentElement || endParagraph)
        .dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return selection.toString();
    }
    return false;
  });
}

try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  check('source fixture document is available', await clickVisibleText('source.txt'));
  await page.getByText('First duplicate anchor', { exact: true }).waitFor({ timeout: 15000 });
  check('mock project and source document load', true);

  const selectionToggle = page.getByRole('button', { name: 'Switch to browse mode' });
  check(
    'Text Selection is visibly active before an annotation begins',
    await selectionToggle.getAttribute('aria-pressed') === 'true',
  );
  await selectionToggle.click();
  check(
    'Browse mode clearly reports that text annotation is unavailable',
    await page.getByRole('button', { name: 'Switch to text selection mode' }).getAttribute('aria-pressed') === 'false',
  );
  await selectText('duplicate anchor', 1);
  check(
    'Browse mode does not open an annotation action by mistake',
    !await page.getByTitle('Apply yellow to this selection').isVisible().catch(() => false),
  );
  await page.getByRole('button', { name: 'Switch to text selection mode' }).click();
  await page.evaluate(() => window.getSelection()?.removeAllRanges());

  check('second repeated passage can be selected', await selectText('duplicate anchor', 1));
  await page.getByTitle('Apply yellow to this selection').waitFor();
  check(
    'selection action palette stays outside the selected words',
    await page.evaluate(() => {
      const range = window.getSelection()?.getRangeAt(0);
      const palette = [...document.querySelectorAll('.fixed')]
        .find((element) => element.querySelector('[title="Apply yellow to this selection"]'));
      if (!range || !palette) return false;
      const selected = range.getBoundingClientRect();
      const action = palette.getBoundingClientRect();
      return action.bottom <= selected.top || action.top >= selected.bottom;
    }),
  );
  await page.screenshot({ path: `${evidenceDir}/live-selection-text.png` });
  await page.getByTitle('Apply yellow to this selection').click();
  await page.locator('mark[data-hlid="highlight-1"]').waitFor();
  check(
    'a newly saved marker gives a short visual confirmation before settling',
    await page.locator('mark[data-hlid="highlight-1"]').evaluate((mark) =>
      mark.classList.contains('kn-hl--new')),
  );
  check(
    'highlight stores exact offsets and marks only the selected duplicate',
    highlights[0]?.anchor_start !== null &&
      highlights[0]?.anchor_end > highlights[0]?.anchor_start &&
      await page.locator('mark[data-hlid="highlight-1"]').evaluate((mark) =>
        mark.closest('p')?.textContent === 'Second duplicate anchor'),
  );
  check(
    'saved highlight clears the live range but keeps its annotation visible',
    await page.evaluate(() => !window.getSelection()?.toString()) &&
      await page.locator('mark[data-hlid="highlight-1"]').count() === 1,
  );
  await page.reload({ waitUntil: 'networkidle' });
  check('source fixture reloads with saved highlight', await clickVisibleText('source.txt'));
  await page.locator('mark[data-hlid="highlight-1"]').waitFor();
  check(
    'persisted highlight remains on the second duplicate after reload',
    await page.locator('mark[data-hlid="highlight-1"]').evaluate((mark) =>
      mark.closest('p')?.textContent === 'Second duplicate anchor'),
  );
  await page.locator('mark[data-hlid="highlight-1"]').click();
  await page.getByTitle('Change highlight color').click();
  await page.getByTitle('Change highlight color to Green').click();
  await page.waitForFunction(() =>
    document.querySelector('mark[data-hlid="highlight-1"]')?.style.background.includes('134, 239, 172'),
  );
  check(
    'changing a saved highlight color updates its marker and persisted record',
    highlights[0]?.color === 'green' &&
      await page.locator('mark[data-hlid="highlight-1"]').evaluate((mark) =>
        mark.style.background.includes('134, 239, 172')),
  );
  await page.reload({ waitUntil: 'networkidle' });
  check('source document reopens after a saved color change', await clickVisibleText('source.txt'));
  await page.locator('mark[data-hlid="highlight-1"]').waitFor();
  check(
    'updated highlight color survives document reload',
    await page.locator('mark[data-hlid="highlight-1"]').evaluate((mark) =>
      mark.style.background.includes('134, 239, 172')),
  );
  const paragraphSelectionText = await selectAcrossParagraphs();
  const paragraphToolbarVisible = await page.getByTitle('Apply yellow to this selection')
    .isVisible().catch(() => false);
  check(
    'selection spanning paragraph boundaries opens the annotation toolbar',
    Boolean(paragraphSelectionText) && paragraphToolbarVisible,
  );
  await page.getByTitle('Apply yellow to this selection').waitFor();
  await page.waitForTimeout(180);
  const paragraphHighlightId = await applySelectedHighlight();
  await page.locator(`mark[data-hlid="${paragraphHighlightId}"]`).first().waitFor();
  const paragraphMarkers = await page.locator(`mark[data-hlid="${paragraphHighlightId}"]`)
    .evaluateAll((marks) => marks.map((mark) => ({
      paragraph: mark.closest('p')?.textContent,
      text: mark.textContent,
    })));
  check(
    'paragraph-spanning highlight preserves both exact paragraph segments',
    paragraphMarkers.some((mark) => mark.paragraph === 'First duplicate anchor' &&
      mark.text === 'anchor') &&
      paragraphMarkers.some((mark) => mark.paragraph === 'Second duplicate anchor' &&
        mark.text === 'Second duplicate anchor') &&
      highlights.at(-1)?.text === paragraphSelectionText.replace(/\s+/g, ' ').trim(),
    JSON.stringify({ paragraphSelectionText, savedText: highlights.at(-1)?.text, paragraphMarkers }),
  );
  const canonicalParagraphText =
    'First duplicate anchor\nSecond duplicate anchor\nAlpha beta gamma delta';
  check(
    'paragraph-spanning offsets match the stored document text model',
    highlights.at(-1)?.anchor_start === canonicalParagraphText.indexOf('anchor') &&
      highlights.at(-1)?.anchor_end ===
        canonicalParagraphText.indexOf('Second duplicate anchor') +
          'Second duplicate anchor'.length,
    JSON.stringify({
      start: highlights.at(-1)?.anchor_start,
      end: highlights.at(-1)?.anchor_end,
    }),
  );
  const keyboardSelectionText = await selectTextWithInputEvent('First', 'selectionchange');
  const keyboardToolbarVisible = await page.getByTitle('Apply yellow to this selection')
    .isVisible().catch(() => false);
  check(
    'keyboard selection changes open the annotation toolbar without a mouse event',
    keyboardSelectionText === 'First' && keyboardToolbarVisible,
  );
  if (!keyboardToolbarVisible) await selectText('First', 0);
  await page.getByTitle('Apply yellow to this selection').waitFor();
  await page.waitForTimeout(180);
  const keyboardHighlightId = await applySelectedHighlight();
  await page.locator(`mark[data-hlid="${keyboardHighlightId}"]`).waitFor();
  check(
    'keyboard-selected word is saved at its exact text anchor',
    keyboardToolbarVisible &&
      highlights.at(-1)?.text === 'First' &&
      highlights.at(-1)?.anchor_start !== null &&
      highlights.at(-1)?.anchor_end === highlights.at(-1)?.anchor_start + 'First'.length,
  );
  const keyboardHighlightAnchor = highlights.at(-1)?.anchor_start;
  const highlightsBeforeDuplicate = highlights.length;
  await selectText('First', 0);
  await page.getByTitle('Apply yellow to this selection').waitFor();
  await page.waitForTimeout(180);
  await page.getByTitle('Apply yellow to this selection').click();
  check(
    'repeating the same highlight action does not create a duplicate record',
    highlights.length === highlightsBeforeDuplicate,
  );
  await page.getByTitle('Apply yellow to this selection').waitFor({ state: 'hidden' });
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  const touchSelectionText = await selectTextWithInputEvent('duplicate', 'touchend');
  const touchToolbarVisible = await page.getByTitle('Apply yellow to this selection')
    .isVisible().catch(() => false);
  check(
    'touch selection end opens the annotation toolbar',
    touchSelectionText === 'duplicate' && touchToolbarVisible,
  );
  if (!touchToolbarVisible) await selectText('duplicate anchor', 0);
  await page.getByTitle('Apply yellow to this selection').waitFor();
  await page.waitForTimeout(180);
  const touchHighlightId = await applySelectedHighlight();
  await page.locator(`mark[data-hlid="${touchHighlightId}"]`).waitFor();
  await selectText('beta gamma', 0);
  const firstOverlapHighlightId = await applySelectedHighlight();
  await page.locator(`mark[data-hlid="${firstOverlapHighlightId}"]`).waitFor();
  await selectText('gamma delta', 0);
  const secondOverlapHighlightId = await applySelectedHighlight();
  await page.locator(`mark[data-hlid="${secondOverlapHighlightId}"]`).waitFor();
  check(
    'overlapping text highlights preserve both independent ranges',
    await page.evaluate(() => {
      const paragraph = [...document.querySelectorAll('#main-content p')]
        .find((candidate) => candidate.textContent === 'Alpha beta gamma delta');
      return [...paragraph.querySelectorAll('mark')].map((mark) => [
        mark.dataset.hlid,
        mark.textContent,
      ]);
    }).then((marks) =>
      marks.some(([id, text]) => id === firstOverlapHighlightId && text === 'beta ') &&
      marks.some(([id, text]) => id === secondOverlapHighlightId && text === 'gamma delta')),
  );
  await page.locator(`mark[data-hlid="${keyboardHighlightId}"]`).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.locator(`mark[data-hlid="${keyboardHighlightId}"]`).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Undo' }).click();
  const restoredKeyboardHighlightId = highlights.at(-1)?.id;
  await page.locator(`mark[data-hlid="${restoredKeyboardHighlightId}"]`).waitFor();
  check(
    'undo restores the removed text highlight and its original anchor',
    restoredKeyboardHighlightId !== keyboardHighlightId &&
      highlights.at(-1)?.anchor_start === keyboardHighlightAnchor &&
      await page.locator(`mark[data-hlid="${restoredKeyboardHighlightId}"]`).evaluate((mark) =>
        mark.textContent === 'First'),
  );
  check('second repeated passage can be selected after reload', await selectText('duplicate anchor', 1));
  await page.getByRole('button', { name: 'Bookmark selected passage' }).click();
  const nameDialog = page.getByRole('dialog', { name: 'Save bookmark' });
  await nameDialog.getByLabel(/Bookmark name/).fill('Second occurrence');
  await nameDialog.getByRole('button', { name: 'Save bookmark' }).click();
  await page.getByText('Named bookmark added to your collection').waitFor();
  const savedPassage = bookmarks.find((bookmark) => bookmark.name === 'Second occurrence');
  check(
    'selected bookmark stores its title and exact character offsets',
    savedPassage?.anchor_start !== null &&
      savedPassage?.anchor_end > savedPassage?.anchor_start,
  );
  await page.getByTitle('Toggle folders').click();
  const otherDocumentOpened = await clickVisibleText('other.txt');
  await page.getByTitle('Toggle folders').click();
  check('other document opens before bookmark jump', otherDocumentOpened);
  await page.getByText('A different document', { exact: true }).waitFor();
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.getByTitle('Bookmark collection').click();
  const search = page.getByRole('textbox', { name: 'Search bookmarks' });
  check(
    'bookmark open and delete actions are separate accessible buttons',
    await page.getByRole('button', { name: 'Open bookmark: Second occurrence' }).isVisible() &&
      await page.locator('button button').count() === 0,
  );
  await search.fill('SECOND OCCURRENCE');
  await page.getByText('Second occurrence', { exact: true }).waitFor();
  check('live search matches a bookmark name case-insensitively', true);
  check('named result displays saved passage preview', await page.getByText('“duplicate anchor”').isVisible());
  await search.fill('duplicate anchor');
  await page.getByText('Second occurrence', { exact: true }).waitFor();
  check('live search also matches selected passage content', true);
  await search.fill('no matching phrase');
  await page.getByText(/No bookmarks match/).waitFor();
  check('search has a distinct no-match state', true);
  await search.fill('Second occurrence');
  await page.getByText('Second occurrence', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open bookmark: Second occurrence' }).click();
  await page.getByText('First duplicate anchor', { exact: true }).waitFor();
  await page.waitForFunction(
    () => window.getSelection()?.toString() === 'duplicate anchor',
    null,
    { timeout: 5000 },
  );
  check('bookmark reopens the source document and selects its saved passage', await page.evaluate(() => {
    const selected = window.getSelection();
    return selected?.toString() === 'duplicate anchor' &&
      selected.getRangeAt(0).startContainer.parentElement.closest('p')?.textContent === 'Second duplicate anchor';
  }));
  await page.getByRole('textbox', { name: 'Search bookmarks' }).waitFor({ state: 'detached' });
  check('opening a bookmark closes the drawer', true);

  await openSidebarDocument('other.txt');
  check('second document can reopen before the legacy bookmark', true);
  await page.getByText('A different document', { exact: true }).waitFor();
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.getByTitle('Bookmark collection').click();
  await page.getByRole('textbox', { name: 'Search bookmarks' }).fill('Legacy title');
  await page.getByText('Legacy title', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open bookmark: Legacy title' }).click();
  await page.getByText('First duplicate anchor', { exact: true }).waitFor();
  await page.waitForFunction(
    () => window.getSelection()?.toString() === 'duplicate anchor',
    null,
    { timeout: 5000 },
  );
  await page.getByRole('textbox', { name: 'Search bookmarks' }).waitFor({ state: 'detached' });
  check(
    'older bookmarks without offsets fall back to the saved quote',
    await page.evaluate(() =>
      window.getSelection()?.getRangeAt(0).startContainer.parentElement.closest('p')?.textContent ===
        'First duplicate anchor',
    ),
  );

  await page.getByRole('button', { name: 'Bookmark page 1' }).click();
  const pageDialog = page.getByRole('dialog', { name: 'Save bookmark' });
  await pageDialog.waitFor({ timeout: 5000 });
  await pageDialog.getByLabel(/Bookmark name/).fill('First page');
  await pageDialog.getByRole('button', { name: 'Save bookmark' }).click();
  await page.getByText('Named bookmark added to your collection').waitFor();
  check(
    'whole-page bookmark uses the same optional-name flow',
    bookmarks.some((bookmark) => bookmark.bookmark_type === 'page' && bookmark.name === 'First page'),
  );

  await page.getByRole('button', { name: 'Remove bookmark from page 1' }).waitFor();
  await openSidebarDocument('other.txt');
  check('other document opens after saving a page bookmark', true);
  await page.getByText('A different document', { exact: true }).waitFor();
  await page.getByTitle('Bookmark collection').click();
  await page.getByRole('textbox', { name: 'Search bookmarks' }).fill('Second occurrence');
  await page.getByText('Second occurrence', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open bookmark: Second occurrence' }).click();
  await page.getByText('First duplicate anchor', { exact: true }).waitFor();
  await page.waitForFunction(
    () => window.getSelection()?.toString() === 'duplicate anchor',
    null,
    { timeout: 5000 },
  );
  check(
    'text anchor remains exact after page-bookmark button changes',
    await page.evaluate(() =>
      window.getSelection()?.getRangeAt(0).startContainer.parentElement.closest('p')?.textContent ===
        'Second duplicate anchor',
    ),
  );

  for (const width of [390, 425, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByTitle('Bookmark collection').click();
    await page.getByRole('textbox', { name: 'Search bookmarks' }).waitFor();
    await page.waitForFunction(() => {
      const drawer = document.querySelector('.fixed.right-0');
      return drawer && Math.abs(drawer.getBoundingClientRect().right - window.innerWidth) < 0.05;
    });
    const drawerFits = await page.evaluate(() => {
      const drawer = document.querySelector('.fixed.right-0');
      const rect = drawer.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= window.innerWidth + 1 &&
        document.documentElement.scrollWidth <= window.innerWidth + 1;
    });
    check(`[${width}px] drawer fits viewport without horizontal overflow`, drawerFits);
    await page.screenshot({ path: `${evidenceDir}/drawer-${width}.png` });
    await page.getByRole('button', { name: 'Close bookmark collection' }).click();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  check('[390px] text selection still opens bookmark naming', await selectText('duplicate anchor', 1));
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Bookmark selected passage' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save bookmark' });
  await dialog.waitFor();
  for (const width of [390, 425, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    const dialogFits = await page.evaluate(() => {
      const rect = document.querySelector('[role="dialog"]').getBoundingClientRect();
      return rect.left >= 0 && rect.right <= window.innerWidth && rect.width <= window.innerWidth;
    });
    check(`[${width}px] optional-name dialog fits viewport`, dialogFits);
    await page.screenshot({ path: `${evidenceDir}/name-dialog-${width}.png` });
  }
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  let pdfFixtureOpened = await clickVisibleText('selection-visual.pdf');
  if (!pdfFixtureOpened) {
    const folderToggle = page.getByTitle('Toggle folders');
    if (await folderToggle.isVisible().catch(() => false)) {
      await folderToggle.click();
      pdfFixtureOpened = await clickVisibleText('selection-visual.pdf');
    }
  }
  check('PDF fixture opens for live selection feedback', pdfFixtureOpened);
  await page.getByText('Rendering PDF canvas…').waitFor({ state: 'hidden', timeout: 20000 });
  await page.locator('.pdf-text-layer span').first().waitFor({ state: 'attached', timeout: 20000 });
  const pdfLayerGeometry = await page.locator('.pdf-text-layer').first().evaluate((layer) => {
    const canvas = layer.parentElement.querySelector('canvas');
    const layerRect = layer.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    return {
      devicePixelRatio: window.devicePixelRatio,
      canvas: { x: canvasRect.x, y: canvasRect.y, width: canvasRect.width, height: canvasRect.height },
      textLayer: { x: layerRect.x, y: layerRect.y, width: layerRect.width, height: layerRect.height },
      expectedFontSize: layer.querySelector('span') && (
        parseFloat(getComputedStyle(layer.querySelector('span')).getPropertyValue('--font-height')) *
        parseFloat(getComputedStyle(layer).getPropertyValue('--scale-factor')) *
        parseFloat(getComputedStyle(layer).getPropertyValue('--min-font-size'))
      ),
      spanStyle: layer.querySelector('span') && {
        fontSize: getComputedStyle(layer.querySelector('span')).fontSize,
      },
      scaleFactor: getComputedStyle(layer).getPropertyValue('--scale-factor').trim(),
      totalScaleFactor: getComputedStyle(layer).getPropertyValue('--total-scale-factor').trim(),
    };
  });
  check(
    'PDF text selection layer matches the visible page geometry at 2x device scale',
    Math.abs(pdfLayerGeometry.textLayer.x - pdfLayerGeometry.canvas.x) < 1 &&
      Math.abs(pdfLayerGeometry.textLayer.y - pdfLayerGeometry.canvas.y) < 1 &&
      Math.abs(pdfLayerGeometry.textLayer.width - pdfLayerGeometry.canvas.width) < 1 &&
      Math.abs(pdfLayerGeometry.textLayer.height - pdfLayerGeometry.canvas.height) < 1 &&
      Math.abs(parseFloat(pdfLayerGeometry.spanStyle.fontSize) -
        pdfLayerGeometry.expectedFontSize) < 0.1,
    JSON.stringify(pdfLayerGeometry),
  );
  const pointerSelection = await dragSelectPdfText('Lecture');
  check(
    'a real pointer drag over the printed PDF word selects that exact word',
    pointerSelection?.text === 'Lecture',
    JSON.stringify(pointerSelection),
  );
  await page.getByTitle('Apply yellow to this selection').waitFor();
  await page.screenshot({ path: `${evidenceDir}/live-selection-pdf.png` });
  const selectionCss = readFileSync(
    fileURLToPath(new URL('./src/index.css', import.meta.url)),
    'utf8',
  );
  check(
    'PDF live selection is a distinct blue state, not the saved gold marker',
    pointerSelection?.text === 'Lecture' &&
      selectionCss.includes('background: rgba(37, 99, 235, 0.8)'),
  );
  const pdfTextBeforeHighlights = await page.locator('.pdf-text-layer').first().innerText();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const firstPdfHighlightId = await applySelectedHighlight();
  await page.locator(`mark[data-hlid="${firstPdfHighlightId}"]`).waitFor();
  const pointerHighlightRect = await page.locator(`mark[data-hlid="${firstPdfHighlightId}"]`)
    .evaluate((mark) => {
      const rect = mark.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, text: mark.textContent };
    });
  check(
    'saved PDF marker matches the exact pointer-selected text bounds',
    pointerHighlightRect.text === 'Lecture' &&
      Math.abs(pointerHighlightRect.x - pointerSelection.rect.x) < 2 &&
      Math.abs(pointerHighlightRect.y - pointerSelection.rect.y) < 2 &&
      Math.abs(pointerHighlightRect.width - pointerSelection.rect.width) < 2 &&
      Math.abs(pointerHighlightRect.height - pointerSelection.rect.height) < 2,
    JSON.stringify({ pointerSelection: pointerSelection.rect, pointerHighlight: pointerHighlightRect }),
  );
  const reducedMotionResult = await page.locator(`mark[data-hlid="${firstPdfHighlightId}"]`)
    .evaluate((mark) => ({
      className: mark.className,
      animationName: getComputedStyle(mark).animationName,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    }));
  check(
    'reduced motion keeps saved PDF highlights visible without animation',
    reducedMotionResult.reducedMotion &&
      (!reducedMotionResult.className.includes('kn-hl--new') ||
        reducedMotionResult.animationName === 'none'),
    JSON.stringify(reducedMotionResult),
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const overlappingPdfText = await selectPdfSpan(5, 2, 'Lecture');
  check(
    'PDF selection ending inside an existing marker remains actionable',
    overlappingPdfText === 're' &&
      await page.getByTitle('Apply yellow to this selection').isVisible(),
  );
  await page.getByTitle('Apply yellow to this selection').click();
  const secondPdfHighlightId = highlights.at(-1)?.id;
  await page.locator(`mark[data-hlid="${secondPdfHighlightId}"]`).waitFor();
  check(
    'overlapping PDF annotations render without shifting offsets or losing text',
    await page.evaluate(({ firstId, secondId, originalText }) => {
      const layer = document.querySelector('.pdf-text-layer');
      const ids = new Set([...layer.querySelectorAll('mark.kn-hl')].map((mark) => mark.dataset.hlid));
      return ids.has(firstId) && ids.has(secondId) && layer.innerText === originalText;
    }, {
      firstId: firstPdfHighlightId,
      secondId: secondPdfHighlightId,
      originalText: pdfTextBeforeHighlights,
    }),
  );
  await page.getByTitle('Zoom in').click();
  await page.getByText('110%', { exact: true }).waitFor();
  await page.waitForTimeout(500);
  await page.locator(`mark[data-hlid="${secondPdfHighlightId}"]`).waitFor();
  check(
    'PDF zoom rerender preserves both anchored highlights and the text layer',
    await page.evaluate(({ firstId, secondId, originalText }) => {
      const layer = document.querySelector('.pdf-text-layer');
      const canvas = layer.parentElement.querySelector('canvas');
      const layerRect = layer.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const span = layer.querySelector('span');
      const expectedFontSize =
        parseFloat(getComputedStyle(span).getPropertyValue('--font-height')) *
        parseFloat(getComputedStyle(layer).getPropertyValue('--scale-factor')) *
        parseFloat(getComputedStyle(layer).getPropertyValue('--min-font-size'));
      const ids = new Set([...layer.querySelectorAll('mark.kn-hl')].map((mark) => mark.dataset.hlid));
      return ids.has(firstId) && ids.has(secondId) && layer.innerText === originalText &&
        Math.abs(layerRect.width - canvasRect.width) < 1 &&
        Math.abs(layerRect.height - canvasRect.height) < 1 &&
        Math.abs(parseFloat(getComputedStyle(span).fontSize) - expectedFontSize) < 0.1;
    }, {
      firstId: firstPdfHighlightId,
      secondId: secondPdfHighlightId,
      originalText: pdfTextBeforeHighlights,
    }),
  );
  await page.getByTitle('Zoom out').click();
  await page.getByText('100%', { exact: true }).waitFor();
  await page.waitForTimeout(500);
  await page.getByTitle('View mode').click();
  await page.getByRole('menuitem', { name: 'Single Page' }).click();
  const pageInput = page.getByTitle('Type a page number and press Enter to jump');
  await pageInput.fill('2');
  await pageInput.press('Enter');
  await page.locator('[data-page="2"]').waitFor();
  await pageInput.fill('1');
  await pageInput.press('Enter');
  await page.locator(`mark[data-hlid="${firstPdfHighlightId}"]`).waitFor();
  check(
    'PDF page navigation away and back restores the saved markers',
    await page.locator(`mark[data-hlid="${firstPdfHighlightId}"]`).count() > 0 &&
      await page.locator(`mark[data-hlid="${secondPdfHighlightId}"]`).count() > 0,
  );
  await page.reload({ waitUntil: 'networkidle' });
  let reopenedPdf = await clickVisibleText('selection-visual.pdf');
  if (!reopenedPdf) {
    const folderToggle = page.getByTitle('Toggle folders');
    if (await folderToggle.isVisible().catch(() => false)) {
      await folderToggle.click();
      reopenedPdf = await clickVisibleText('selection-visual.pdf');
    }
  }
  await page.locator('.pdf-text-layer span').first().waitFor({ timeout: 20000 });
  await page.locator(`mark[data-hlid="${firstPdfHighlightId}"]`).waitFor();
  await page.locator(`mark[data-hlid="${secondPdfHighlightId}"]`).waitFor();
  check('PDF highlights restore after reopening the document', reopenedPdf);
  await page.screenshot({ path: `${evidenceDir}/overlapping-pdf-highlights.png` });

  await page.getByRole('button', { name: 'Enter region selection mode' }).click();
  check(
    'Region Selection mode is keyboard-accessible and mutually exclusive',
    await page.getByRole('button', { name: 'Exit region selection mode' }).getAttribute('aria-pressed') === 'true' &&
      await page.getByRole('button', { name: 'Switch to browse mode' }).isVisible(),
  );
  for (const width of [390, 425, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('[data-region-page="1"]').scrollIntoViewIfNeeded();
    await dragSelectRegion(1, 0);
    const actionFits = await page.locator('[data-region-actions]').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= window.innerWidth + 1 &&
        document.documentElement.scrollWidth <= window.innerWidth + 1;
    });
    check(`[${width}px] region actions fit the viewport without horizontal overflow`, actionFits);
    await page.screenshot({ path: `${evidenceDir}/region-actions-${width}.png` });
    await page.getByRole('button', { name: 'Cancel region selection' }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-region-page="1"]').scrollIntoViewIfNeeded();
  await dragSelectRegion(1, 0, 'touch');
  check(
    'touch drag selects a page region on mobile',
    await page.locator('[data-region-actions]').isVisible(),
  );
  await page.getByRole('button', { name: 'Cancel region selection' }).click();
  await dragSelectRegion(1, 0);
  await page.screenshot({ path: `${evidenceDir}/region-selection.png` });
  await page.getByRole('button', { name: 'Copy selected region as PNG' }).click();
  await page.getByText('Selected region copied as PNG').waitFor();
  check(
    'Copy generates a non-empty PNG and sends it to the clipboard',
    await page.evaluate(() => window.__copiedClipboardItems?.some((item) =>
      item.types.includes('image/png') && item.pngSize > 0)),
  );

  await page.evaluate(() => { window.__failClipboardWrite = true; });
  await dragSelectRegion(1, 4);
  await page.getByRole('button', { name: 'Copy selected region as PNG' }).click();
  await page.getByText('Clipboard permission denied').waitFor();
  check(
    'clipboard permission errors are surfaced without discarding the selection',
    await page.locator('[data-region-actions]').isVisible(),
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {},
    });
  });
  await page.getByRole('button', { name: 'Copy selected region as PNG' }).click();
  await page.getByText('PNG clipboard copy is not supported by this browser').waitFor();
  check(
    'unsupported PNG clipboard APIs show an explicit error',
    await page.locator('[data-region-actions]').isVisible(),
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        async write(items) {
          if (window.__failClipboardWrite) throw new Error('Clipboard permission denied');
          window.__copiedClipboardItems = await Promise.all(items.map(async (item) => ({
            types: item.types,
            pngSize: (await item.getType('image/png')).size,
          })));
        },
      },
    });
  });
  await page.evaluate(() => { window.__failClipboardWrite = false; });
  await page.getByRole('button', { name: 'Cancel region selection' }).click();

  await dragSelectRegion(1, 8);
  await page.getByRole('button', { name: 'Bookmark selected region' }).click();
  const regionDialog = page.getByRole('dialog', { name: 'Save bookmark' });
  await regionDialog.waitFor();
  check(
    'region bookmarks reuse the optional-name dialog and identify the selection',
    await regionDialog.getByText(/selected region/).isVisible(),
  );
  await regionDialog.getByLabel(/Bookmark name/).fill('Flowchart region');
  await regionDialog.getByRole('button', { name: 'Save bookmark' }).click();
  await page.getByText('Named bookmark added to your collection').waitFor();
  const regionBookmark = bookmarks.find((bookmark) => bookmark.name === 'Flowchart region');
  check(
    'region bookmark stores a positive normalized page rectangle',
    regionBookmark?.bookmark_type === 'region' &&
      regionBookmark.region_x >= 0 && regionBookmark.region_y >= 0 &&
      regionBookmark.region_width > 0 && regionBookmark.region_height > 0 &&
      regionBookmark.region_x + regionBookmark.region_width <= 1 &&
      regionBookmark.region_y + regionBookmark.region_height <= 1,
  );
  await page.getByTitle('Bookmark collection').click();
  await page.getByRole('textbox', { name: 'Search bookmarks' }).fill('Flowchart region');
  await page.getByRole('button', { name: /Open bookmark: Flowchart region/ }).click();
  await page.locator('[data-region-bookmark="true"]').waitFor();
  check(
    'opening a saved region bookmark restores its page outline',
    await page.locator('[data-region-bookmark="true"]').evaluate((outline) => {
      const pageRect = outline.parentElement.getBoundingClientRect();
      const rect = outline.getBoundingClientRect();
      return Math.abs(rect.left - (pageRect.left + pageRect.width * Number.parseFloat(outline.style.left) / 100)) < 2;
    }),
  );

  await page.getByRole('button', { name: 'Exit region selection mode' }).click();
  await page.getByRole('button', { name: 'Enter region selection mode' }).click();
  await dragSelectRegion(1);
  await page.getByRole('button', { name: 'Highlight selected region' }).click();
  await page.getByRole('button', { name: 'Save region highlight in Blue' }).click();
  await page.getByRole('button', { name: 'Region highlight, Blue, page 1' }).waitFor();
  const regionHighlight = highlights.find((highlight) => highlight.highlight_type === 'region');
  check(
    'region highlight stores page geometry and selected palette color',
    regionHighlight?.color === 'blue' && regionHighlight.region_x >= 0 &&
      regionHighlight.region_width > 0 && regionHighlight.region_y >= 0 &&
      regionHighlight.region_height > 0,
  );
  await page.reload({ waitUntil: 'networkidle' });
  await openSidebarDocument('selection-visual.pdf');
  await page.getByRole('button', { name: 'Region highlight, Blue, page 1' }).waitFor();
  check('region highlight is restored after reopening the PDF', true);
  await page.getByRole('button', { name: 'Region highlight, Blue, page 1' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Region highlight, Blue, page 1' }).waitFor({ state: 'detached' });
  check(
    'saved region highlight can be removed through annotation management',
    !highlights.some((highlight) => highlight.highlight_type === 'region'),
  );

  await openSidebarDocument('presentation.pptx');
  await page.locator('.pdf-text-layer span').first().waitFor({ timeout: 20000 });
  check(
    'PPTX opens through the PDF.js preview endpoint instead of the shape-reconstruction viewer',
    presentationPreviewRequests > 0 && await page.locator('[data-region-page="1"]').count() === 1,
  );
  await page.getByRole('button', { name: 'Enter region selection mode' }).click();
  await dragSelectRegion(1, 8);
  check('PPTX preview supports the same region-selection popup', await page.locator('[data-region-actions]').isVisible());
  await page.getByRole('button', { name: 'Cancel region selection' }).click();
  const presentationPage = page.locator('[data-region-page="1"]');
  await presentationPage.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  for (let step = 0; step < 8; step += 1) await page.keyboard.press('ArrowRight');
  for (let step = 0; step < 8; step += 1) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  check('keyboard arrows and Enter can select a page region', await page.locator('[data-region-actions]').isVisible());
  await page.getByRole('button', { name: 'Cancel region selection' }).click();
  await page.getByRole('button', { name: 'Exit region selection mode' }).click();

  const sourceBookmarkCount = bookmarks.filter((bookmark) => bookmark.document_id === 'document-1').length;
  const sourceHighlightCount = highlights.filter((highlight) => highlight.document_id === 'document-1').length;
  const sidebar = page.locator('aside').first();
  if (!await sidebar.isVisible()) await page.getByTitle('Toggle folders').click();
  const savedItemsButton = page.getByRole('button', {
    name: `Show saved items for source.txt: ${sourceBookmarkCount} bookmarks and ${sourceHighlightCount} highlights`,
  });
  check('sidebar shows per-document bookmark and highlight counts', await savedItemsButton.isVisible());
  if (await savedItemsButton.isVisible()) {
    await savedItemsButton.click();
    const savedHighlight = highlights.find((highlight) => highlight.document_id === 'document-1');
    if (savedHighlight) {
      await page.getByRole('button', {
        name: `Open highlight: ${savedHighlight.text} in source.txt, page ${savedHighlight.page_number}`,
      }).click();
      await page.getByText('First duplicate anchor', { exact: true }).waitFor();
      await page.waitForFunction(
        (text) => window.getSelection()?.toString() === text,
        savedHighlight.text,
        { timeout: 5000 },
      );
      check('sidebar highlight opens its exact saved passage', true);
    } else {
      check('sidebar highlight opens its exact saved passage', false, 'No source highlight fixture');
    }
    await openSidebarSavedItems('source.txt');
    const savedBookmark = bookmarks.find((bookmark) =>
      bookmark.document_id === 'document-1' && bookmark.name === 'Second occurrence',
    );
    if (savedBookmark) {
      await page.getByRole('button', {
        name: `Open bookmark: ${savedBookmark.name} in source.txt, page ${savedBookmark.page_number}`,
      }).click();
      await page.getByText('First duplicate anchor', { exact: true }).waitFor();
      await page.waitForFunction(
        () => window.getSelection()?.toString() === 'duplicate anchor',
        null,
        { timeout: 5000 },
      );
      check('sidebar bookmark opens its exact saved passage', true);
    } else {
      check('sidebar bookmark opens its exact saved passage', false, 'No named bookmark fixture');
    }
  } else {
    check('sidebar highlight opens its exact saved passage', false, 'Saved-item list is unavailable');
    check('sidebar bookmark opens its exact saved passage', false, 'Saved-item list is unavailable');
  }

  await page.getByRole('button', { name: 'Contacts and sharing' }).click();
  await page.getByRole('button', { name: 'Retry loading' }).waitFor({ timeout: 5000 });
  check(
    'Contacts & Sharing keeps loaded sections visible and identifies a partial failure',
    await page.getByText('KP-AAAAAAAAAA', { exact: true }).isVisible() &&
      await page.getByText(/contacts/i).count() > 0,
  );
  failContactsRequests = false;
  await page.getByRole('button', { name: 'Retry loading' }).click();
  await page.getByText('Study Partner', { exact: true }).waitFor();
  check('Contacts & Sharing retry reloads the failed contacts section', true);
  await page.getByRole('button', { name: 'View read-only' }).click();
  await page.getByText(
    'The source document was not separately shared with you, so only this annotation is available.',
  ).waitFor();
  check('annotation-only shares do not open their private source document', true);
  sourceDocumentShareAccepted = true;
  await page.getByRole('button', { name: 'View read-only' }).click();
  await page.getByText('First duplicate anchor', { exact: true }).waitFor();
  await page.waitForFunction(
    () => window.getSelection()?.toString() === 'duplicate anchor',
    null,
    { timeout: 5000 },
  );
  check('annotation share jumps to its exact anchor when source access is accepted', true);

  check('no browser runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '));
} catch (error) {
  flowError = error.stack || String(error);
  console.error('Browser runtime errors:', errors.join(' | ') || 'none');
  console.error(error.stack);
  check('bookmark browser flow completes', false, String(error).split('\n')[0]);
  await page.screenshot({ path: `${evidenceDir}/failure.png` }).catch(() => {});
} finally {
  writeFileSync(
    `${evidenceDir}/result.txt`,
    [...results.map(([name, passed]) => `${passed ? 'PASS' : 'FAIL'} ${name}`), flowError].filter(Boolean).join('\n'),
  );
  await browser.close();
}

const failed = results.filter(([, passed]) => !passed);
console.log(`\n${results.length - failed.length}/${results.length} bookmark browser checks passed`);
process.exit(failed.length ? 1 : 0);
