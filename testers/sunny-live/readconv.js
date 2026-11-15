const { login, BASE } = require('./common');
(async () => {
  const { browser, page } = await login();
  await page.goto(BASE + '/chat?c=' + process.argv[2]); await page.waitForLoadState('networkidle');
  await page.waitForTimeout(4000);
  console.log((await page.locator('main').innerText()).slice(0, 3000));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
