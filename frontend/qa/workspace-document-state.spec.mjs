import { chromium } from 'playwright';

const documentRow = {
  id: 'pdf1',
  project_id: 'p1',
  file_name: 'workspace-state.pdf',
  file_type: 'pdf',
  page_count: 2,
};

function makePdf(pageCount = 2) {
  const fontRef = pageCount + 3;
  const pageRefs = Array.from({ length: pageCount }, (_, index) => `${index + 3} 0 R`).join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageRefs}] /Count ${pageCount} >>`,
  ];
  for (let index = 0; index < pageCount; index += 1) {
    const contentRef = pageCount + 4 + index;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 700] /Resources << /Font << /F1 ${fontRef} 0 R >> >> /Contents ${contentRef} 0 R >>`,
    );
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (let index = 0; index < pageCount; index += 1) {
    const content = `BT /F1 28 Tf 40 640 Td (PDF page ${index + 1}) Tj ET\n`;
    objects.push(`<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}endstream`);
  }
  let source = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(new TextEncoder().encode(source).length);
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = new TextEncoder().encode(source).length;
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  source += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(source);
}

async function mockWorkspace(page, streamRequests) {
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
  await page.route('**/api/projects/p1/documents', (route) => route.fulfill(json({ documents: [documentRow] })));
  await page.route('**/api/projects/p1/bookmarks', (route) => route.fulfill(json({ bookmarks: [] })));
  await page.route('**/api/providers/allowlist', (route) => route.fulfill(json({ providers: [] })));
  await page.route('**/api/documents/*/highlights', (route) => route.fulfill(json({ highlights: [] })));
  await page.route('**/api/documents/pdf1/stream', (route) => {
    streamRequests.count += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      headers: { 'Cache-Control': 'no-store' },
      body: makePdf(2),
    });
  });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const breakpoints = [
    { name: 'mobile-small', width: 390, height: 844 },
    { name: 'mobile-large', width: 425, height: 900 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1024, height: 768 },
  ];

  for (const breakpoint of breakpoints) {
    const page = await browser.newPage({ viewport: breakpoint, reducedMotion: 'reduce' });
    const streamRequests = { count: 0 };
    await mockWorkspace(page, streamRequests);
    await page.goto('http://localhost:4173/');
    const openDocument = page.locator('button[aria-label="Open document workspace-state.pdf"]:visible, button[aria-label="Open workspace-state.pdf"]:visible').first();
    await openDocument.waitFor({ state: 'visible' });
    await openDocument.click();

    const secondPage = page.locator('[data-region-page="2"]');
    await secondPage.waitFor({ state: 'visible' });
    await secondPage.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    const toolbarPage = page.locator('input[title="Type a page number and press Enter to jump"]');
    if (await toolbarPage.inputValue() !== '2') {
      throw new Error(`[${breakpoint.name}] setup failed: document did not reach page 2`);
    }
    const initialRequests = streamRequests.count;

    await page.getByRole('button', { name: 'AI Wing' }).click();
    await page.getByText('AI Chat', { exact: true }).waitFor({ state: 'visible' });
    if (await page.locator('[data-region-page]').count() === 0) {
      throw new Error(`[${breakpoint.name}] Reading Desk viewer was unmounted while AI Wing was open`);
    }
    await page.getByRole('button', { name: 'Reading Desk' }).click();
    await toolbarPage.waitFor({ state: 'visible' });
    await page.waitForTimeout(200);

    if (await toolbarPage.inputValue() !== '2') {
      throw new Error(`[${breakpoint.name}] page reset after switching AI Wing and Reading Desk`);
    }
    if (streamRequests.count !== initialRequests) {
      throw new Error(`[${breakpoint.name}] document stream reloaded (${initialRequests} -> ${streamRequests.count})`);
    }
    console.log(`[PASS] ${breakpoint.name} (${breakpoint.width}px): page and document load survived workspace switch`);
    await page.close();
  }

  await browser.close();
  console.log('ALL WORKSPACE DOCUMENT STATE CHECKS PASSED: 390px, 425px, 768px, 1024px');
}

run().catch((error) => {
  console.error('TEST FAILED:', error);
  process.exit(1);
});
