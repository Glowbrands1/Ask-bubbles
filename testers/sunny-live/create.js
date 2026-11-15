// usage: node create.js <convId>  — presses "Create draft" exactly ONCE and prints the new instance id
const { login, masker } = require('./common');
(async () => {
  const conv = process.argv[2]; const mask = masker();
  const { browser, page, BASE } = await login();
  const ids = new Set(); const calls = [];
  page.on('response', r => { try { const u = new URL(r.url()); const m = u.pathname.match(/^\/api\/forms\/instances\/([0-9a-f-]{36})/); if (m) ids.add(m[1]); if (u.pathname.startsWith('/api/forms')) calls.push(r.request().method() + ' ' + u.pathname + ' ' + r.status()); } catch (e) {} });
  await page.goto(BASE + '/chat?c=' + conv); await page.waitForLoadState('networkidle'); await page.waitForTimeout(3000);
  const btns = page.getByRole('button', { name: 'Create draft', exact: true });
  const n = await btns.count(); console.log('CREATE_BUTTONS', n);
  if (n < 1) { console.log('NO BUTTON - stopping'); await browser.close(); return; }
  console.log('CLICK_UTC', new Date().toISOString());
  await btns.last().click();                       // ONCE
  await page.getByText('Save changes').first().waitFor({ timeout: 90000 }).catch(() => console.log('no Save changes seen'));
  await page.waitForTimeout(25000);
  console.log('DONE_UTC', new Date().toISOString());
  console.log('FORMS_CALLS', JSON.stringify(calls));
  console.log('DRAFT_IDS', [...ids].join(',') || 'none');
  console.log('URL', mask(page.url()));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
