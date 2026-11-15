// usage: node salon.js <convId>... — reads the Salon line from each chat's card (read-only)
const { login, masker } = require('./common'); const mask = masker();
(async () => { const { browser, page, BASE } = await login();
  for (const c of process.argv.slice(2)) { await page.goto(BASE + '/chat?c=' + c); await page.waitForLoadState('networkidle'); await page.waitForTimeout(3000);
    const t = await page.locator('main').innerText(); const all = [...t.matchAll(/\nSalon\n([^\n]*)/g)].map(x => mask(x[1])); console.log("SALON", c, JSON.stringify(all)); }
  await browser.close(); })().catch(e => { console.error('ERR', e.message); process.exit(1); });
