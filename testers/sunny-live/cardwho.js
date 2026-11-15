// prints, for each card in a chat, whether its employee equals a typed name (no names printed)
const { login, BASE } = require('./common');
const TYPED = Object.fromEntries((process.env.MASK_LEGEND || '').split(';').filter(Boolean).map(p => p.split('=')).map(([r, l]) => [r.trim().toLowerCase(), l.trim()]).map(([r, l]) => [r, l.slice(-1)]));
(async () => {
  const { browser, page } = await login();
  await page.goto(BASE + '/chat?c=' + process.argv[2]); await page.waitForLoadState('networkidle'); await page.waitForTimeout(3000);
  const t = await page.locator('main').innerText();
  const m = [...t.matchAll(/\nEmployee\n([^\n]+)/g)].map(x => x[1].trim().toLowerCase());
  console.log('CARDS', m.length, m.map(n => TYPED[n] ? 'same as typed Employee ' + TYPED[n] : (Object.keys(TYPED).find(k => n.split(' ')[0] === k.split(' ')[0]) ? 'DIFFERENT person, same first name as Employee ' + TYPED[Object.keys(TYPED).find(k => n.split(' ')[0] === k.split(' ')[0])] : 'other name')).join(' | '));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
