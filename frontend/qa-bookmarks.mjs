/* Bookmark regression QA against a mocked API; writes local responsive evidence. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const evidenceDir = fileURLToPath(new URL('../qa-artifacts/knoprix-bookmarks/', import.meta.url));
mkdirSync(evidenceDir, { recursive: true });

const results = [];
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
    extracted_text: 'First duplicate anchor\nSecond duplicate anchor',
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

const respond = (route, status, data) => route.fulfill({
  status,
  contentType: 'application/json',
  body: data === null ? '' : JSON.stringify(data),
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await page.addInitScript(() => {
  localStorage.setItem('knoprix_mr_access_token', 'bookmark-qa-token');
});
await page.route('**/api/**', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;

  if (path === '/api/auth/me') {
    return respond(route, 200, { id: 'user-1', email: 'qa@example.test', full_name: 'QA User' });
  }
  if (path === '/api/projects' && request.method() === 'GET') {
    return respond(route, 200, {
      projects: [{ id: 'project-1', name: 'Bookmark QA', file_count: documents.length }],
    });
  }
  if (path === '/api/projects/project-1/documents') {
    return respond(route, 200, { documents });
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
  if (/^\/api\/documents\/[^/]+\/highlights$/.test(path)) {
    return respond(route, 200, { highlights: [] });
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

async function selectText(phrase, occurrence) {
  return page.evaluate(({ phrase: selected, occurrence: selectedOccurrence }) => {
    const paragraphs = [...document.querySelectorAll('#main-content p')];
    const candidates = paragraphs.filter((paragraph) =>
      paragraph.textContent.includes(selected),
    );
    const paragraph = candidates[selectedOccurrence];
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
      paragraph.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return true;
    }
    return false;
  }, { phrase, occurrence });
}

try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  check('source fixture document is available', await clickVisibleText('source.txt'));
  await page.getByText('First duplicate anchor', { exact: true }).waitFor({ timeout: 15000 });
  check('mock project and source document load', true);

  check('second repeated passage can be selected', await selectText('duplicate anchor', 1));
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
  await page.getByRole('button', { name: /Second occurrence/ }).click();
  await page.getByText('First duplicate anchor', { exact: true }).waitFor();
  await page.waitForFunction(() => window.getSelection()?.toString() === 'duplicate anchor');
  check('bookmark reopens the source document and selects its saved passage', await page.evaluate(() => {
    const selected = window.getSelection();
    return selected?.toString() === 'duplicate anchor' &&
      selected.getRangeAt(0).startContainer.parentElement.closest('p')?.textContent === 'Second duplicate anchor';
  }));
  await page.getByRole('textbox', { name: 'Search bookmarks' }).waitFor({ state: 'detached' });
  check('opening a bookmark closes the drawer', true);

  await page.getByTitle('Toggle folders').click();
  const reopenedOtherDocument = await clickVisibleText('other.txt');
  await page.getByTitle('Toggle folders').click();
  check('second document can reopen before the legacy bookmark', reopenedOtherDocument);
  await page.getByText('A different document', { exact: true }).waitFor();
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.getByTitle('Bookmark collection').click();
  await page.getByRole('textbox', { name: 'Search bookmarks' }).fill('Legacy title');
  await page.getByText('Legacy title', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Legacy title/ }).click();
  await page.getByText('First duplicate anchor', { exact: true }).waitFor();
  await page.waitForFunction(() => window.getSelection()?.toString() === 'duplicate anchor');
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
  await page.getByTitle('Toggle folders').click();
  const reopenedAfterPageBookmark = await clickVisibleText('other.txt');
  await page.getByTitle('Toggle folders').click();
  check('other document opens after saving a page bookmark', reopenedAfterPageBookmark);
  await page.getByText('A different document', { exact: true }).waitFor();
  await page.getByTitle('Bookmark collection').click();
  await page.getByRole('textbox', { name: 'Search bookmarks' }).fill('Second occurrence');
  await page.getByText('Second occurrence', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Second occurrence/ }).click();
  await page.getByText('First duplicate anchor', { exact: true }).waitFor();
  await page.waitForFunction(() => window.getSelection()?.toString() === 'duplicate anchor');
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

    check(`[${width}px] text selection still opens bookmark naming`, await selectText('duplicate anchor', 1));
    await page.getByRole('button', { name: 'Bookmark selected passage' }).click();
    const dialog = page.getByRole('dialog', { name: 'Save bookmark' });
    await dialog.waitFor();
    const dialogFits = await page.evaluate(() => {
      const rect = document.querySelector('[role="dialog"]').getBoundingClientRect();
      return rect.left >= 0 && rect.right <= window.innerWidth && rect.width <= window.innerWidth;
    });
    check(`[${width}px] optional-name dialog fits viewport`, dialogFits);
    await page.screenshot({ path: `${evidenceDir}/name-dialog-${width}.png` });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  }

  check('no browser runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '));
} catch (error) {
  console.error(error.stack);
  check('bookmark browser flow completes', false, String(error).split('\n')[0]);
  await page.screenshot({ path: `${evidenceDir}/failure.png` }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter(([, passed]) => !passed);
console.log(`\n${results.length - failed.length}/${results.length} bookmark browser checks passed`);
process.exit(failed.length ? 1 : 0);
