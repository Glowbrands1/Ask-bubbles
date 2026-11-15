const { login } = require('./common');
(async () => {
  const { browser, page } = await login();
  await page.goto(require('./common').BASE + '/'); await page.waitForLoadState('networkidle');
  const ta = page.locator('textarea[aria-label="Ask Sunny a question"], textarea[placeholder^="Ask about policy"]').first();
  await ta.waitFor({ timeout: 30000 });
  const before = (await page.locator('main').innerText()).length;
  const q = 'what is the cell phone policy';
  await ta.fill(q);
  const respP = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/chat', { timeout: 120000 });
  const t0 = Date.now();
  console.log('SENT_UTC', new Date(t0).toISOString());
  await ta.press('Enter');
  let first = null;
  const poll = setInterval(async () => {
    try {
      const t = await page.locator('main').innerText();
      if (!first && t.length > before + q.length + 40) { first = (Date.now() - t0) / 1000; }
    } catch {}
  }, 250);
  const res = await respP;
  const status = res.status();
  const txt = await res.text();
  const tFull = (Date.now() - t0) / 1000;
  await page.waitForTimeout(3000);
  clearInterval(poll);
  console.log('HTTP', status, 'FIRST_WORDS_S', first, 'FULL_S', tFull);
  let body; try { body = JSON.parse(txt); } catch { body = null; }
  if (body) {
    const b = body.body || body;
    console.log('CONTENT_HEAD', String(b.content || b.error || JSON.stringify(body)).slice(0, 700));
    console.log('CITATIONS', JSON.stringify((b.citations || []).map(c => [c.title || c.documentTitle, c.page || c.pageNumber])).slice(0, 500));
    console.log('FORMPROPOSAL', !!b.formProposal);
  } else console.log('RAW', txt.slice(0, 700));
  const tail = (await page.locator('main').innerText()).slice(-900);
  console.log('PAGE_TAIL', tail);
  console.log('URL', page.url());
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
