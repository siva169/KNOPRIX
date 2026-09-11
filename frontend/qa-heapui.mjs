/* Heap UI QA: stats modal -> Min-Heap demo -> ranked rows (390 + 1280). */
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
    // Open the visualizer (sidebar on desktop, menu on mobile)
    const statsBtn = page.getByRole('button', { name: /DSA Index Visualizer/ });
    if (await statsBtn.first().isVisible().catch(() => false)) {
      await statsBtn.first().click({ timeout: 10000 });
    } else {
      await page.getByTitle('Menu').or(page.getByLabel('Menu')).first().click({ timeout: 10000 }).catch(() => {});
      await statsBtn.first().click({ timeout: 10000 });
    }
    await page.getByLabel('Heap demo query').fill('signal');
    await page.getByRole('button', { name: 'Rank', exact: true }).click();
    await page.getByText('#1', { exact: false }).first().waitFor({ timeout: 15000 });
    check(`[${tag}] heap demo ranks rows`, true);
    await page.screenshot({ path: `../qa-artifacts/knoprix-chat-slice/heap-${tag}.png` });
  } catch (e) {
    check(`[${tag}] heap demo flow`, false, String(e).split('\n')[0]);
  }
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 8000))]);
}
const p = results.filter(([, ok]) => ok).length;
console.log(`\n${p}/${results.length} heap UI checks passed`);
process.exit(p === results.length ? 0 : 1);
