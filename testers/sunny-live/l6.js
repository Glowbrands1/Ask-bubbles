// usage: [CONV=conv_x] MASK_LEGEND='Full Name=<A>;...' node l6.js <tag> "<turn>"
// One turn. Guard: every non-GET request to /api/forms/** is ABORTED and logged (cards only, nothing saved).
const fs = require('fs'), path = require('path');
const { login, BASE } = require('./common');
const { send } = require('./lib2');
if (!process.env.MASK_LEGEND) { console.log('STOP: MASK_LEGEND not set'); process.exit(1); }
const pairs = [];
for (const e of process.env.MASK_LEGEND.split(';').filter(Boolean)) { const [n, l] = e.split('='); pairs.push([n, l]); for (const w of n.split(/\s+/)) if (w.length > 2) pairs.push([w, l]); }
pairs.sort((a, b) => b[0].length - a[0].length);
const mask = s => pairs.reduce((t, [n, l]) => t.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), l), String(s));
(async () => {
  const [tag, text] = process.argv.slice(2);
  const { browser, page } = await login();
  const writes = [];
  await page.route('**/api/forms/**', route => { const r = route.request(); if (r.method() === 'GET') return route.continue(); writes.push(r.method() + ' ' + new URL(r.url()).pathname.replace(/[0-9a-f-]{36}/g, '<id>')); return route.abort(); });
  await page.goto(BASE + (process.env.CONV ? '/chat?c=' + process.env.CONV : '/')); await page.waitForLoadState('networkidle'); await page.waitForTimeout(3000);
  const t0 = new Date(); const r = await send(page, text); const secs = ((Date.now() - t0) / 1000).toFixed(1);
  let body = {}; try { body = JSON.parse(r.body).body || {}; } catch (e) {}
  console.log(`SENT ${t0.toISOString()} SECS ${secs} HTTP ${r.status} TEXT "${mask(text)}"`);
  console.log('  KEYS ' + Object.keys(body).join(','));
  const fp = body.formProposal || (body.formProposals && body.formProposals[0]);
  if (fp) { const k = ['templateName','employeeName','employeeRole','formDate','status','warningLevel','payrollDeduct','payrollDeductAmount','priorActions','locationResolution','policyLine','issue','fromAgentLoop'];
    console.log('  CARD ' + mask(JSON.stringify(Object.fromEntries(k.filter(x => fp[x] !== undefined).map(x => [x, typeof fp[x] === 'string' ? fp[x].slice(0, 220) : fp[x]])))));
    const other = Object.keys(fp).filter(x => !k.includes(x)); if (other.length) console.log('  CARD_OTHER_KEYS ' + other.join(',')); }
  if (body.formProposals && body.formProposals.length > 1) console.log('  N_PROPOSALS ' + body.formProposals.length);
  for (const k of Object.keys(body)) if (!['content','citations','coverage','recommendedVideoIds','turnId','formProposal','formProposals'].includes(k)) console.log('  ' + k + ' ' + mask(JSON.stringify(body[k])).slice(0, 400));
  console.log('  REPLY: ' + mask(body.content || r.body).slice(0, 1500).replace(/\n+/g, ' ⏎ '));
  console.log('  CITES ' + mask(JSON.stringify((body.citations || []).map(c => c.title || c.documentTitle || c.source || '').slice(0, 3))));
  await page.waitForTimeout(1500);
  let conv = process.env.CONV || ''; if (!conv) { try { conv = (await page.evaluate(async () => (await fetch('/api/chat/conversations')).json())).conversations[0].id; } catch (e) {} }
  fs.writeFileSync(path.join(__dirname, '..', 'resp', `loop6-${tag}-${t0.toISOString().slice(11,19).replace(/:/g,'')}Z.json`), mask(r.body));
  console.log('CONV', conv, '| FORM_WRITES_ABORTED', JSON.stringify(writes));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
