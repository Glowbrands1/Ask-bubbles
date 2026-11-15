// Draft A hand reset on its chat form card: untick Termination, tick Written, Save changes.
// Guards: only PATCH to draft A is allowed through; any POST/DELETE/PATCH elsewhere to forms API is aborted.
const { login, BASE } = require('./common');
const A = 'a3e11f25-54d8-599c-9b3b-b60bb2bb913d';
(async () => {
  const { browser, page } = await login();
  const sent = [];
  await page.route('**/api/**', route => {
    const r = route.request(); const m = r.method(); const u = r.url();
    if (m === 'GET') return route.continue();
    if (m === 'PATCH' && u.includes('/api/forms/instances/' + A)) { sent.push(m + ' A ' + r.postData()); return route.continue(); }
    sent.push('ABORTED ' + m + ' ' + u.replace(/[0-9a-f-]{36}/g, '<id>')); return route.abort();
  });
  await page.goto(BASE + '/chat?c=conv_mwhk103r2wrucnt'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(4000);
  const save = page.getByRole('button', { name: 'Save changes' });
  if (await save.count() !== 1) throw new Error('STOP: Save changes count ' + await save.count());
  const term = page.getByRole('checkbox', { name: /^Termination$/ });
  const writ = page.getByRole('checkbox', { name: /Written/ });
  if (await term.count() !== 1 || await writ.count() !== 1) throw new Error('STOP: checkbox counts T' + await term.count() + ' W' + await writ.count());
  console.log('BEFORE term', await term.getAttribute('aria-checked'), 'written', await writ.getAttribute('aria-checked'));
  if (await term.getAttribute('aria-checked') === 'true') await term.click();
  if (await writ.getAttribute('aria-checked') !== 'true') await writ.click();
  await page.waitForTimeout(500);
  console.log('CLICKED term', await term.getAttribute('aria-checked'), 'written', await writ.getAttribute('aria-checked'));
  await save.click(); await page.waitForLoadState('networkidle'); await page.waitForTimeout(3000);
  console.log('SENT', JSON.stringify(sent).replace(/"[A-Z][a-z]+ [A-Z][a-z]+"/g, '"<N>"'));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
