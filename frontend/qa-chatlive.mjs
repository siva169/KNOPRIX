/* Live-call QA: proves browser-direct Groq answer. Key comes ONLY from
   env GROQ_KEY (ephemeral) — NEVER written to any file by this script. */
import { chromium } from 'playwright';

const KEY = process.env.GROQ_KEY || '';
if (!KEY) { console.log('FAIL  no GROQ_KEY in env'); process.exit(1); }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Email address').fill('demo@knoprix.io');
  await page.getByPlaceholder('Password').fill('Password123!');
  await page.locator('form').getByRole('button').first().click();
  await page.getByRole('button', { name: /Chat QA signals/ }).first().click({ timeout: 15000 });
  const docName = page.getByText('chatqa.txt');
  const n = await docName.count();
  for (let i = 0; i < n; i++) {
    if (await docName.nth(i).isVisible().catch(() => false)) { await docName.nth(i).click({ timeout: 8000 }); break; }
  }
  await page.getByTitle('Chat with your documents').click({ timeout: 10000 });
  await page.getByRole('dialog', { name: 'Document chat' }).waitFor({ timeout: 10000 });
  const ok = page.getByRole('button', { name: 'Understood' });
  if (await ok.isVisible().catch(() => false)) await ok.click();
  // Pick Groq provider, then plant the key straight into browser storage
  await page.getByLabel(/Provider/).selectOption('groq-free');
  await page.evaluate(([k]) => {
    const cur = JSON.parse(localStorage.getItem('knoprix_mr_provider_keys') || '{}');
    cur['groq-free'] = k;
    localStorage.setItem('knoprix_mr_provider_keys', JSON.stringify(cur));
  }, [KEY]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  // Reload resets workspace state: re-open project + doc (key survives in storage)
  await page.getByRole('button', { name: /Chat QA signals/ }).first().click({ timeout: 15000 });
  const docName2 = page.getByText('chatqa.txt');
  const n2 = await docName2.count();
  for (let i = 0; i < n2; i++) {
    if (await docName2.nth(i).isVisible().catch(() => false)) { await docName2.nth(i).click({ timeout: 8000 }); break; }
  }
  await page.getByTitle('Chat with your documents').click({ timeout: 10000 });
  await page.getByRole('dialog', { name: 'Document chat' }).waitFor({ timeout: 10000 });
  await page.getByLabel('Chat question').fill('What is the signal about?');
  await page.getByTitle('Ask').click();
  // Re-assert Groq AFTER reload (reload resets the picker to the first provider)
  await page.getByLabel(/Provider/).selectOption('groq-free');
  await page.getByTitle('Ask').click();
  await page.getByText('LIVE', { exact: true }).first().waitFor({ timeout: 45000 });
  console.log('PASS  live Groq answer renders (LIVE badge)');
} catch (e) {
  console.log('FAIL  live flow —', String(e).split('\n')[0]);
  try {
    const txt = await page.getByRole('dialog', { name: 'Document chat' }).innerText();
    console.log('INFO  panel shows:', JSON.stringify(txt.slice(0, 400)));
    await page.screenshot({ path: '../qa-artifacts/knoprix-chat-slice/live-FAIL.png' });
  } catch {}
  process.exitCode = 1;
}
await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 8000))]);
