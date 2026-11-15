const { login, BASE } = require('./common');
const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LEGEND_RE = new RegExp((process.env.MASK_LEGEND || '').split(';').filter(Boolean).map(x => esc(x.split('=')[0].trim())).join('|') || '^$', 'gi');
(async () => {
  const { browser, page } = await login();
  await page.goto(BASE + '/chat?c=' + process.argv[2]); await page.waitForLoadState('networkidle'); await page.waitForTimeout(3000);
  const t = await page.locator('main').innerText();
  const i = Math.max(0, t.lastIndexOf('Create draft') - 900); console.log('CREATE_DRAFT_COUNT', (t.match(/Create draft/g)||[]).length);
  console.log(t.slice(i, i + 950).replace(/\nEmployee\n[^\n]+/g, '\nEmployee\n[masked]').replace(LEGEND_RE,'Employee *').replace(/\b(NE|IA|KS|MO|SD|ND|MN|WI|IL|CO|OK|TX|AR|WY|MT) [A-Z0-9][^\n]*/g, 'Salon X'));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
