// read-only: list distinct employee names (+salon, form count) from the forms register; prints to stdout only
const { login, BASE } = require('./common');
(async () => {
  const { browser, page } = await login();
  const r = await page.evaluate(async () => { const x = await fetch('/api/forms/instances?limit=500'); return { s: x.status, j: await x.json().catch(() => null) }; });
  const list = (r.j && (r.j.instances || r.j.forms || r.j.items)) || [];
  const m = {};
  for (const f of list) { const n = f.employeeName || ''; if (!/^[A-Z][a-z]+ [A-Z][a-z'-]+$/.test(n)) continue; m[n] = m[n] || { c: 0, loc: new Set(), t: new Set() }; m[n].c++; if (f.locationName) m[n].loc.add(f.locationName); m[n].t.add(f.templateShortName || f.templateName); }
  console.log('HTTP', r.s, 'forms', list.length);
  for (const [n, v] of Object.entries(m).sort((a, b) => b[1].c - a[1].c)) console.log(n, '|', v.c, '|', [...v.loc].join('/'), '|', [...v.t].join('/'));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
