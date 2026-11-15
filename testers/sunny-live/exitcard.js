// read-only: print each chat's last card block (field labels + values), names masked
const { login, BASE } = require('./common');
const NAMES = (process.env.MASK_LEGEND || '').split(';').filter(Boolean).map(p => p.split('=')).map(([r, l]) => [r.trim().toLowerCase(), l.trim()]);
const mask = t => NAMES.reduce((s, [n, l]) => s.replace(new RegExp(n, 'gi'), l), t);
(async () => {
  const { browser, page } = await login();
  for (const c of process.argv.slice(2)) {
    await page.goto(BASE + '/chat?c=' + c); await page.waitForLoadState('networkidle'); await page.waitForTimeout(3000);
    const t = await page.locator('main').innerText();
    const end = t.lastIndexOf('Create draft'); const start = t.lastIndexOf('Proposal — nothing created', end);
    console.log('=== ' + c + (end < 0 ? ' (no Create draft button / no card)' : ''));
    if (end > 0) console.log(mask(t.slice(start, end)).replace(/\n+/g, ' | '));
  }
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
