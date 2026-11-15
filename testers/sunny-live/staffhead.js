const { login, BASE } = require('./common');
(async () => {
  const { browser, page } = await login();
  for (const c of process.argv.slice(2)) {
    await page.goto(BASE + '/chat?c=' + c); await page.waitForLoadState('networkidle'); await page.waitForTimeout(2500);
    const t = await page.locator('main').innerText();
    const head = (t.match(/Here is the staff at ([^\n]+?) on the directory/) || [, 'n/a'])[1];
    const sections = [...t.matchAll(/\n(Salon Director|Assistant Salon Director|Tanning Consultant|Spa [A-Za-z ]+|[A-Z][A-Za-z ]+(?:Manager|Lead|Director|Consultant|Specialist|Technician))\n/g)].map(x => x[1]);
    const people = (t.split('on the directory')[1] || '').split('\n').filter(l => /^[A-Z][a-z]+ [A-Z]/.test(l) && !/Director|Consultant|Manager|Ask Sunny|Sunny supports|Create a form|Answers are|Claude/.test(l)).length;
    const salonsAsked = (t.match(/\n(NE|IA|KS|MO|SD|ND|MN|WI|IL|CO|OK|TX|AR|WY|MT) [^\n]+/g) || []).length;
    console.log(c, 'HEAD:', head, '| sections:', [...new Set(sections)].join(', '), '| person lines:', people, '| salon-name lines:', salonsAsked);
  }
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
