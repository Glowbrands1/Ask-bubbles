const { login } = require('./common');
(async () => {
  const { browser, page } = await login();
  console.log('URL_AFTER_LOGIN', page.url().replace(/\?.*/, ''));
  const who = await page.locator('body').innerText();
  console.log('ADMIN_SHOWN', /Admin/.test(who));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
