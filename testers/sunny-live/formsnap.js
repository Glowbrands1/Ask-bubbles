// read-only GET of one draft; saves masked JSON; prints field values with person names masked
const fs = require('fs'), path = require('path');
const { login, BASE } = require('./common');
(async () => {
  const [id, tag] = process.argv.slice(2);
  const { browser, page } = await login();
  const raw = await page.evaluate(async (id) => { const r = await fetch('/api/forms/instances/' + id); return { s: r.status, t: await r.text() }; }, id);
  await browser.close();
  const j = JSON.parse(raw.t);
  const inst = j.instance || j.formInstance || j;
  const vals = inst.values || inst.fieldValues || j.values || {};
  // collect person names from employee-ish fields to mask
  const names = [];
  for (const [k, v] of Object.entries(vals)) { const val = v && typeof v === 'object' && 'value' in v ? v.value : v; if (/employee.*name|^employee$|team_member|manager_name|supervisor|signature|witness/i.test(k) && typeof val === 'string' && val.trim()) names.push(val.trim()); }
  for (const k of ['employeeName','employee_name','subjectName']) if (inst[k]) names.push(String(inst[k]));
  const parts = [...new Set(names.flatMap(n => [n, ...n.split(/\s+/).filter(w => w.length > 2)]))].sort((a, b) => b.length - a.length);
  const mask = s => parts.reduce((t, n) => t.split(n).join('Employee*'), String(s));
  const out = path.join(__dirname, '..', 'resp', `form-${tag}-${new Date().toISOString().slice(11,19).replace(/:/g,'')}Z.json`);
  fs.writeFileSync(out, mask(raw.t));
  console.log('HTTP', raw.s, 'SAVED', out, 'status', inst.status, 'updated_at', inst.updatedAt || inst.updated_at);
  console.log('TOP_KEYS', Object.keys(j).join(','), '| INST_KEYS', Object.keys(inst).slice(0, 30).join(','));
  for (const [k, v] of Object.entries(vals)) { const val = v && typeof v === 'object' && 'value' in v ? v.value : v; console.log('  ' + k + ' = ' + mask(JSON.stringify(val)).slice(0, 300)); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
