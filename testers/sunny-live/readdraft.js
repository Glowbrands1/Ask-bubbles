// usage: node readdraft.js <id> <tag>  — GET the instance, save masked JSON, print text fields
const fs=require('fs'), path=require('path'); const { login, masker, stamp } = require('./common');
(async () => { const [id, tag] = process.argv.slice(2); const mask = masker();
  const { browser, page } = await login();
  const r = await page.evaluate(async (id) => { const x = await fetch('/api/forms/instances/' + id); return [x.status, await x.text()]; }, id);
  const f = path.join(__dirname, '..', process.env.ROUND + '-bodies', `${process.env.ROUND}-${tag}-${stamp()}Z.json`); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, mask(r[1]));
  console.log('STATUS', r[0], 'SAVED', f);
  try { const walk = (o, p) => { if (o && typeof o === 'object') { for (const k in o) walk(o[k], p ? p + '.' + k : k); } else if (typeof o === 'string' && o.length && !/^[0-9a-f-]{36}$/.test(o)) console.log(p, '=', JSON.stringify(mask(o)).slice(0, 400)); };
    walk(JSON.parse(r[1]), ''); } catch (e) { console.log(mask(r[1]).slice(0, 3000)); }
  await browser.close(); })().catch(e => { console.error('ERR', e.message); process.exit(1); });
