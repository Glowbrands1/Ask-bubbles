// usage: node formchat.js <tag> "<turn1>" ["<turn2>" ...]   placeholders {A} {B} = the two drafts' employee names
// One new chat. Guard: any /api/chat request whose activeFormInstanceId is not A or B is ABORTED;
// any /api/forms/instances write to another id is ABORTED. Never clicks any button.
// Also prints formOpened / formUpdate and lets env EXPECT_OPEN=<id> stop the run if a different form opens.
const fs = require('fs'), path = require('path');
const { login, BASE } = require('./common');
const { send } = require('./lib2');
const A = 'a3e11f25-54d8-599c-9b3b-b60bb2bb913d', B = 'b5443119-712d-59c4-b640-36b7651564e3';
(async () => {
  const [tag, ...turns] = process.argv.slice(2);
  const { browser, page } = await login();
  const names = await page.evaluate(async ([a, b]) => { const g = async id => (await (await fetch('/api/forms/instances/' + id)).json()).instance.employeeName; return [await g(a), await g(b)]; }, [A, B]);
  const parts = [...new Set(names.flatMap((n, i) => [[n, i ? 'Employee B*' : 'Employee A*'], ...n.split(/\s+/).filter(w => w.length > 2).map(w => [w, i ? 'Employee B*' : 'Employee A*'])]).map(JSON.stringify))].map(JSON.parse).sort((x, y) => y[0].length - x[0].length);
  const mask = s => parts.reduce((t, [n, l]) => t.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), l), String(s));
  const blocked = [], writes = [];
  await page.route('**/api/chat', async route => {
    const req = route.request();
    if (req.method() === 'POST') { let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch (e) {}
      const act = b.activeFormInstanceId; console.log('REQ activeFormInstanceId=' + (act === A ? 'A' : act === B ? 'B' : act ? 'OTHER' : 'none') + (b.activeFormCandidateIds ? ' candidates=' + b.activeFormCandidateIds.length : ''));
      if (act && act !== A && act !== B) { blocked.push('chat for other form'); return route.abort(); } }
    return route.continue();
  });
  await page.route('**/api/forms/instances/**', async route => {
    const req = route.request(); const u = new URL(req.url());
    if (req.method() !== 'GET') { const id = (u.pathname.match(/instances\/([0-9a-f-]{36})/) || [])[1]; writes.push(req.method() + ' ' + (id === A ? 'A' : id === B ? 'B' : id || 'new') + u.pathname.replace(/.*[0-9a-f-]{36}/, ''));
      if (id !== A && id !== B) { blocked.push('write to other/new form'); return route.abort(); } }
    return route.continue();
  });
  await page.goto(BASE + (process.env.CONV ? '/chat?c=' + process.env.CONV : '/')); await page.waitForLoadState('networkidle'); await page.waitForTimeout(3000);
  let i = 0;
  for (const raw of turns) {
    i++; const text = raw.replace('{A}', names[0]).replace('{B}', names[1]);
    const t0 = new Date(); const r = await send(page, text); const secs = ((Date.now() - t0) / 1000).toFixed(1);
    let body = {}; try { body = JSON.parse(r.body).body || {}; } catch (e) {}
    const fo = body.formOpened, fu = body.formUpdate;
    const idl = id => id === A ? 'A' : id === B ? 'B' : id ? 'OTHER(' + id.slice(0, 8) + ')' : null;
    console.log(`TURN ${i} SENT ${t0.toISOString()} SECS ${secs} HTTP ${r.status} TEXT "${mask(text)}"`);
    console.log('  formOpened=' + (fo ? idl(fo.instanceId) + ' ' + fo.templateName : 'none') + ' | formUpdate=' + (fu ? idl(fu.instanceId) + ' updated=' + JSON.stringify(fu.updated) : 'none') + ' | formProposal=' + (body.formProposal ? body.formProposal.templateName : 'none') + ' | cites=' + (body.citations || []).length);
    console.log('  REPLY: ' + mask(body.content || r.body).slice(0, 1600).replace(/\n+/g, ' ⏎ '));
    fs.writeFileSync(path.join(__dirname, '..', 'resp', `fchat-${tag}-t${i}-${t0.toISOString().slice(11,19).replace(/:/g,'')}Z.json`), mask(r.body));
    if (process.env.EXPECT_OPEN && i === Number(process.env.EXPECT_TURN || 1) && (!fo || fo.instanceId !== process.env.EXPECT_OPEN)) { console.log('STOP: turn 1 did not open the expected form'); break; }
  }
  let conv = ''; try { conv = (await page.evaluate(async () => (await fetch('/api/chat/conversations')).json())).conversations[0].id; } catch (e) {}
  console.log('CONV', conv, '| FORM_WRITES', JSON.stringify(writes), '| BLOCKED', JSON.stringify(blocked));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
