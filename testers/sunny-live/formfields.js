// read-only: open a form page, list checkbox/radio inputs with labels + save-like buttons (no clicks)
const { login, BASE } = require('./common');
(async () => {
  const { browser, page } = await login();
  const id = process.argv[2];
  for (const p of [process.env.PAGE_PATH]) {
    const r = await page.goto(BASE + p); await page.waitForLoadState('networkidle'); await page.waitForTimeout(3000);
    console.log('=== ' + p + ' status ' + (r && r.status()) + ' -> ' + page.url());
    const inputs = await page.$$eval('input[type=checkbox],input[type=radio],[role=checkbox],[role=radio]', els => els.map(e => {
      const lab = (e.closest('label')?.innerText || e.getAttribute('aria-label') || e.id || '').trim().slice(0, 50);
      return (e.getAttribute('type') || e.getAttribute('role')) + '|' + (e.getAttribute('name') || '') + '|' + (e.value || '') + '|' + lab + '|checked=' + (e.checked ?? e.getAttribute('aria-checked'));
    }));
    console.log(inputs.join('\n'));
    const btns = await page.$$eval('button', bs => bs.map(b => (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 40)).filter(Boolean).filter(t=>!/More actions for/.test(t)));
    console.log('BUTTONS', JSON.stringify([...new Set(btns)]));
    if (inputs.length) break;
  }
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
