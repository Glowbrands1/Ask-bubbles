// Draft B hand restore on its chat form card: remove the G3 sentence, set date back to 2026-10-31, Save changes.
// Guard: only PATCH to draft B passes; any other non-GET /api request is aborted.
const { login, BASE } = require('./common');
const B = 'b5443119-712d-59c4-b640-36b7651564e3';
const ADDED = ' She also left 20 minutes early.';
(async () => {
  const { browser, page } = await login();
  const sent = [];
  await page.route('**/api/**', route => {
    const r = route.request(); const m = r.method(); const u = r.url();
    if (m === 'GET') return route.continue();
    if (m === 'PATCH' && u.includes('/api/forms/instances/' + B)) { sent.push('PATCH B'); return route.continue(); }
    sent.push('ABORTED ' + m + ' ' + u.replace(/[0-9a-f-]{36}/g, '<id>')); return route.abort();
  });
  await page.goto(BASE + '/chat?c=conv_mwhmys2l2lzrdgv'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(4000);
  const save = page.getByRole('button', { name: 'Save changes' });
  if (await save.count() !== 1) throw new Error('STOP: Save changes count ' + await save.count());
  const tas = page.locator('textarea');
  let target = null;
  for (let i = 0; i < await tas.count(); i++) { const v = await tas.nth(i).inputValue(); if (v.includes(ADDED)) { if (target) throw new Error('STOP: two textareas match'); target = tas.nth(i); } }
  if (!target) throw new Error('STOP: no textarea with the added sentence');
  const dates = page.locator('input[type=date]');
  let dt = null;
  for (let i = 0; i < await dates.count(); i++) if (await dates.nth(i).inputValue() === '2026-11-05') { if (dt) throw new Error('STOP: two date inputs match'); dt = dates.nth(i); }
  if (!dt) throw new Error('STOP: no date input at 2026-11-05 (found ' + await dates.count() + ')');
  const v = await target.inputValue();
  if (v.split(ADDED).length !== 2) throw new Error('STOP: sentence count');
  await target.fill(v.replace(ADDED, ''));
  await dt.fill('2026-10-31');
  await page.waitForTimeout(500);
  console.log('FILLED date', await dt.inputValue(), '| sentence still present:', (await target.inputValue()).includes(ADDED));
  await save.click(); await page.waitForLoadState('networkidle'); await page.waitForTimeout(3000);
  console.log('SENT', JSON.stringify(sent));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
