// read-only: prints a page's main text (people names not expected on these pages)
const { login, BASE } = require('./common');
(async () => {
  const { browser, page } = await login();
  for (const p of process.argv.slice(2)) {
    await page.goto(BASE + p); await page.waitForLoadState('networkidle'); await page.waitForTimeout(4000);
    console.log('=== ' + p + ' -> ' + page.url());
    console.log((await page.locator('body').innerText()).slice(0, 6000));
    if (process.env.LINKS) console.log('LINKS', JSON.stringify(await page.$$eval('a', as => as.map(a => a.getAttribute('href')).filter(h => h && h.startsWith('/')))));
  }
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
