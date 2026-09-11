/* Summary UI QA: chat panel -> Summarize -> quoted key lines (390 + 1280). */
import { chromium } from 'playwright';

const results = [];
const check = (n, c, d = '') => { results.push([n, !!c]); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };

for (const [tag, vp] of [['390', { width: 390, height: 844 }], ['1280', { width: 1280, height: 800 }]]) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: vp });
  try {
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('Email address').fill('demo@knoprix.io');
    await page.getByPlaceholder('Password').fill('Password123!');
    await page.locator('form').getByRole('button').first().click();
    await page.getByRole('button', { name: /Chat QA signals/ }).first().click({ timeout: 15000 });
    const docName = page.getByText('chatqa.txt');
    for (let i = 0; i < await docName.count(); i++) {
      if (await docName.nth(i).isVisible().catch(() => false)) { await docName.nth(i).click({ timeout: 8000 }); break; }
    }
    await page.getByTitle('Chat with your documents').click({ timeout: 10000 });
    await page.getByRole('dialog', { name: 'Document chat' }).waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: /Summarize / }).click({ timeout: 10000 });
    await page.getByText('key lines', { exact: false }).first().waitFor({ timeout: 15000 });
    check(`[${tag}] summary renders quoted lines`, true);
    await page.screenshot({ path: `../qa-artifacts/knoprix-chat-slice/summary-${tag}.png` });
  } catch (e) {
    check(`[${tag}] summary flow`, false, String(e).split('\n')[0]);
  }
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 8000))]);
}
const p = results.filter(([, ok]) => ok).length;
console.log(`\n${p}/${results.length} summary UI checks passed`);
process.exit(p === results.length ? 0 : 1);
