/* Knowledge-map UI QA: dashboard button -> ring of dots -> pin word (390 + 1280). */
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
    await page.getByRole('button', { name: /Knowledge map/ }).click({ timeout: 10000 });
    await page.getByRole('dialog', { name: 'Knowledge map' }).waitFor({ timeout: 10000 });
    await page.locator('svg[aria-label="Concept map"] circle').first().waitFor({ timeout: 15000 });
    const dots = await page.locator('svg[aria-label="Concept map"] circle').count();
    check(`[${tag}] ring of dots renders`, dots >= 2, `${dots} dots`);
    await page.getByLabel('Track a word').fill('tower');
    await page.getByRole('button', { name: /Track/ }).click();
    await page.getByText('TRACKED', { exact: false }).first().waitFor({ timeout: 10000 }).catch(() => {});
    const tracked = await page.getByText('tower', { exact: true }).count();
    check(`[${tag}] pin-a-word works`, tracked >= 1);
    await page.screenshot({ path: `../qa-artifacts/knoprix-chat-slice/map-${tag}.png` });
  } catch (e) {
    check(`[${tag}] map flow`, false, String(e).split('\n')[0]);
  }
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 8000))]);
}
const p = results.filter(([, ok]) => ok).length;
console.log(`\n${p}/${results.length} map UI checks passed`);
process.exit(p === results.length ? 0 : 1);
