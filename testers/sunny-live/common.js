// Login helper. Credentials come only from env SUNNY_EMAIL / SUNNY_PASSWORD (never written to disk).
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'https://ask-sunny.vercel.app';
async function login() {
  if (!process.env.SUNNY_EMAIL || !process.env.SUNNY_PASSWORD) throw new Error('SUNNY_EMAIL / SUNNY_PASSWORD not set');
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  await page.goto(BASE + '/login');
  await page.fill('#login-email', process.env.SUNNY_EMAIL);
  await page.fill('#login-password', process.env.SUNNY_PASSWORD);
  await page.press('#login-password', 'Enter');
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30000 });
  return { browser, context, page, BASE };
}
function masker() {
  const pairs = (process.env.MASKS || '').split(';').filter(Boolean).map(p => p.split('='));
  return s => pairs.reduce((acc, [real, fake]) => real ? acc.split(real).join(fake) : acc, String(s));
}
function stamp() { return new Date().toISOString().slice(11, 19).replace(/:/g, ''); }
module.exports = { login, masker, stamp, BASE };
