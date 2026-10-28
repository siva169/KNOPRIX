import { chromium } from 'playwright';

const pdfDocument = {
  id: 'pdf1',
  project_id: 'p1',
  file_name: 'sync.pdf',
  file_type: 'pdf',
  page_count: 2,
};

const slideDocument = {
  id: 'ppt1',
  project_id: 'p1',
  file_name: 'sync.ppt',
  file_type: 'ppt',
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
    projects: [{ id: 'p1', name: 'Research', file_count: 2 }],
  })));
  await page.route('**/api/projects/p1/documents', (route) => route.fulfill(json({
    documents: [pdfDocument, slideDocument],
  })));
  await page.route('**/api/projects/p1/bookmarks', (route) => route.fulfill(json({ bookmarks: [] })));
  await page.route('**/api/providers/allowlist', (route) => route.fulfill(json({ providers: [] })));
  await page.route('**/api/documents/*/highlights', (route) => route.fulfill(json({ highlights: [] })));
  await page.route('**/api/documents/pdf1/stream', (route) => route.fulfill({
    status: 200,
    contentType: 'application/pdf',
    body: makePdf(2),
  }));
  await page.route('**/api/documents/ppt1/slides', (route) => route.fulfill(json({
    widthPt: 800,
    heightPt: 900,
    slides: [1, 2].map((number) => ({
      bg: 'ffffff',
      shapes: [{ type: 'text', x: 8, y: 8, w: 84, h: 12, paras: [{
        runs: [{ t: `Slide ${number}`, size: 28, color: '111111' }],
      }] }],
    })),
  })));
}

async function assertToolbarFollowsScroll(page, fileName, pageSelector, label) {
  const visibleTarget = page.locator(
    `button[aria-label="Open document ${fileName}"]:visible, button[aria-label="Open ${fileName}"]:visible`,
  ).first();
  if (!(await visibleTarget.count())) {
    const toggle = page.getByTitle('Toggle folders');
    if (await toggle.count()) await toggle.click();
  }
  await visibleTarget.waitFor({ state: 'visible' });
  await visibleTarget.click();
  const secondPage = page.locator(pageSelector);
  await secondPage.waitFor({ state: 'visible' });
  await secondPage.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);

  const toolbarPage = page.locator('input[title="Type a page number and press Enter to jump"]');
  const value = await toolbarPage.inputValue();
  if (value !== '2') {
    throw new Error(`${label}: toolbar stayed on Page ${value} after the visible content moved to page 2`);
  }
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
    await mockWorkspace(page);
    await page.goto('http://localhost:4173/');
    await page.locator('button[aria-label="Open document sync.pdf"]:visible, button[aria-label="Open sync.pdf"]:visible').first().waitFor({ state: 'visible' });

    await assertToolbarFollowsScroll(page, 'sync.pdf', '[data-region-page="2"]', `${breakpoint.name} PDF continuous viewer`);
    await assertToolbarFollowsScroll(page, 'sync.ppt', '[data-page="2"]', `${breakpoint.name} slide continuous viewer`);
    console.log(`[PASS] ${breakpoint.name} (${breakpoint.width}px): PDF and slides follow scroll`);
    await page.close();
  }

  await browser.close();
  console.log('ALL PAGE SYNCHRONIZATION CHECKS PASSED: 390px, 425px, 768px, 1024px');
}

run().catch((error) => {
  console.error('TEST FAILED:', error);
  process.exit(1);
});
