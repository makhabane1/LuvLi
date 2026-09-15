export default async function run(page, ui) {
  await page.context().clearCookies();
  await page.goto('http://127.0.0.1:8099/signup.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const out = await page.evaluate(`(function(){
    var r = { scripts: document.scripts.length };
    try { r.Auth = typeof Auth; } catch(e) { r.Auth = 'THROW'; }
    try { r.Storage = typeof Storage; } catch(e) { r.Storage = 'THROW'; }
    try { r.storageHasGet = typeof Storage.get; } catch(e) { r.storageHasGet = 'THROW'; }
    try { r.signupForm = !!document.getElementById('signupForm'); } catch(e) {}
    return r;
  })()`);

  // Now actually try to drive the real form end-to-end.
  await page.fill('#suName', 'Nelisiwe Makhabane');
  await page.fill('#suEmail', 'neli@example.com');
  await page.fill('#suPassword', 'Luvli2026!');
  await page.fill('#suConfirm', 'Luvli2026!');
  await page.click('.auth-check .box');
  await page.click('#signupBtn');
  await page.waitForTimeout(2600);

  out.afterSubmit = await page.evaluate(() => ({
    success: !document.getElementById('signupSuccess').hidden,
    onboarding: !document.getElementById('onboarding').hidden,
    signedIn: (function () {
      try { return Auth.isSignedIn(); } catch (e) { return 'THROW:' + e.message; }
    })()
  }));
  return out;
}
