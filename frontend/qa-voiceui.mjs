/* Voice UI QA: select word in reader -> Speak button -> click, no crash (390+1280).
   Headless has no audio device: asserts presence + no error, NOT sound. */
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
    // Select a word inside the reader (double-click), popover must offer Speak
    await page.getByText(/transmitter/i).first().dblclick({ timeout: 10000 });
    const speak = page.getByTitle('Read this aloud');
    await speak.waitFor({ timeout: 10000 });
    check(`[${tag}] Speak button on selection`, true);
    await speak.click();
    await page.waitForTimeout(1500);
    const errToast = await page.getByText(/not supported|failed/i).count().catch(() => 0);
    check(`[${tag}] speak click, no error`, errToast === 0);
    await page.screenshot({ path: `../qa-artifacts/knoprix-chat-slice/voice-${tag}.png` });
  } catch (e) {
    check(`[${tag}] voice flow`, false, String(e).split('\n')[0]);
    await page.screenshot({ path: `../qa-artifacts/knoprix-chat-slice/voice-${tag}-FAIL.png` }).catch(() => {});
  }
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 8000))]);
}
const p = results.filter(([, ok]) => ok).length;
console.log(`\n${p}/${results.length} voice UI checks passed`);
process.exit(p === results.length ? 0 : 1);
