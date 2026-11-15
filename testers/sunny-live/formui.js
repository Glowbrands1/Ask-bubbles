// read-only: find the form page and list its buttons/links (no clicks)
const { login, BASE } = require('./common');
(async () => {
  const { browser, page } = await login();
  for (const p of ['/forms/instances/' + process.argv[2], '/forms/' + process.argv[2], '/forms/monitoring?form=' + process.argv[2]]) {
    const r = await page.goto(BASE + p); await page.waitForLoadState('networkidle'); await page.waitForTimeout(3000);
    const btns = await page.$$eval('a,button', as => as.map(a => (a.tagName + ':' + (a.getAttribute('href') || '') + ':' + (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 40))).filter(s => !/^A:\/(knowledge|videos|resources|admin|meetings|reports|reviews)/.test(s)));
    console.log('=== ' + p + ' status ' + (r && r.status()) + ' -> ' + page.url());
    console.log([...new Set(btns)].slice(0, 60).join('\n'));
  }
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
