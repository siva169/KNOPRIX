/* Chat-slice browser QA: login -> open doc -> chat -> mocked cited answer.
   Viewports: 390 (bottom sheet) + 1280 (side panel). Saves PNG evidence. */
import { chromium } from 'playwright';

const SHOTS = new URL('../qa-artifacts/knoprix-chat-slice/', import.meta.url).pathname;
const { mkdirSync } = await import('fs');
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, cond, detail = '') => {
  results.push([name, !!cond]);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const ONLY = process.env.QA_ONLY || null; // e.g. QA_ONLY=390
for (const [tag, vp] of [['390', { width: 390, height: 844 }], ['1280', { width: 1280, height: 800 }]]) {
  if (ONLY && ONLY !== tag) continue;
  const step = (m) => console.log(`  [${tag}] …${m}`);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: vp });
  try {
    step('goto');
    step('goto');
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
    step('login');
    await page.getByPlaceholder('Email address').fill('demo@knoprix.io');
    await page.getByPlaceholder('Password').fill('Password123!');
    await page.locator('form').getByRole('button').first().click();
    step('open project');
    // Projects render as buttons under "Choose a different project"
    // (the CURRENT TRAIL heading shows the same name but is NOT clickable).
    await page.getByRole('button', { name: /Chat QA signals/ }).first().click({ timeout: 15000 });
    step('open doc (first VISIBLE match)');
    const docName = page.getByText('chatqa.txt');
    const n = await docName.count();
    step(`doc matches=${n}`);
    let opened = false;
    for (let i = 0; i < n && !opened; i++) {
      if (await docName.nth(i).isVisible().catch(() => false)) {
        await docName.nth(i).click({ timeout: 8000 });
        opened = true;
      }
    }
    check(`[${tag}] doc opens`, opened);
    if (!opened) throw new Error('no visible doc row');
    step('open chat');
    // Open chat from the reader toolbar
    await page.getByTitle('Chat with your documents').click({ timeout: 10000 });
    const dialog = page.getByRole('dialog', { name: 'Document chat' });
    check(`[${tag}] chat panel opens`, await dialog.isVisible());
    // Dismiss privacy notice if shown
    const ok = page.getByRole('button', { name: 'Understood' });
    if (await ok.isVisible().catch(() => false)) await ok.click();
    await page.getByLabel('Chat question').fill('signal');
    await page.getByTitle('Ask').click();
    await page.getByText('MOCKED answer', { exact: false }).first().waitFor({ timeout: 15000 });
    check(`[${tag}] mocked answer renders`, true);
    const cites = await page.locator('text=/chatqa\\.txt · p\\.\\d/').count();
    check(`[${tag}] citation card shows file+page`, cites >= 1, `${cites} found`);
    await page.screenshot({ path: `${SHOTS}chat-${tag}.png` });
    // Mode toggle exists (side<->full per boss)
    check(`[${tag}] side/full toggle present`,
      await page.getByTitle(/Full screen|Side panel/).count() >= 1);
  } catch (e) {
    check(`[${tag}] flow completes`, false, String(e).split('\n')[0]);
    await page.screenshot({ path: `${SHOTS}chat-${tag}-FAIL.png` }).catch(() => {});
  }
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 8000))]);
}

const passed = results.filter(([, ok]) => ok).length;
console.log(`\n${passed}/${results.length} browser checks passed`);
process.exit(passed === results.length ? 0 : 1);
