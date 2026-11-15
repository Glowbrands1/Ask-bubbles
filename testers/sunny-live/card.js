// usage: node card.js <convId>... — prints each chat's card blocks (Proposal … Create draft), read-only
const { login, masker } = require('./common'); const mask = masker();
(async () => { const { browser, page, BASE } = await login();
  for (const c of process.argv.slice(2)) { await page.goto(BASE + '/chat?c=' + c); await page.waitForLoadState('networkidle'); await page.waitForTimeout(3000);
    const t = mask(await page.locator('main').innerText());
    const blocks = [...t.matchAll(/Corrective Action Form\n\nProposal[\s\S]*?Create draft/g)].map(m => m[0].replace(/\n+/g, ' | '));
    console.log('==', c); blocks.forEach((b, i) => console.log('  card', i + 1, b));
    console.log('  on-file lines:', JSON.stringify(t.split('\n').filter(l => /on file|form monitoring/i.test(l)))); }
  await browser.close(); })().catch(e => { console.error('ERR', e.message); process.exit(1); });
