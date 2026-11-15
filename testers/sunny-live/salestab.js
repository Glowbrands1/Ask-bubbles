// read-only: open Reports, switch to the Sales Totals tab, print text around chosen salons
const { login, BASE } = require('./common');
(async () => {
  const { browser, page } = await login();
  await page.goto(BASE + '/reports/salon-performance'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(6000);
  await page.getByText(/^sales totals$/i).first().click();
  await page.waitForLoadState('networkidle'); await page.waitForTimeout(8000);
  console.log('URL', page.url());
  const t = await page.locator('main').innerText();
  console.log(t.slice(0, 2500));
  for (const s of ['Kansas City Liberty', 'Lawrence', 'Omaha Pacific', 'Overland Park']) { const i = t.indexOf(s); console.log('--- ' + s + ': ' + (i < 0 ? 'NOT FOUND' : t.slice(i, i + 300).replace(/\n/g, ' | '))); }
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
