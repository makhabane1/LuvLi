export default async function run(page, ui) {
  await page.goto('http://127.0.0.1:8099/signup.html?probe2=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  // Bare references (lexical globals), evaluated in the page's global scope.
  const out = await page.evaluate(`(function(){
    var r = {};
    try { r.Auth = typeof Auth; } catch(e) { r.Auth = 'THROW:' + e.message; }
    try { r.Storage = typeof Storage; } catch(e) { r.Storage = 'THROW:' + e.message; }
    try { r.ico = typeof ico; } catch(e) { r.ico = 'THROW:' + e.message; }
    try { r.AuthUI = typeof AuthUI; } catch(e) { r.AuthUI = 'THROW:' + e.message; }
    try { r.Utils = typeof Utils; } catch(e) { r.Utils = 'THROW:' + e.message; }
    return r;
  })()`);
  return out;
}
