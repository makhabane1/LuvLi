export default async function run(page, ui) {
  await page.goto('http://127.0.0.1:8099/signup.html?v=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const probe = await page.evaluate(async () => {
    const out = {
      hasAuth: typeof Auth, hasStorage: typeof Storage, hasCrypto: typeof crypto,
      hasSubtle: !!(crypto && crypto.subtle), hasEncoder: typeof TextEncoder
    };
    try {
      const res = await Auth.signUp({
        name: 'Test User', email: 'test@example.com',
        password: 'Luvli2026!', confirm: 'Luvli2026!'
      }, { remember: true });
      out.result = res;
    } catch (err) {
      out.threw = String(err && err.message ? err.message : err);
    }
    return out;
  });
  return probe;
}
