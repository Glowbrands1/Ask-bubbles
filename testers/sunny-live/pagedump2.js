const { login, BASE } = require('./common');
(async () => {
  const { browser, page } = await login();
  await page.goto(BASE + process.argv[2]); await page.waitForLoadState('networkidle'); await page.waitForTimeout(9000);
  const t = await page.locator('main').innerText().catch(async () => page.locator('body').innerText());
  console.log(t.slice(0, 9000));
  console.log('LINKS', JSON.stringify([...new Set(await page.$$eval('a,button', as => as.map(a => (a.getAttribute('href')||'') + '|' + a.innerText.trim().slice(0,40)).filter(s => /report|sales|total|stat/i.test(s))))]));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
