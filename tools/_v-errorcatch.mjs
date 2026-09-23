export default async function run(page, ui) {
  // Capture errors that happen during initial script execution.
  await page.addInitScript(() => {
    window.__luvliErrors = [];
    window.addEventListener('error', (e) => {
      window.__luvliErrors.push({
        msg: e.message,
        file: e.filename,
        line: e.lineno,
        col: e.colno
      });
    }, true);
    window.addEventListener('unhandledrejection', (e) => {
      window.__luvliErrors.push({ reject: String(e.reason) });
    });
  });

  await page.goto('http://127.0.0.1:8099/signup.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const out = await page.evaluate(() => ({
    errors: window.__luvliErrors,
    authType: typeof Auth,
    // Can we fetch and eval storage.js ourselves?
    scriptCount: document.scripts.length,
    lastScriptSrc: document.scripts[document.scripts.length - 1].src
  }));

  // Try executing the module sources by hand to see which one throws.
  const evalResult = await page.evaluate(async () => {
    const results = {};
    for (const f of ['js/icons.js', 'js/storage.js', 'js/auth.js', 'js/auth-ui.js']) {
      try {
        const text = await (await fetch(f)).text();
        new Function(text)();
        results[f] = 'ran ok';
      } catch (e) {
        results[f] = 'THREW: ' + e.message;
      }
    }
    return results;
  });

  return { out, evalResult };
}
