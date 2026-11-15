// usage: node base.js <set> <turn> "<text>" [convId]
// Types ONE message (never clicks any button), waits for the full /api/chat reply,
// masks every person/salon name, saves the masked body to ../resp/base-<set>-t<turn>-<HHMMSS>Z.json,
// prints a masked summary. Flags any /api/forms/instances write (a draft made by itself).
const fs = require('fs'), path = require('path');
const { login, stamp } = require('./common');
const { send } = require('./lib2');
if (!process.env.MASK_LEGEND) { console.error('STOP: MASK_LEGEND not set; refusing to run unmasked'); process.exit(2); }
const STATIC = (process.env.MASK_LEGEND || '').split(';').filter(Boolean).map(p => p.split('=')).map(([r, l]) => [r.trim().toLowerCase(), l.trim()]); // legend comes from env MASK_LEGEND (never stored in a file)
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function buildMask(extra) {
  const pairs = [...extra, ...STATIC].sort((a, b) => b[0].length - a[0].length);
  return s => {
    let t = String(s);
    // salon names with a state prefix (NE Omaha Pacific, IA Altoona ...)
    t = t.replace(/\b(NE|IA|KS|MO|SD|ND|MN|WI|IL|CO|OK|TX|AR|WY|MT) [A-Z0-9][\w.'&-]*(?: (?:and|&|[A-Z0-9][\w.'&-]*)){0,5}/g, 'Salon X');
    for (const [real, lab] of pairs) t = t.replace(new RegExp('\\b' + esc(real) + '\\b', 'gi'), lab);
    // bold names the app offers ("for **X**", "find **X**", "mean **X**")
    t = t.replace(/((?:for|find|mean|Did you mean|is|about|with)\s+\*\*)([^*:\n]{2,40})(\*\*)/g, (m, a, n, c) => /form|policy|warning|corrective|coaching|salon|other|payroll/i.test(n) ? m : a + 'Employee ?' + c);
    return t;
  };
}
(async () => {
  const [set, turn, text, convArg] = process.argv.slice(2);
  const { browser, page, BASE } = await login();
  const formsWrites = [];
  page.on('response', r => { try { const u = new URL(r.url()); if (u.pathname.startsWith('/api/forms/instances') && r.request().method() !== 'GET') formsWrites.push(r.request().method() + ' ' + u.pathname + ' ' + r.status()); if (r.status() === 403 || r.headers()['x-vercel-mitigated']) formsWrites.push('BLOCK ' + r.status() + ' ' + u.pathname + ' ' + (r.headers()['x-vercel-mitigated'] || '')); } catch (e) {} });
  await page.goto(BASE + (convArg ? '/chat?c=' + convArg : '/')); await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  let how = 'typed', r;
  const t0 = new Date();
  if (process.env.BUTTON === '1') {
    // the chat's own "Create a form from this conversation" control (never the card's Create draft)
    const btn = page.getByRole('button', { name: /^Create a form from this conversation/i }).or(page.getByRole('link', { name: /^Create a form from this conversation/i }));
    const n = await btn.count();
    console.log('CHAT_BUTTON_COUNT', n);
    if (n > 0) {
      how = 'pressed chat button';
      const respP = page.waitForResponse(x => x.request().method() === 'POST' && new URL(x.url()).pathname === '/api/chat', { timeout: 120000 }).catch(() => null);
      await btn.last().click();
      const res = await respP;
      if (res) r = { status: res.status(), body: await res.text() };
      else { await page.waitForTimeout(8000); r = { status: 0, body: JSON.stringify({ body: { content: 'NO /api/chat call after button. Page shows: ' + (await page.locator('main').innerText()).slice(-1500) } }) }; }
      await page.waitForTimeout(3000);
    }
  }
  if (!r) r = await send(page, text);
  const t1 = new Date();
  console.log('HOW', how);
  let body = {}; try { body = JSON.parse(r.body).body || {}; } catch (e) {}
  const fp = body.formProposal || {};
  const extra = [];
  for (const n of [fp.employeeName].filter(Boolean)) { extra.push([n, 'Employee *']); n.split(/\s+/).filter(w => w.length > 2).forEach(w => extra.push([w, 'Employee *'])); }
  if (fp.locationName) extra.push([fp.locationName, 'Salon X']);
  const mask = buildMask(extra);
  const masked = mask(r.body);
  const leak = STATIC.map(x => x[0]).concat(extra.map(x => x[0])).filter(w => new RegExp('\\b' + esc(w) + '\\b', 'i').test(masked));
  if (leak.length) { console.log('MASK LEAK - not saved, count', leak.length); }
  else { const f = path.join(__dirname, '..', 'resp', `base-${set}-t${turn}-${stamp()}Z.json`); fs.writeFileSync(f, masked); console.log('SAVED', f); }
  let conv = convArg; try { const j = await page.evaluate(async () => (await fetch('/api/chat/conversations')).json()); conv = conv || j.conversations[0].id; } catch (e) {}
  console.log('SET', set, 'TURN', turn, 'CONV', conv, 'HTTP', r.status, 'SENT', t0.toISOString(), 'SECS', ((t1 - t0) / 1000).toFixed(1));
  console.log('FORMS_WRITES', JSON.stringify(formsWrites));
  console.log('CARD', JSON.stringify({ form: fp.templateName || null, employee: fp.employeeName ? mask(fp.employeeName) : null, title: fp.employeeRole ? mask(fp.employeeRole) : null, salon: fp.locationName ? 'Salon X' : null, locRes: fp.locationResolution || null, level: fp.warningLevel || null, date: fp.formDate || null, status: fp.status || null }));
  console.log('REPLY>>>\n' + mask(body.content || r.body).slice(0, 2500));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
