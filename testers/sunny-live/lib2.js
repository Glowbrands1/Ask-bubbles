const sleep = ms => new Promise(r => setTimeout(r, ms));
// Sends one message and waits until the POST /api/chat response body has fully arrived.
async function send(page, text) {
  const box = page.locator('textarea[aria-label="Ask Sunny a question"], textarea[placeholder^="Ask about policy"]').first();
  await box.waitFor({ timeout: 30000 });
  await box.fill(text);
  const respP = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/chat', { timeout: 300000 });
  await box.press('Enter');
  const res = await respP;
  const body = await res.text();          // resolves only when the stream ends
  await sleep(3000);                       // let the card render
  return { status: res.status(), body };
}
async function createDraft(page) {
  await page.getByRole('button', { name: 'Create draft' }).first().click(); // ONCE
  await page.getByText('Save changes').first().waitFor({ timeout: 60000 });
  await sleep(25000);
}
module.exports = { send, createDraft, sleep };
