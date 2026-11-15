// usage: MASKS="Real=Employee A" node turn.js <round> <tag> "<text>" [convId] [--create]
const fs = require('fs'), path = require('path');
const { login, masker, stamp } = require('./common');
const { send, createDraft } = require('./lib2');
(async () => {
  const [round, tag, text, convArg] = process.argv.slice(2);
  const doCreate = process.argv.includes('--create');
  const conv = convArg && convArg.startsWith('conv_') ? convArg : null;
  const mask = masker();
  const dir = path.join(__dirname, '..', `${round}-bodies`); fs.mkdirSync(dir, { recursive: true });
  const { browser, page, BASE } = await login();
  const saved = []; const draftIds = new Set();
  page.on('response', async res => {
    try {
      const u = new URL(res.url());
      const d = u.pathname.match(/^\/api\/forms\/instances\/([^/]+)\/draft/); if (d) draftIds.add(d[1]);
    } catch (e) {}
  });
  await page.goto(BASE + (conv ? `/chat?c=${conv}` : '/')); await page.waitForLoadState('networkidle');
  const startUtc = new Date();
  var t0 = Date.now();
  const r = await send(page, text);
  const replyUtc = new Date();
  const f = path.join(dir, `${round}-${tag}-${stamp()}Z.json`);
  fs.writeFileSync(f, mask(r.body)); saved.push({ f, status: r.status, bytes: r.body.length });
  console.log('REPLY_UTC', replyUtc.toISOString());
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const url = page.url();
  const msgs = await page.locator('main').innerText();
  console.log('START_UTC', startUtc.toISOString(), 'CENTRAL', startUtc.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  console.log('ELAPSED_S', secs, 'URL', mask(url));
  try {
    const j = await page.evaluate(async () => (await fetch('/api/chat/conversations')).json());
    const c = j.conversations[0];
    console.log('CONV', c.id, c.messages.length + ' msgs', mask(c.messages[0].content).slice(0, 60));
  } catch (e) { console.log('CONV lookup failed', e.message); }
  console.log('--- page tail (masked) ---\n' + mask(msgs).slice(-3500));
  if (doCreate) { await createDraft(page); console.log('DRAFT_IDS', [...draftIds].join(',') || 'none'); }
  await new Promise(r => setTimeout(r, 1000));
  console.log('SAVED', JSON.stringify(saved));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
